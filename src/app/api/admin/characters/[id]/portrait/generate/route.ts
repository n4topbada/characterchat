// POST /api/admin/characters/[id]/portrait/generate
//
// 캐릭터 포트레이트 생성 "Agent" 엔드포인트.
//
// 두 가지 호출 패턴을 지원한다:
//
//  1) SSE 스트리밍 (권장) — 요청 헤더 Accept: text/event-stream
//     Caster 커밋 직후 클라이언트가 호출. 진행 상황을 실시간으로 보여 준다.
//     이벤트:
//       - started    { prompt, hasReferenceImage }
//       - progress   { chunks }
//       - saved      { assetId, blobUrl, width, height, mimeType }
//       - error      { message }
//
//  2) 단발 JSON — Accept 헤더에 event-stream 이 없으면 기존 동작.
//     { prompt?: string } 를 받고, 동기로 이미지 생성 + 저장 완료 후 JSON 반환.
//     (기존 관리자 콘솔의 "포트레이트 재생성" 버튼이 그대로 쓰고 있는 경로.)
//
// 입력(JSON body, 둘 다 공용):
//   - prompt?: string  (호출자가 프롬프트를 override 하고 싶을 때)
//   - runId?:  string  (Caster run ID — 여기서 대화 쓰레드 + 레퍼런스 이미지를 뽑아 Agent 에 주입)
//
// Caster 흐름:
//   커밋 직후 CasterConsole 이 { runId } 로 POST → Caster 이벤트에서
//   외형 관련 발화를 요약하고, draftJson.referenceImage.url 이 있으면
//   해당 URL 을 HTTP 로 가져와 바이트로 Agent 에 첨부한다.

import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { sseStream } from "@/lib/sse";
import { savePortraitForCharacter } from "@/lib/portraits";
import {
  streamPortrait,
  collectPortrait,
  type PortraitReferenceImage,
  type StreamPortraitInputs,
} from "@/lib/portraits-stream";

export const dynamic = "force-dynamic";
// 이미지 생성은 10~30초, 스트림 특성상 여유 있게.
export const maxDuration = 180;

type BodyInput = {
  prompt?: string;
  runId?: string;
};

// ---------- Caster 컨텍스트 뽑기 ----------

type CasterDraftLike = {
  referenceImage?: {
    url?: string;
    sourceUri?: string | null;
    title?: string | null;
    domain?: string | null;
  } | null;
};

type CasterEventPayload = {
  content?: string;
};

/**
 * Caster 대화 이벤트에서 "외형 관련" 문장만 간단히 모아 한 단락으로 만든다.
 * 모델이 길게 쓴 <patch> 블록은 서버에서 이미 제거된 채 저장되므로 content 는
 * 사람이 읽는 본문. 키워드 매칭으로 얇게 필터.
 */
const APPEARANCE_KEYWORD_RE =
  /(머리|헤어|hair|눈[동모빛]|eye|피부|skin|체형|몸|키\s?\d|cm|kg|옷|복장|의상|상의|하의|자켓|코트|치마|바지|블라우스|neck|목|어깨|표정|인상|분위기|accent|컬러|색|tone|mood|얼굴|face|턴테일|포니|숏컷|롱헤어|단발|웨이브|곱슬|안경|glasses|귀걸이|목걸이|장신구|악세서리|accessory|wear|outfit|dress)/i;

function summarizeCasterConversation(
  events: { kind: string; payload: unknown }[],
): string {
  const lines: string[] = [];
  for (const ev of events) {
    if (ev.kind !== "user_msg" && ev.kind !== "model_msg") continue;
    const p = (ev.payload ?? {}) as CasterEventPayload;
    const text = typeof p.content === "string" ? p.content.trim() : "";
    if (!text) continue;
    // 외형 관련 문장만 추려 넣음 — 사이트/SNS/URL 같은 잡음은 잘라낸다.
    const sentences = text
      .split(/(?<=[.!?。!?\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length <= 240)
      .filter((s) => APPEARANCE_KEYWORD_RE.test(s));
    for (const s of sentences) {
      lines.push(`- ${s}`);
      if (lines.length >= 12) break;
    }
    if (lines.length >= 12) break;
  }
  return lines.join("\n");
}

// ---------- 레퍼런스 이미지 fetch ----------

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB

async function fetchReferenceBytes(url: string): Promise<PortraitReferenceImage | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: ctl.signal,
      // 일부 외부 CDN 은 UA 없으면 거부
      headers: { "user-agent": "CharacterChatPortraitAgent/1.0" },
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/^image\//i.test(ct)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    // Gemini 가 받는 포맷으로 정규화 — JPEG 이 가장 안전.
    const normalized = await sharp(buf)
      .rotate()
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return { data: normalized, mimeType: "image/jpeg", sourceUri: url };
  } catch (e) {
    console.warn("[portrait/generate] reference fetch failed:", e);
    return null;
  }
}

// Asset 저장 / upsert / Character.portraitAssetId 갱신은 portraits.ts 의
// savePortraitForCharacter 를 재사용한다 — 시드 스크립트와 동일 경로.

type SavedPortrait = {
  assetId: string;
  blobUrl: string;
  width: number;
  height: number;
  mimeType: string;
};

// ---------- 입력 조립 (Caster run 또는 기본값) ----------

async function buildInputs(args: {
  characterId: string;
  body: BodyInput;
}): Promise<StreamPortraitInputs | null> {
  const character = await prisma.character.findUnique({
    where: { id: args.characterId },
    include: { personaCore: true },
  });
  if (!character) return null;

  let conversationSummary: string | null = null;
  let referenceImage: PortraitReferenceImage | null = null;

  // runId 가 있으면 Caster 대화에서 외형 힌트 + 레퍼런스 이미지 가져오기.
  if (args.body.runId) {
    const run = await prisma.casterRun.findUnique({
      where: { id: args.body.runId },
      include: {
        events: { orderBy: { createdAt: "asc" } },
      },
    });
    if (run) {
      conversationSummary = summarizeCasterConversation(run.events) || null;
      const draft = (run.draftJson ?? null) as CasterDraftLike | null;
      const refUrl = draft?.referenceImage?.url;
      if (refUrl) {
        referenceImage = await fetchReferenceBytes(refUrl);
        if (referenceImage) {
          referenceImage.title = draft?.referenceImage?.title ?? null;
          referenceImage.domain = draft?.referenceImage?.domain ?? null;
        }
      }
    }
  }

  // runId 없어도 appearanceKeys[0] 에 "ref image: <URL>" 앵커가 있으면 거기서도 시도.
  if (!referenceImage && character.personaCore) {
    const anchor = (character.personaCore.appearanceKeys ?? []).find((k) =>
      /^ref image:\s*https?:\/\//i.test(k),
    );
    if (anchor) {
      const url = anchor.replace(/^ref image:\s*/i, "").trim();
      if (url) referenceImage = await fetchReferenceBytes(url);
    }
  }

  return {
    character: {
      name: character.name,
      tagline: character.tagline,
      accentColor: character.accentColor,
      slug: character.slug,
    },
    persona: character.personaCore ?? null,
    conversationSummary,
    referenceImage,
    overridePrompt: args.body.prompt?.trim() || null,
  };
}

// ---------- 핸들러 ----------

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const body = ((await req.json().catch(() => ({}))) ?? {}) as BodyInput;

  const character = await prisma.character.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true },
  });
  if (!character) return errorJson("character not found", 404);

  const inputs = await buildInputs({ characterId: id, body });
  if (!inputs) return errorJson("character not found", 404);

  const wantsSSE = /\btext\/event-stream\b/i.test(
    req.headers.get("accept") ?? "",
  );

  // ---------- 1) SSE 경로 ----------
  if (wantsSSE) {
    return sseStream(async (send) => {
      let savedResult: SavedPortrait | null = null;
      try {
        for await (const ev of streamPortrait(inputs)) {
          if (ev.type === "started") {
            send("started", {
              prompt: ev.prompt,
              hasReferenceImage: ev.hasReferenceImage,
            });
          } else if (ev.type === "progress") {
            send("progress", { chunks: ev.chunks });
          } else if (ev.type === "image") {
            const saved = await savePortraitForCharacter({
              characterId: character.id,
              slug: character.slug,
              png: ev.data,
              mimeType: ev.mimeType,
            });
            savedResult = { ...saved, mimeType: "image/png" };
          } else if (ev.type === "done") {
            if (savedResult) {
              send("saved", savedResult);
            } else {
              send("error", { message: "no_image_saved" });
            }
          } else if (ev.type === "error") {
            send("error", { message: ev.message });
          }
        }
      } catch (e) {
        send("error", { message: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  // ---------- 2) 단발 JSON 경로 ----------
  try {
    const { data, mimeType, prompt } = await collectPortrait(inputs);
    const saved = await savePortraitForCharacter({
      characterId: character.id,
      slug: character.slug,
      png: data,
      mimeType,
    });
    return NextResponse.json({ ...saved, mimeType: "image/png", prompt });
  } catch (e) {
    console.error("[portrait/generate] failed", e);
    return errorJson(
      e instanceof Error ? e.message : "generation failed",
      502,
    );
  }
}
