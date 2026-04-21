// POST /api/admin/assets/[id]/animate
//
// 포트레이트 Asset → Veo 3.1 Lite 애니메이션 생성 "Agent" 엔드포인트.
// 포트레이트 생성 Agent 와 짝을 이룬다 (커밋 직후 체인: portrait → animation).
//
// 두 가지 호출 패턴:
//
//  1) SSE 스트리밍 (권장) — Accept: text/event-stream
//     Caster 커밋 후 포트레이트 저장 → 이 엔드포인트를 바로 체인 호출.
//     이벤트:
//       - started       { assetId, prompt }
//       - download      { blobUrl }
//       - veo_start     {}
//       - veo_poll      { pollCount, elapsedSec }     — 10초 하트비트
//       - veo_done      { mp4Bytes }
//       - ffmpeg_start  {}
//       - ffmpeg_done   { webpBytes }
//       - upload        { path }
//       - saved         { assetId, animationUrl, bytes, spec }
//       - reused        { assetId, animationUrl }     — force 미사용 + 이미 존재
//       - error         { message }
//
//  2) 단발 JSON — event-stream 아니면 기존 동작처럼 끝날 때까지 기다렸다가 한 번에 반환.
//
// 입력 body:
//   - customPrompt?: string   — Veo 프롬프트 override
//   - force?:        boolean  — animationUrl 이 이미 있어도 재생성
//
// 주의:
//  - mp4 → animated webp 변환은 ffmpeg 바이너리를 요구한다. Vercel serverless
//    런타임에는 ffmpeg 이 없으므로 현실적으로 이 엔드포인트는 "로컬 dev 서버"
//    혹은 "ffmpeg 포함 self-host" 환경에서만 동작한다. 관리자 Caster 워크플로우
//    전용이며, 유저 라우트에는 노출되지 않는다.

import { NextResponse } from "next/server";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { sseStream } from "@/lib/sse";
import {
  streamPortraitAnimation,
  collectPortraitAnimation,
  type AnimationStreamEvent,
} from "@/lib/animate/stream";

export const dynamic = "force-dynamic";
// Veo 폴링 3~4분 + ffmpeg 수 초 — 이상적으론 10분이지만 Vercel Hobby 한도가
// 300초라 빌드 통과를 위해 300으로 고정. 어차피 Vercel serverless 에는 ffmpeg
// 바이너리가 없어 이 라우트는 self-host / 로컬 dev 에서만 실제로 완주하므로
// 운영 환경(self-host) 에서 더 긴 시간이 필요하면 platform 단에서 따로 오버라이드.
export const maxDuration = 300;

type BodyInput = {
  customPrompt?: string | null;
  force?: boolean;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const body = ((await req.json().catch(() => ({}))) ?? {}) as BodyInput;

  const wantsSSE = /\btext\/event-stream\b/i.test(
    req.headers.get("accept") ?? "",
  );

  const inputs = {
    assetId: id,
    customPrompt: body.customPrompt ?? null,
    force: !!body.force,
  };

  // ---------- 1) SSE 경로 ----------
  if (wantsSSE) {
    return sseStream(async (send) => {
      try {
        for await (const ev of streamPortraitAnimation(inputs)) {
          sendEvent(send, ev);
        }
      } catch (e) {
        send("error", {
          message: e instanceof Error ? e.message : String(e),
        });
      }
    });
  }

  // ---------- 2) 단발 JSON 경로 ----------
  try {
    const result = await collectPortraitAnimation(inputs);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[assets/animate] failed", e);
    return errorJson(
      e instanceof Error ? e.message : "animation_failed",
      502,
    );
  }
}

/** generator 이벤트 → SSE frame 직렬화. */
function sendEvent(
  send: (event: string, data: unknown) => void,
  ev: AnimationStreamEvent,
): void {
  switch (ev.type) {
    case "started":
      send("started", { assetId: ev.assetId, prompt: ev.prompt });
      return;
    case "download":
      send("download", { blobUrl: ev.blobUrl });
      return;
    case "veo_start":
      send("veo_start", {});
      return;
    case "veo_poll":
      send("veo_poll", {
        pollCount: ev.pollCount,
        elapsedSec: ev.elapsedSec,
      });
      return;
    case "veo_done":
      send("veo_done", { mp4Bytes: ev.mp4Bytes });
      return;
    case "ffmpeg_start":
      send("ffmpeg_start", {});
      return;
    case "ffmpeg_done":
      send("ffmpeg_done", { webpBytes: ev.webpBytes });
      return;
    case "upload":
      send("upload", { path: ev.path });
      return;
    case "saved":
      send("saved", {
        assetId: ev.assetId,
        animationUrl: ev.animationUrl,
        bytes: ev.bytes,
        spec: ev.spec,
      });
      return;
    case "reused":
      send("reused", {
        assetId: ev.assetId,
        animationUrl: ev.animationUrl,
      });
      return;
    case "error":
      send("error", { message: ev.message });
      return;
  }
}
