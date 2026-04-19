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
import { MODELS } from "@/lib/gemini/client";
import {
  CASTER_SYSTEM,
  extractPatch,
  mergePatch,
  emptyDraft,
  renderDraftForPrompt,
  extractLegacyDraft,
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
    select: { id: true, status: true, draftJson: true },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.status === "saved" || run.status === "cancelled") {
    return NextResponse.json({ error: "run_closed" }, { status: 409 });
  }

  // user_msg 기록 (imageRef 는 DB 에 저장하지 않는다 — 텍스트만 남긴다)
  await prisma.casterEvent.create({
    data: {
      id: newId(),
      runId: run.id,
      kind: "user_msg",
      payload: { content: parsed.data.content },
    },
  });

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

  // 누적 드래프트 → systemInstruction 에 주입해 모델이 이미 아는 것은 건너뛰게
  const currentDraft = normalizeDraft(run.draftJson);
  const systemInstruction =
    CASTER_SYSTEM +
    "\n\n[현재 드래프트]\n" +
    renderDraftForPrompt(currentDraft);

  return sseStream(async (send) => {
    let full = "";
    const searchQueries: string[] = [];
    const sourcesAcc: CasterSource[] = [];
    const ogPromises: Promise<void>[] = [];
    const seenOgUris = new Set<string>();

    const startOgFetch = (sources: CasterSource[]) => {
      for (const s of sources) {
        if (seenOgUris.has(s.uri)) continue;
        seenOgUris.add(s.uri);
        ogPromises.push(
          fetchOgImage(s.uri).then((image) => {
            if (image) send("source_image", { uri: s.uri, image });
          }),
        );
      }
    };

    try {
      for await (const ev of streamCaster({
        model: MODELS.chat,
        systemInstruction,
        history,
        enableSearch: true,
        temperature: 0.7,
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
        }
      }
    } catch (err) {
      send("error", {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // <patch> 파싱. 없으면 레거시 ```json``` 한 번 더 시도.
    const { body, patch: patchBlock } = extractPatch(full);
    const patch = patchBlock ?? extractLegacyDraft(full);
    const visibleBody = patchBlock ? body : full; // 레거시 형태면 본문 그대로 저장

    // model_msg 이벤트 — content 에는 유저가 볼 본문을 저장하고,
    // 원본과 부수 메타(검색 쿼리/소스)는 payload 에 함께 남긴다.
    await prisma.casterEvent.create({
      data: {
        id: newId(),
        runId: run.id,
        kind: "model_msg",
        payload: {
          body: visibleBody,
          content: visibleBody, // back-compat
          fullText: full,
          searchQueries,
          sources: sourcesAcc,
        } as unknown as object,
      },
    });

    // 드래프트 갱신
    if (patch) {
      const nextDraft = mergePatch(currentDraft, patch);
      await prisma.casterRun.update({
        where: { id: run.id },
        data: {
          draftJson: nextDraft as unknown as object,
          status: "draft_ready",
        },
      });
      send("patch", { patch, draft: nextDraft });
    }

    // OG 이미지 fetch 들이 모두 끝난 뒤 done 을 보낸다 (이미지 이벤트가 잘려나가지 않도록).
    // 개별 fetch 는 이미 5s 타임아웃이 걸려 있으니 무한정 기다리지 않는다.
    await Promise.allSettled(ogPromises);

    send("done", { ok: true });
  });
}
