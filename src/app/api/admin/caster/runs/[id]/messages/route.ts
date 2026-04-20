// Caster 대화 SSE 엔드포인트.
//
// 흐름:
//   1) user_msg 이벤트 기록
//   2) 현재 누적 드래프트(run.draftJson) 와 과거 대화를 system/history 로 구성
//   3) Google 검색 그라운딩을 켠 streamCaster 호출
//   4) 델타 텍스트 / 검색 쿼리 / 소스 링크를 SSE 로 중계
//   5) 응답 종료 후 <patch> 추출 → 드래프트 병합 → DB 저장, patch 이벤트로 최종 드래프트 전송
//
// SSE 이벤트:
//   delta           { text }
//   search          { queries: string[] }
//   sources         { sources: {uri,title,domain}[] }
//   source_image    { uri, image }              # OG 이미지 fetch 완료 시 (세션 전용, DB 저장 X)
//   patch           { patch, draft }            # 누적된 전체 드래프트
//   choices         { choices: string[] }       # 버튼 UI 용 2~4 옵션 (있을 때만)
//   error           { message }
//   done            { ok }
//
// body 는 { content } 또는 { content, imageRef } 둘 다 받는다.
// imageRef 가 붙으면 해당 이미지 바이트를 현재 유저 턴에 inlineData 로 얹어
// Gemini 에 멀티모달로 전달한다. 이미지는 DB 에 저장하지 않는다.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";
import { sseStream } from "@/lib/sse";
import { MODELS, GEMINI_MODELS, classifyUpstreamError } from "@/lib/gemini/client";
import {
  CASTER_SYSTEM,
  extractPatch,
  extractChoices,
  stripHallucinatedTags,
  mergePatch,
  emptyDraft,
  renderDraftForPrompt,
  extractLegacyDraft,
  computeServerCompletion,
  decideCompletionGate,
  renderCompletionGate,
  type CasterDraft,
} from "@/lib/caster/prompt";
import {
  streamCaster,
  type CasterHistoryTurn,
  type CasterSource,
  type CasterContentPart,
} from "@/lib/caster/stream";
import { fetchOgImage, fetchInlineImage } from "@/lib/caster/enrich";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BodySchema = z.object({
  content: z.string().min(1).max(4000),
  /**
   * 관리자가 검색 썸네일 중 하나를 "이 느낌" 이라고 확정했을 때 붙는 레퍼런스.
   *   - image: OG 이미지 URL (UI 가 보여준 썸네일 원본)
   *   - uri: 검색 소스 페이지 URL
   *   - title, domain: 메타데이터
   * 서버는 image 를 fetch → 인라인 바이트로 Gemini 에 함께 전달한다.
   * DB 엔 content 만 저장 (imageRef 자체는 저장하지 않음).
   */
  imageRef: z
    .object({
      uri: z.string(),
      image: z.string(),
      title: z.string().optional(),
      domain: z.string().optional(),
    })
    .nullish(),
  /**
   * 에러 배너의 "다시 보내기" 에서 true. 이전 POST 가 중간에 끊겼다는 뜻.
   * user_msg 이벤트는 이미 DB 에 박혀 있을 수 있으므로, latest event 가
   * 동일 content 의 user_msg 면 재삽입을 skip 한다 — 안 그러면 대화 기록에
   * 같은 메시지가 두 번 찍혀서 Gemini 히스토리가 이상해진다.
   */
  retry: z.boolean().optional(),
});

function normalizeDraft(raw: unknown): CasterDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const merged = mergePatch(emptyDraft(), raw as never);
  return merged;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const run = await prisma.casterRun.findFirst({
    where: { id, adminUserId: guard.userId },
    select: { id: true, status: true, draftJson: true, coverage: true },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.status === "saved" || run.status === "cancelled") {
    return NextResponse.json({ error: "run_closed" }, { status: 409 });
  }

  // coverage.meta.lastAskedAtTurn — 완료 게이트에서 "이미 한 번 확인요청 했나?"
  // 를 판정하는 근거. 매 턴 최신화된다. coverage 필드는 Json? 이라 free-form.
  const coverageMeta =
    (run.coverage as { meta?: { lastAskedAtTurn?: number | null } } | null)?.meta ?? {};
  const lastAskedAtTurn: number | null =
    typeof coverageMeta.lastAskedAtTurn === "number"
      ? coverageMeta.lastAskedAtTurn
      : null;

  // user_msg 기록 (imageRef 는 DB 에 저장하지 않는다 — 텍스트만 남긴다).
  // retry=true 이면 이미 같은 content 의 user_msg 가 바로 전에 박혀 있는지
  // 확인해서, 있으면 중복 insert 를 skip. 이 가드가 없으면 "503 → 다시보내기"
  // 한 번 할 때마다 history 에 같은 유저 턴이 쌓인다.
  if (parsed.data.retry) {
    const latest = await prisma.casterEvent.findFirst({
      where: { runId: run.id },
      orderBy: { createdAt: "desc" },
      select: { kind: true, payload: true },
    });
    const latestContent =
      (latest?.payload as { content?: string } | null)?.content ?? "";
    const alreadyLogged =
      latest?.kind === "user_msg" && latestContent === parsed.data.content;
    if (!alreadyLogged) {
      await prisma.casterEvent.create({
        data: {
          id: newId(),
          runId: run.id,
          kind: "user_msg",
          payload: { content: parsed.data.content },
        },
      });
    }
  } else {
    await prisma.casterEvent.create({
      data: {
        id: newId(),
        runId: run.id,
        kind: "user_msg",
        payload: { content: parsed.data.content },
      },
    });
  }

  // 과거 대화 → 멀티모달 parts 배열로
  const events = await prisma.casterEvent.findMany({
    where: { runId: run.id, kind: { in: ["user_msg", "model_msg"] } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, payload: true },
  });

  const history: CasterHistoryTurn[] = events.map((e) => {
    const text =
      (e.payload as { content?: string; body?: string })?.body ??
      (e.payload as { content?: string })?.content ??
      "";
    return {
      role: e.kind === "user_msg" ? "user" : "model",
      parts: [{ text }] as CasterContentPart[],
    };
  });

  // imageRef 가 있으면 마지막 유저 턴에 이미지 바이트 + 메타 텍스트를 추가.
  // 이미지는 현재 턴에만 인라인 — 과거 턴에는 텍스트 요약만 남는다.
  if (parsed.data.imageRef) {
    const ref = parsed.data.imageRef;
    const last = history[history.length - 1];
    if (last?.role === "user") {
      const metaText =
        `\n\n[첨부 레퍼런스 메타]\n` +
        `- 제목: ${ref.title ?? "(없음)"}\n` +
        `- 도메인: ${ref.domain ?? "(없음)"}\n` +
        `- 원본 URL: ${ref.uri}\n` +
        `- 이미지 URL: ${ref.image}`;
      last.parts.push({ text: metaText });
      try {
        const inline = await fetchInlineImage(ref.image);
        if (inline) {
          last.parts.push({ inlineData: inline });
        } else {
          last.parts.push({
            text: "\n(주의: 이미지 로드 실패. 제목/도메인/URL 메타만 보고 최대한 유추하라.)",
          });
        }
      } catch {
        last.parts.push({
          text: "\n(주의: 이미지 로드 실패. 제목/도메인/URL 메타만 보고 최대한 유추하라.)",
        });
      }
    }
  }

  // 누적 드래프트 → systemInstruction 에 주입해 모델이 이미 아는 것은 건너뛰게.
  // 완료 게이트도 함께 주입 — 100% 도달 시 모델이 "커밋할까?" 한 번만 묻도록.
  const currentDraft = normalizeDraft(run.draftJson);
  const pct = computeServerCompletion(currentDraft);
  // 이번 턴 user_msg 포함한 누적 사용자 턴 수 (방금 위에서 create 한 것까지 포함).
  const userTurnCount = events.filter((e) => e.kind === "user_msg").length;
  const gateState = decideCompletionGate({
    pct,
    userTurnCount,
    lastAskedAtTurn,
  });
  const systemInstruction =
    CASTER_SYSTEM +
    "\n\n[현재 드래프트]\n" +
    renderDraftForPrompt(currentDraft) +
    "\n\n" +
    renderCompletionGate(gateState, pct);

  return sseStream(async (send) => {
    let full = "";
    const searchQueries: string[] = [];
    const sourcesAcc: CasterSource[] = [];
    const ogPromises: Promise<void>[] = [];
    const seenOgUris = new Set<string>();
    // OG 이미지 결과를 uri → image URL 로 모아둔다. DB 저장 시 sources 에 병합.
    const ogImages = new Map<string, string>();

    const startOgFetch = (sources: CasterSource[]) => {
      for (const s of sources) {
        if (seenOgUris.has(s.uri)) continue;
        seenOgUris.add(s.uri);
        ogPromises.push(
          fetchOgImage(s.uri).then((image) => {
            if (image) {
              ogImages.set(s.uri, image);
              send("source_image", { uri: s.uri, image });
            }
          }),
        );
      }
    };

    let finishReason: string | undefined;
    let blocked = false;
    let safetyCategories: string[] | undefined;

    try {
      for await (const ev of streamCaster({
        model: MODELS.chat,
        // chat (gemini-3-flash-preview) 이 503 을 뱉으면 한 번만 chatFallback
        // (gemini-3.1-flash-lite-preview) 으로 강등. 프리뷰 채널이 과부하에
        // 자주 걸리는데 Caster 는 재시도 UI 가 어색하므로 서버에서 투명하게 흡수.
        modelFallback: GEMINI_MODELS.chatFallback,
        systemInstruction,
        history,
        enableSearch: true,
        // 외형·말투·세계관 같은 크리에이티브 탐색에서 넓게 펼치도록 고온.
        // 안전 필터는 streamCaster 쪽에서 BLOCK_NONE × 4 로 걸어놨다.
        temperature: 1.5,
        maxOutputTokens: 2048,
      })) {
        if (ev.type === "text") {
          full += ev.text;
          send("delta", { text: ev.text });
        } else if (ev.type === "search_queries") {
          searchQueries.push(...ev.queries);
          send("search", { queries: ev.queries });
        } else if (ev.type === "sources") {
          sourcesAcc.push(...ev.sources);
          send("sources", { sources: ev.sources });
          // OG 이미지는 비동기로 각자 fetch → 완료 순서대로 emit.
          // 저장은 하지 않는다 (DB 에는 소스 URL 만 남는다).
          startOgFetch(ev.sources);
        } else if (ev.type === "finish") {
          finishReason = ev.reason;
          blocked = !!ev.blocked;
          safetyCategories = ev.safetyCategories;
        }
      }
    } catch (err) {
      // 업스트림(Gemini) 에러 분류 — 상태 코드까지 메시지에 포함해 UI 에 보낸다.
      const classified = classifyUpstreamError(err);
      const raw = err instanceof Error ? err.message : String(err);
      console.error(
        `[caster] stream error kind=${classified.kind} status=${classified.status ?? "?"} raw="${raw.slice(0, 200)}"`,
        err,
      );
      send("error", { message: classified.message, kind: classified.kind });
      return;
    }

    // <patch> / <choices> 추출 — 본문은 둘 다 뺀 깨끗한 텍스트.
    const { body: afterPatch, patch: patchBlock } = extractPatch(full);
    const patch = patchBlock ?? extractLegacyDraft(full);
    const bodyAfterPatch = patchBlock ? afterPatch : full;
    const { body: bodyAfterChoices, choices } = extractChoices(bodyAfterPatch);
    // Caster 가 환각으로 만들어 낸 <image search>, <search>, <tool> 등
    // 가짜 태그는 UI 를 망치므로 저장 전에 제거.
    const visibleBody = stripHallucinatedTags(bodyAfterChoices);

    // === 빈 응답 방어 ===
    // Gemini 가 본문 없이 <patch> 만 뱉었거나 아예 0 바이트로 끝났을 때의 처리.
    // - 본문이 비었는데 patch 가 있으면 → 중립 본문을 채워 대화를 이어가게 한다.
    // - 본문도 patch 도 비었으면 → DB 저장 안 하고 error 이벤트로 클라에 알린다.
    let savedBody = visibleBody;
    if (!savedBody.trim() && patch) {
      savedBody = "반영했어. 다음 주제로 넘어가자 — 어디부터 이어갈까?";
      send("delta", { text: savedBody });
    }

    const isEmpty = !savedBody.trim() && !patch;
    console.log("[caster] turn done", {
      runId: run.id,
      fullLen: full.length,
      bodyLen: savedBody.length,
      hasPatch: !!patch,
      choicesLen: choices.length,
      finishReason,
      blocked,
      safetyCategories,
    });

    if (isEmpty) {
      const hint =
        blocked && safetyCategories?.length
          ? `안전 필터로 차단됐어요 (${safetyCategories.join(", ")}). 표현을 바꿔 다시 시도해 주세요.`
          : blocked
            ? `응답이 차단됐어요 (${finishReason ?? "unknown"}). 표현을 바꿔 다시 시도해 주세요.`
            : `응답이 비어 있어요 (finishReason=${finishReason ?? "none"}). 다시 시도해 주세요.`;
      send("error", { message: hint });
      send("done", { ok: false });
      return;
    }

    // OG 이미지 fetch 가 얼마나 끝났는지는 Gemini 스트림이 끝난 시점에 따라
    // 다르다. Gemini 가 먼저 끝났으면 여기서 잠깐 기다려 주면 남은 이미지도
    // DB 에 포함되고, 거의 끝나 있으면 즉시 통과. (개별 fetch 는 5s 캡)
    await Promise.allSettled(ogPromises);

    // OG 이미지 URL 을 sources 배열에 병합해 DB 에 저장 — 나중에 이 런을
    // 다시 열었을 때 썸네일이 재생된다. 이미지 바이트는 여전히 저장 X,
    // URL 만 남기므로 원본 서버에서 다시 로드된다.
    const sourcesForDb: CasterSource[] = sourcesAcc.map((s) => {
      const img = ogImages.get(s.uri);
      return img ? { ...s, image: img } : s;
    });

    // model_msg 이벤트 — content 에는 유저가 볼 본문을 저장하고,
    // 원본과 부수 메타(검색 쿼리/소스/선택지)는 payload 에 함께 남긴다.
    await prisma.casterEvent.create({
      data: {
        id: newId(),
        runId: run.id,
        kind: "model_msg",
        payload: {
          body: savedBody,
          content: savedBody, // back-compat
          fullText: full,
          searchQueries,
          sources: sourcesForDb,
          choices,
          finishReason,
        } as unknown as object,
      },
    });

    if (choices.length > 0) {
      send("choices", { choices });
    }

    // 드래프트 갱신.
    // imageRef 가 이번 턴에 붙어 있었다면 서버가 referenceImage 를 직접 주입한다
    // (모델이 <patch> 에 빠뜨려도 UI 에 프리뷰가 남도록).
    const imagePatch: typeof patch = parsed.data.imageRef
      ? {
          referenceImage: {
            url: parsed.data.imageRef.image,
            sourceUri: parsed.data.imageRef.uri,
            title: parsed.data.imageRef.title ?? null,
            domain: parsed.data.imageRef.domain ?? null,
          },
        }
      : null;

    const effectivePatch =
      patch && imagePatch
        ? { ...patch, referenceImage: imagePatch.referenceImage }
        : (patch ?? imagePatch);

    if (effectivePatch) {
      const nextDraft = mergePatch(currentDraft, effectivePatch);
      // 이번 턴이 "확인요청" 이었으면 coverage.meta.lastAskedAtTurn 을 현재 사용자
      // 턴 인덱스로 박아둔다. 다음 턴에서 decideCompletionGate 가 "패스" 로 읽는다.
      const nextCoverage: Record<string, unknown> = {
        ...((run.coverage as Record<string, unknown> | null) ?? {}),
        meta: {
          ...coverageMeta,
          ...(gateState === "확인요청" ? { lastAskedAtTurn: userTurnCount } : {}),
        },
      };
      await prisma.casterRun.update({
        where: { id: run.id },
        data: {
          draftJson: nextDraft as unknown as object,
          status: "draft_ready",
          coverage: nextCoverage as unknown as object,
        },
      });
      send("patch", { patch: effectivePatch, draft: nextDraft });
    } else if (gateState === "확인요청") {
      // patch 가 없어도(= 모델이 그냥 확인 문구만 보냄) meta 는 갱신해야
      // 같은 확인을 다시 묻지 않는다.
      const nextCoverage: Record<string, unknown> = {
        ...((run.coverage as Record<string, unknown> | null) ?? {}),
        meta: {
          ...coverageMeta,
          lastAskedAtTurn: userTurnCount,
        },
      };
      await prisma.casterRun.update({
        where: { id: run.id },
        data: { coverage: nextCoverage as unknown as object },
      });
    }

    send("done", { ok: true });
  });
}
