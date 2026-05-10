import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, errorJson } from "@/lib/api-utils";
import { newId } from "@/lib/ids";
import { buildSystemInstruction, streamChat } from "@/lib/gemini/chat";
import { classifyUpstreamError } from "@/lib/gemini/client";
import { sseStream } from "@/lib/sse";
import { retrieveForPrompt } from "@/lib/rag/retrieve";
import { extractStatus } from "@/lib/narration";
import {
  pickBestAsset,
  spotBodyTokens,
  statusToTokens,
  stripImageTags,
  type PickableAsset,
} from "@/lib/assets/pickAsset";
import {
  pickBestBackground,
  type PickableBackground,
} from "@/lib/assets/pickBackground";
import { buildTemporalContext } from "@/lib/temporal/timeline";
import { planTurnPolicy } from "@/lib/policy/planner";
import { writeClosedEpisodeMemory } from "@/lib/memory/episode";
import { rollupRelationSummary } from "@/lib/memory/relation";
import { splitAssistantMessage } from "@/lib/conversation/assistantSplit";
import {
  detectNewsTrigger,
  saveRealtimeNewsChunk,
  searchRealtimeNews,
} from "@/lib/news/realtime";
import { elapsedMs, logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  content: z.string().trim().min(1).max(4000),
});

// GET: 세션 메시지 히스토리
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: { userId: true },
  });
  if (!session || session.userId !== gate.userId) return errorJson("not_found", 404);

  const rows = await prisma.message.findMany({
    where: { sessionId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: {
      imageAsset: {
        select: { id: true, blobUrl: true, width: true, height: true },
      },
    },
  });
  return NextResponse.json(
    rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      image: m.imageAsset
        ? {
            url: m.imageAsset.blobUrl,
            width: m.imageAsset.width,
            height: m.imageAsset.height,
          }
        : null,
    }))
  );
}

// POST: SSE 스트리밍 응답
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);

  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      character: {
        include: {
          config: true,
          personaCore: true,
        },
      },
    },
  });
  if (!session || session.userId !== gate.userId) return errorJson("not_found", 404);
  if (!session.character.config) return errorJson("character_misconfigured", 500);
  if (!session.character.personaCore) return errorJson("persona_missing", 500);

  const previousMessageCount = await prisma.message.count({
    where: { sessionId: id },
  });
  const cfg = session.character.config;
  const core = session.character.personaCore;
  const temporal = buildTemporalContext({
    lastInteractionAt: previousMessageCount > 0 ? session.lastMessageAt : null,
    character: {
      slug: session.character.slug,
      role: core.role,
    },
  });

  if (previousMessageCount > 0 && temporal.shouldClosePreviousEpisode) {
    const previousMessages = await prisma.message.findMany({
      where: { sessionId: id, role: { in: ["user", "model"] } },
      orderBy: { createdAt: "asc" },
      take: 80,
    });
    const episodeResult = await writeClosedEpisodeMemory({
      sessionId: id,
      userId: gate.userId,
      characterId: session.characterId,
      characterName: core.displayName,
      temporal,
      messages: previousMessages,
    }).catch((e) => {
      console.warn(
        "[episode] close failed:",
        e instanceof Error ? e.message : String(e),
      );
      return { created: false };
    });
    if (episodeResult.created) {
      await rollupRelationSummary({
        userId: gate.userId,
        characterId: session.characterId,
        characterName: core.displayName,
        temporal,
      }).catch((e) => {
        console.warn(
          "[relation] rollup failed:",
          e instanceof Error ? e.message : String(e),
        );
      });
    }
  }

  // 1. 유저 메시지 저장
  // Save user input before retrieval and realtime lookup.
  await prisma.message.create({
    data: {
      id: newId(),
      sessionId: id,
      role: "user",
      content: parsed.data.content,
    },
  });

  // 2. 최근 히스토리 로드 (최대 20턴)
  const interests = await prisma.characterInterest.findMany({
    where: { characterId: session.characterId, enabled: true },
    orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
    take: 12,
    select: { label: true, query: true, freshnessHours: true },
  });
  const newsTrigger = detectNewsTrigger({
    message: parsed.data.content,
    characterName: core.displayName,
    interests,
  });
  if (newsTrigger.shouldSearch) {
    const cached = await prisma.knowledgeChunk.findFirst({
      where: {
        characterId: session.characterId,
        type: "external_info",
        metadata: { path: ["topic"], equals: newsTrigger.query },
      },
      orderBy: { createdAt: "desc" },
      select: { metadata: true },
    });
    const expiresAt =
      cached?.metadata &&
      typeof cached.metadata === "object" &&
      "expiresAt" in cached.metadata
        ? new Date(String((cached.metadata as Record<string, unknown>).expiresAt))
        : null;
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      const startedAt = performance.now();
      const found = await searchRealtimeNews({
        query: newsTrigger.query,
        characterName: core.displayName,
        nowLabel: temporal.localLabel,
      }).catch((e) => {
        console.warn(
          "[realtime-news] lookup failed:",
          e instanceof Error ? e.message : String(e),
        );
        return null;
      });
      await logEvent({
        level: found ? "info" : "warn",
        event: found ? "news.search.completed" : "news.search.failed",
        sessionId: id,
        userId: gate.userId,
        characterId: session.characterId,
        latencyMs: elapsedMs(startedAt),
        metadata: { query: newsTrigger.query, reason: newsTrigger.reason },
      });
      if (found?.summary) {
        await saveRealtimeNewsChunk({
          characterId: session.characterId,
          userId: gate.userId,
          sessionId: id,
          topic: newsTrigger.query,
          summary: found.summary,
          sourceUrls: found.sourceUrls,
          raw: found.raw,
          ttlHours: interests[0]?.freshnessHours ?? 24,
        }).catch((e) => {
          console.warn(
            "[realtime-news] save failed:",
            e instanceof Error ? e.message : String(e),
          );
        });
      }
    }
  }

  const history = await prisma.message.findMany({
    where: { sessionId: id, role: { in: ["user", "model"] } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  // 3. PersonaState — (user × character). Phase A 에서는 없어도 된다(composer 가 defaults 주입).
  const stateRow = await prisma.personaState.findUnique({
    where: {
      userId_characterId: {
        userId: gate.userId,
        characterId: session.characterId,
      },
    },
  });

  // 4. RAG 검색 — raw SQL + pgvector cosine. 유저 쿼리 기준으로 의미 유사 청크를 뽑는다.
  //    임베딩 실패 시 ordinal 폴백. userId 귀속 episode 와 relation_summary 포함.
  const retrieved = await retrieveForPrompt({
    query: parsed.data.content,
    characterId: session.characterId,
    userId: gate.userId,
  });

  // 4b. gallery 에셋 목록 (이미지 트리거 매칭용). 없으면 LLM 에 이미지 표현 블록을 넣지 않는다.
  const galleryAssets: PickableAsset[] = await prisma.asset.findMany({
    where: { characterId: session.characterId, kind: "gallery" },
    select: {
      id: true,
      blobUrl: true,
      width: true,
      height: true,
      sceneTag: true,
      expression: true,
      composition: true,
      pose: true,
      clothingTag: true,
      moodFit: true,
      locationFit: true,
      nsfwLevel: true,
      description: true,
      triggerTags: true,
      kind: true,
    },
  });

  // 4c. background 에셋 목록 (RoomBackdrop 레이어 소스). kind="background" 전용.
  //     인물 없는 환경 컷 — location/mood 로만 스코어링.
  const backgroundAssets: PickableBackground[] = await prisma.asset.findMany({
    where: { characterId: session.characterId, kind: "background" },
    select: {
      id: true,
      blobUrl: true,
      width: true,
      height: true,
      moodFit: true,
      locationFit: true,
      triggerTags: true,
      description: true,
    },
  });

  const coreSnap = {
    displayName: core.displayName,
    aliases: core.aliases,
    pronouns: core.pronouns,
    ageText: core.ageText,
    gender: core.gender,
    species: core.species,
    role: core.role,
    backstorySummary: core.backstorySummary,
    worldContext: core.worldContext,
    coreBeliefs: core.coreBeliefs,
    coreMotivations: core.coreMotivations,
    fears: core.fears,
    redLines: core.redLines,
    speechRegister: core.speechRegister,
    speechEndings: core.speechEndings,
    speechRhythm: core.speechRhythm,
    speechQuirks: core.speechQuirks,
    languageNotes: core.languageNotes,
    appearanceKeys: core.appearanceKeys,
    defaultAffection: core.defaultAffection,
    defaultTrust: core.defaultTrust,
    defaultStage: core.defaultStage,
    defaultMood: core.defaultMood,
    defaultEnergy: core.defaultEnergy,
    defaultStress: core.defaultStress,
    defaultStability: core.defaultStability,
    behaviorPatterns: (core.behaviorPatterns ?? null) as never,
  };
  const stateSnap = stateRow
    ? {
        affection: stateRow.affection,
        trust: stateRow.trust,
        tension: stateRow.tension,
        familiarity: stateRow.familiarity,
        stage: stateRow.stage,
        surfaceMood: stateRow.surfaceMood,
        innerMood: stateRow.innerMood,
        pendingEmotions: (stateRow.pendingEmotions ?? null) as never,
        statusPayload: stateRow.statusPayload ?? null,
        relationSummary: stateRow.relationSummary,
      }
    : null;
  const turnPolicy = planTurnPolicy({
    userMessage: parsed.data.content,
    temporal,
    core: coreSnap,
    state: stateSnap,
  });

  const systemInstruction = buildSystemInstruction({
    core: coreSnap,
    state: stateSnap,
    chunks: {
      knowledge: retrieved.knowledge,
      styleAnchors: retrieved.styleAnchors,
      episodes: retrieved.episodes,
      relationSummary: retrieved.relationSummary,
      externalInfo: retrieved.externalInfo,
    },
    statusPanelSchema: cfg.statusPanelSchema ?? null,
    sessionSummary: session.summary,
    temporal,
    turnPolicy,
    hasImageAssets: galleryAssets.length > 0,
  });

  return sseStream(async (send) => {
    await logEvent({
      event: "chat.request",
      sessionId: id,
      userId: gate.userId,
      characterId: session.characterId,
      metadata: { length: parsed.data.content.length },
    });
    // messageId 는 스트림 시작 전에 미리 정해 pickAsset 의 tie-break 해시 seed 로 사용.
    // 같은 status 가 반복되어도 메시지마다 결정적으로 다른 후보를 고를 수 있게 한다.
    const messageId = newId();

    // 수용 가능한 응답인지 — status 블록을 뺀 본문이 너무 짧거나 공백이면 block/empty 로 본다.
    const isAcceptable = (text: string): boolean => {
      const { body } = extractStatus(text);
      const clean = stripImageTags(body).replace(/\s+/g, " ").trim();
      return clean.length >= 5;
    };

    const runAttempt = async (): Promise<string> => {
      let acc = "";
      for await (const delta of streamChat({
        model: cfg.model,
        systemInstruction,
        history: history.map((m) => ({
          role: m.role as "user" | "model",
          content: m.content,
        })),
        temperature: cfg.temperature,
        topP: cfg.topP,
        topK: cfg.topK,
        maxOutputTokens: cfg.maxOutputTokens,
      })) {
        acc += delta;
      }
      return acc;
    };

    let full = "";
    try {
      const MAX_ATTEMPTS = 3; // 초기 + 재시도 2회
      const RETRY_BACKOFF_MS = [500, 1500]; // attempt 1 실패 → 500ms, 2 실패 → 1500ms
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const attemptStartedAt = performance.now();
          const out = await runAttempt();
          await logEvent({
            event: "chat.llm.completed",
            sessionId: id,
            userId: gate.userId,
            characterId: session.characterId,
            model: cfg.model,
            latencyMs: elapsedMs(attemptStartedAt),
            metadata: { attempt, outputLength: out.length },
          });
          if (isAcceptable(out)) {
            full = out;
            break;
          }
          lastErr = new Error("empty_or_blocked");
          if (attempt < MAX_ATTEMPTS) {
            console.warn(
              `[chat] attempt ${attempt} produced empty/blocked output, retrying`,
            );
            send("retry", { reason: "empty_or_blocked" });
            const wait = RETRY_BACKOFF_MS[attempt - 1] ?? 1500;
            await new Promise((r) => setTimeout(r, wait));
          } else {
            // 마지막 시도도 빈 응답이면 그대로 채택 (에러보다는 낫다)
            full = out;
          }
        } catch (err) {
          await logEvent({
            level: "warn",
            event: "chat.llm.failed",
            sessionId: id,
            userId: gate.userId,
            characterId: session.characterId,
            model: cfg.model,
            message: err instanceof Error ? err.message : String(err),
            metadata: { attempt },
          });
          lastErr = err;
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt < MAX_ATTEMPTS) {
            console.warn(
              `[chat] attempt ${attempt} threw: ${msg}, retrying`,
            );
            // 503/5xx 라면 사용자 친화 메시지로 치환
            const isUpstreamBusy = /5\d\d|overload|unavailable|503/i.test(msg);
            send("retry", {
              reason: isUpstreamBusy ? "upstream_busy" : msg,
            });
            const wait = RETRY_BACKOFF_MS[attempt - 1] ?? 1500;
            await new Promise((r) => setTimeout(r, wait));
          } else {
            throw err;
          }
        }
      }
      if (!full && lastErr) throw lastErr;

      // <status>{...}</status> 블록이 있으면 PersonaState.statusPayload 에 반영.
      // 파싱 실패는 무시 — 채팅 흐름을 막으면 안 된다.
      const { status, body } = extractStatus(full);

      // status 의 outfit/location/mood + 본문 한국어 키워드를 합쳐 Asset 토큰화.
      // body 스포팅은 장면 다양성 보정 — 같은 status 값 반복 시 본문에서 힌트를 추가로 끌어온다.
      let pickedAsset: PickableAsset | null = null;
      let pickedBackground: PickableBackground | null = null;
      if (status && typeof status === "object") {
        const statusTokens = statusToTokens(status);
        const bodyTokens = spotBodyTokens(body);
        const tokens = [...statusTokens, ...bodyTokens];
        if (tokens.length) {
          const s = status as Record<string, unknown>;
          const horny = typeof s.horny === "number" ? (s.horny as number) : null;
          const affection =
            typeof s.affection === "number" ? (s.affection as number) : null;
          if (galleryAssets.length) {
            pickedAsset = pickBestAsset(
              galleryAssets,
              tokens,
              {
                nsfwEnabled: session.character.nsfwEnabled,
                horny,
                affection,
              },
              { messageId },
            );
          }
          if (backgroundAssets.length) {
            // 배경은 세션 단위로 고정되는 느낌이 자연스러움 — tie-break seed 를 sessionId
            // 로 잡아 같은 장소 토큰이면 같은 사진을 고수하다가, 장소가 바뀔 때만 전환.
            pickedBackground = pickBestBackground(backgroundAssets, tokens, {
              seed: id,
            });
          }
        }
      }

      // 저장 전 본문에서 레거시 <img> 토큰 제거 (있을 경우 대비).
      const cleanContent = stripImageTags(full);

      const parts = splitAssistantMessage(cleanContent);
      const modelMessages = parts.length
        ? parts
        : [{ content: cleanContent, kind: "dialogue" as const }];
      const imageTargetIndex = pickedAsset
        ? Math.max(
            0,
            modelMessages.findLastIndex((part) => part.kind === "dialogue"),
          )
        : -1;
      const savedMessages: Array<{
        id: string;
        content: string;
        createdAt: Date;
        image: PickableAsset | null;
      }> = [];
      for (let i = 0; i < modelMessages.length; i++) {
        const part = modelMessages[i];
        const idForPart = i === 0 ? messageId : newId();
        const createdAt = new Date(Date.now() + i);
        const image = i === imageTargetIndex ? pickedAsset : null;
        await prisma.message.create({
          data: {
            id: idForPart,
            sessionId: id,
            role: "model",
            content: part.content,
            imageAssetId: image?.id ?? null,
            createdAt,
          },
        });
        savedMessages.push({
          id: idForPart,
          content: part.content,
          createdAt,
          image,
        });
      }
      await prisma.session.update({
        where: { id },
        data: { lastMessageAt: new Date() },
      });

      for (let i = 0; i < savedMessages.length; i++) {
        const msg = savedMessages[i];
        send("message_start", {
          id: msg.id,
          role: "model",
          createdAt: msg.createdAt.toISOString(),
        });
        send("message_delta", { id: msg.id, text: msg.content });
        if (msg.image) {
          send("image", {
            id: msg.id,
            url: msg.image.blobUrl,
            width: msg.image.width,
            height: msg.image.height,
          });
        }
        send("message_done", { id: msg.id });
        if (i < savedMessages.length - 1) {
          await new Promise((r) => setTimeout(r, 350));
        }
      }

      if (pickedBackground) {
        // RoomBackdrop 레이어가 크로스페이드할 수 있게 별도 이벤트로 보낸다.
        // 클라 쪽에서는 마지막 값만 유지하면 됨(같은 URL 이 반복되면 crossfade 생략).
        send("background_picked", {
          url: pickedBackground.blobUrl,
          width: pickedBackground.width,
          height: pickedBackground.height,
        });
      }

      if (status && typeof status === "object") {
        await prisma.personaState.upsert({
          where: {
            userId_characterId: {
              userId: gate.userId,
              characterId: session.characterId,
            },
          },
          update: { statusPayload: status as object },
          create: {
            id: newId(),
            userId: gate.userId,
            characterId: session.characterId,
            affection: core.defaultAffection,
            trust: core.defaultTrust,
            stage: core.defaultStage,
            statusPayload: status as object,
          },
        });
      }

      send("done", { ids: savedMessages.map((m) => m.id), id: savedMessages[0]?.id ?? messageId });
    } catch (err) {
      // 업스트림(Gemini) 에러를 사용자 친화적 메시지로 분류.
      // status/kind 는 서버 로그에만 남기고, 사용자에게는 상태 코드 포함된
      // 한글 문장만 내려간다 ("모델 서버가 잠시 혼잡해요 (503)" 같은 식).
      const classified = classifyUpstreamError(err);
      const raw = err instanceof Error ? err.message : String(err);
      console.error(
        `[chat] stream failed kind=${classified.kind} status=${classified.status ?? "?"} raw="${raw.slice(0, 200)}"`,
      );
      send("error", { message: classified.message, kind: classified.kind });
    }
  });
}
