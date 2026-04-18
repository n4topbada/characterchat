import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAuth, errorJson } from "@/lib/api-utils";
import { newId } from "@/lib/ids";
import { buildSystemInstruction, streamChat } from "@/lib/gemini/chat";
import { sseStream } from "@/lib/sse";
import { retrieveForPrompt } from "@/lib/rag/retrieve";
import { extractStatus } from "@/lib/narration";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  });
  return NextResponse.json(
    rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
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

  // 1. 유저 메시지 저장
  await prisma.message.create({
    data: {
      id: newId(),
      sessionId: id,
      role: "user",
      content: parsed.data.content,
    },
  });

  // 2. 최근 히스토리 로드 (최대 20턴)
  const history = await prisma.message.findMany({
    where: { sessionId: id, role: { in: ["user", "model"] } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  const cfg = session.character.config;
  const core = session.character.personaCore;

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

  const systemInstruction = buildSystemInstruction({
    core: {
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
    },
    state: stateRow
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
      : null,
    chunks: {
      knowledge: retrieved.knowledge,
      styleAnchors: retrieved.styleAnchors,
      episodes: retrieved.episodes,
      relationSummary: retrieved.relationSummary,
    },
    statusPanelSchema: cfg.statusPanelSchema ?? null,
    sessionSummary: session.summary,
  });

  return sseStream(async (send) => {
    let full = "";
    try {
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
        full += delta;
        send("delta", { text: delta });
      }
      const messageId = newId();
      await prisma.message.create({
        data: {
          id: messageId,
          sessionId: id,
          role: "model",
          content: full,
        },
      });
      await prisma.session.update({
        where: { id },
        data: { lastMessageAt: new Date() },
      });

      // <status>{...}</status> 블록이 있으면 PersonaState.statusPayload 에 반영.
      // 파싱 실패는 무시 — 채팅 흐름을 막으면 안 된다.
      const { status } = extractStatus(full);
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

      send("done", { id: messageId });
    } catch (err) {
      send("error", {
        message: err instanceof Error ? err.message : "stream_failed",
      });
    }
  });
}
