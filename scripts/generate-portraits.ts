// scripts/generate-portraits.ts
// 씨드 캐릭터 3명에 대해 3:4 / 1K 포트레이트를 Gemini 로 생성하고
//  - public/portraits/{slug}.png 로 저장
//  - Asset(kind="portrait") 행을 upsert (blobUrl=/portraits/{slug}.png)
//  - Character.portraitAssetId 를 갱신
//
// 실행:  npx tsx scripts/generate-portraits.ts
//        npx tsx scripts/generate-portraits.ts --slug aria   (단일 대상)
//        npx tsx scripts/generate-portraits.ts --force        (재생성)

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import {
  generatePortraitBytes,
  savePortraitForCharacter,
} from "@/lib/portraits";

// slug → 포트레이트 프롬프트. 씨드 캐릭터용 "큐레이팅" 프롬프트.
// 관리자 콘솔의 자동 재생성은 PersonaCore 에서 프롬프트를 조립한다(buildPortraitPrompt).
const PROMPTS: Record<string, string> = {
  aria: [
    "Studio portrait of an 18-year-old female apprentice mage, East Asian features, long brown braided hair, round wire-rim glasses, ink-stained sleeves of a cream linen robe.",
    "Holding an open, worn leather-bound book. Warm candlelight from the left, soft rim light. Ancient library shelves blurred in the background.",
    "Gentle, focused expression — mid-thought, not smiling. Shoulders slightly turned.",
    "Painterly semi-realism, muted warm palette with amber accents (#d97706). Cinematic, magazine-cover framing.",
    "Subject fills frame vertically — chest-up composition, head in upper third. 3:4 portrait aspect ratio.",
  ].join(" "),

  yura: [
    "Studio portrait of a 27-year-old East Asian woman in a graphite-grey hooded zip-up jacket, pale skin, tired eyes, short bob haircut.",
    "A lanyard ID card hangs at her collar. Cool blue-violet monitor light washes her face from the lower-left. Out-of-focus server-rack LEDs bokeh in the background.",
    "Quiet, unreadable expression — looking slightly past camera as if reading a log. Minimal makeup.",
    "Clean cinematic photo realism, near-future research lab aesthetic. Dominant palette: cool violet (#7c3aed) and deep charcoal.",
    "Chest-up portrait, subject centered, 3:4 portrait aspect ratio.",
  ].join(" "),

  jun: [
    "Studio portrait of a 36-year-old East Asian man, short black hair under a navy-blue knit beanie, faint stubble, warm brown eyes, faded apron over a worn long-sleeve shirt.",
    "A visible burn scar on his right forearm. Steam curling up from a stainless pot just out of frame. Paper lantern warmth from the right, slight blue night haze from the left.",
    "Relaxed half-smile, mid-conversation, one eyebrow slightly raised — the look of a bartender about to listen.",
    "Photo-realistic cinematic, late-night Seoul street-food vibe. Teal accents (#0891b2) in signage bokeh behind.",
    "Chest-up composition, shoulders squared, 3:4 portrait aspect ratio.",
  ].join(" "),
};

type Args = { slugs?: string[]; force: boolean };

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  const args: Args = { force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") args.force = true;
    else if (a === "--slug" && argv[i + 1]) {
      args.slugs = (args.slugs ?? []).concat(argv[++i]);
    }
  }
  return args;
}

async function run() {
  const args = parseArgs();
  const slugs = args.slugs ?? Object.keys(PROMPTS);
  const portraitsDir = path.resolve(process.cwd(), "public", "portraits");
  await fs.mkdir(portraitsDir, { recursive: true });

  for (const slug of slugs) {
    const prompt = PROMPTS[slug];
    if (!prompt) {
      console.warn(`[portraits] no prompt for slug='${slug}' — skip`);
      continue;
    }

    const character = await prisma.character.findUnique({
      where: { slug },
      include: {
        assets: { where: { kind: "portrait" }, orderBy: { order: "asc" } },
      },
    });
    if (!character) {
      console.warn(`[portraits] character '${slug}' not found — run seed first`);
      continue;
    }

    const outFile = path.join(portraitsDir, `${slug}.png`);
    const exists = await fs
      .stat(outFile)
      .then(() => true)
      .catch(() => false);

    if (exists && !args.force && character.assets.length > 0) {
      console.log(`[portraits] ${slug} — exists (skip; pass --force to regenerate)`);
      continue;
    }

    console.log(`[portraits] ${slug} — generating...`);
    try {
      const { data, mimeType } = await generatePortraitBytes(prompt);
      const saved = await savePortraitForCharacter({
        characterId: character.id,
        slug,
        png: data,
        mimeType,
      });
      console.log(
        `[portraits] ${slug} ✓ saved (${saved.width}×${saved.height}) → ${saved.blobUrl}`,
      );
    } catch (e) {
      // per-slug 에러는 배치를 중단시키지 않는다. 다음 캐릭터로 진행.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[portraits] ${slug} ✗ failed: ${msg.slice(0, 200)}`);
    }
  }
}

run()
  .catch((e) => {
    console.error("[portraits] FATAL", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
