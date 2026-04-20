// scripts/generate-portrait-animation.ts
// 포트레이트(Asset.kind=portrait) → Veo 3.1 Lite 기반 idle loop 애니메이션 생성.
//
// Fictory 의 scripts/generate-cover-video.ts 와 동일한 스펙(540x810 Q75 12fps)을
// characterchat 로 포팅. 저장소만 GCS → Vercel Blob 으로 바뀌었다.
//
// 사용:
//   npx tsx scripts/generate-portrait-animation.ts --asset <assetId>
//   npx tsx scripts/generate-portrait-animation.ts --character <characterId>
//   npx tsx scripts/generate-portrait-animation.ts --slug <characterSlug>
//   npx tsx scripts/generate-portrait-animation.ts --all
//
// 옵션:
//   --force              animationUrl 이 이미 있어도 재생성
//   --prompt "..."       모션 프롬프트 오버라이드
//
// 전제:
//   - GEMINI_API_KEY (또는 GOOGLE_GENAI_API_KEY) 환경변수
//   - BLOB_READ_WRITE_TOKEN (Vercel Blob 업로드용)
//   - ffmpeg / ffprobe 가 PATH 또는 winget 에 설치됨
//
// **주의**: 생성당 Veo 호출 비용 + Blob 업로드. 돌리기 전에 수량 확인하라.

import { prisma } from "@/lib/db";
// 스크립트와 관리자 SSE 엔드포인트가 같은 파이프라인(단일 권위)을 타도록
// src/lib/animate/stream.ts 의 collectPortraitAnimation 을 재사용한다.
// (이전엔 src/lib/animate/generatePortraitAnimation.ts 를 직접 호출했다.)
import { collectPortraitAnimation } from "@/lib/animate/stream";

type Args = {
  assetId?: string;
  characterId?: string;
  slug?: string;
  all?: boolean;
  force?: boolean;
  customPrompt?: string | null;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { customPrompt: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--asset") out.assetId = argv[++i];
    else if (a === "--character") out.characterId = argv[++i];
    else if (a === "--slug") out.slug = argv[++i];
    else if (a === "--all") out.all = true;
    else if (a === "--force") out.force = true;
    else if (a === "--prompt") out.customPrompt = argv[++i];
  }
  return out;
}

async function resolveTargets(args: Args): Promise<string[]> {
  if (args.assetId) return [args.assetId];

  if (args.characterId || args.slug) {
    const character = await prisma.character.findFirst({
      where: args.slug ? { slug: args.slug } : { id: args.characterId! },
      select: { id: true },
    });
    if (!character) {
      console.error(`character not found: ${args.slug ?? args.characterId}`);
      process.exit(1);
    }
    const rows = await prisma.asset.findMany({
      where: { characterId: character.id, kind: "portrait" },
      select: { id: true },
      orderBy: { order: "asc" },
    });
    return rows.map((r) => r.id);
  }

  if (args.all) {
    const rows = await prisma.asset.findMany({
      where: {
        kind: "portrait",
        ...(args.force ? {} : { animationUrl: null }),
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => r.id);
  }

  console.error(
    "Usage: npx tsx scripts/generate-portrait-animation.ts --asset <id> | --character <id> | --slug <slug> | --all [--force] [--prompt \"...\"]",
  );
  process.exit(1);
}

function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}m${s % 60}s` : `${s}s`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = await resolveTargets(args);

  if (!targets.length) {
    console.log("no targets found (아무것도 할 게 없음). --force 가 필요한 케이스일 수 있다.");
    return;
  }

  console.log(`[animate] 대상 ${targets.length}개 포트레이트`);
  if (!args.force) {
    console.log("  (--force 미사용: animationUrl 이 이미 있는 에셋은 건너뜀)");
  }

  let ok = 0;
  let skipped = 0;
  const failed: Array<{ id: string; err: string }> = [];

  for (let i = 0; i < targets.length; i++) {
    const id = targets[i];
    const label = `[${i + 1}/${targets.length}] ${id}`;
    const t0 = Date.now();
    try {
      const result = await collectPortraitAnimation({
        assetId: id,
        force: args.force,
        customPrompt: args.customPrompt,
        onStage: (stage, detail) => {
          const msg = detail ? `${stage} — ${detail}` : stage;
          process.stdout.write(`  ${label} ${msg}\n`);
        },
      });
      if (result.reused) {
        skipped++;
        console.log(`${label} reused ${result.animationUrl}`);
      } else {
        ok++;
        console.log(
          `${label} ok (${(result.bytes / 1024).toFixed(0)}KB, ${fmtDuration(Date.now() - t0)})`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failed.push({ id, err: msg });
      console.error(`${label} FAIL: ${msg}`);
    }
  }

  console.log(
    `\n[animate] 요약 — 생성 ${ok}, 재사용 ${skipped}, 실패 ${failed.length}`,
  );
  if (failed.length) {
    for (const f of failed) console.error(`  - ${f.id}: ${f.err}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
