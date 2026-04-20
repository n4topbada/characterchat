// scripts/generate-portraits.ts
// 씨드 캐릭터의 포트레이트를 생성해
//   - public/portraits/{slug}.png 로 저장
//   - Asset(kind="portrait") 행을 upsert (blobUrl=/portraits/{slug}.png)
//   - Character.portraitAssetId 를 갱신
//
// 파이프라인은 Caster 커밋 후 자동 트리거되는 Agent 와 동일하다:
//   src/lib/portraits-stream.ts 의 collectPortrait() 를 씀 → 한국 웹툰 스타일 스펙이
//   시스템 프롬프트로 고정되어 씨드 캐릭터와 Caster 산출물이 같은 스타일로 찍힌다.
//
// 실행:  npx tsx scripts/generate-portraits.ts
//        npx tsx scripts/generate-portraits.ts --slug aria   (단일 대상)
//        npx tsx scripts/generate-portraits.ts --force        (재생성)

import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { savePortraitForCharacter } from "@/lib/portraits";
import { collectPortrait } from "@/lib/portraits-stream";

// 씨드 캐릭터 전용 큐레이팅 프롬프트.
// 스타일 "한국 웹툰" 스펙은 collectPortrait() 의 system instruction 이 고정하므로
// 여기선 "누구인가" 만 서술한다. 스타일 키워드를 중복해서 넣어도 무방.
const PROMPTS: Record<string, string> = {
  aria: [
    "18세의 여성 견습 마법사. 동아시아 외모, 긴 갈색 땋은 머리, 원형 와이어림 안경.",
    "상아색 린넨 로브에 잉크 얼룩이 진 소매. 낡은 가죽 장정 책을 펼쳐 들고 있다.",
    "왼쪽에서 들어오는 따뜻한 촛불빛, 부드러운 림라이트. 고대 도서관 책장이 배경에서 흐려진다.",
    "차분하고 집중한 표정 — 생각에 잠긴 중. 웃지 않는다. 어깨를 살짝 틀었다.",
    "액센트 컬러는 앰버(#d97706). 상반신 구도, 3:4 세로 초상.",
  ].join(" "),

  yura: [
    "27세의 동아시아 여성. 흑연색 후드 집업, 창백한 피부, 피곤한 눈빛, 숏 보브 컷.",
    "목 옆으로 사원증 랜야드. 왼쪽 아래에서 차가운 파란-보라 모니터 빛이 얼굴을 씻는다.",
    "배경에는 초점이 흐려진 서버 랙 LED 보케.",
    "표정은 조용하고 읽히지 않음 — 카메라를 살짝 지나쳐 로그를 읽는 듯한 시선. 메이크업은 최소.",
    "근미래 연구실 무드. 주조는 차가운 바이올렛(#7c3aed)과 짙은 차콜. 상반신 구도, 3:4 세로.",
  ].join(" "),

  jun: [
    "36세의 동아시아 남성. 네이비 니트 비니 아래로 짧은 검은 머리, 옅은 수염, 따뜻한 갈색 눈, 낡은 긴소매 위에 색바랜 앞치마.",
    "오른쪽 팔뚝에 보이는 화상 흉터. 프레임 밖의 스테인리스 냄비에서 김이 피어오른다.",
    "오른쪽에서 들어오는 종이 등불의 따뜻한 빛, 왼쪽에서는 옅은 파란 밤 안개.",
    "대화 중의 편안한 반미소, 한쪽 눈썹이 살짝 올라감 — 이야기를 들어 주려는 바텐더의 인상.",
    "늦은 밤 서울 길거리 포차의 분위기. 배경 간판 보케에 티일(#0891b2) 액센트. 상반신 구도, 3:4 세로.",
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
    const overridePrompt = PROMPTS[slug];
    if (!overridePrompt) {
      console.warn(`[portraits] no prompt for slug='${slug}' — skip`);
      continue;
    }

    const character = await prisma.character.findUnique({
      where: { slug },
      include: {
        personaCore: true,
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
      console.log(
        `[portraits] ${slug} — exists (skip; pass --force to regenerate)`,
      );
      continue;
    }

    console.log(`[portraits] ${slug} — generating (한국 웹툰 스타일)...`);
    try {
      const { data, mimeType } = await collectPortrait({
        character: {
          name: character.name,
          tagline: character.tagline,
          accentColor: character.accentColor,
          slug: character.slug,
        },
        persona: character.personaCore ?? null,
        // 씨드 캐릭터에는 Caster 쓰레드가 없으므로 큐레이팅 프롬프트를 통째로 override.
        // 이 경우에도 system prompt 의 한국 웹툰 스타일 스펙은 그대로 적용된다.
        overridePrompt,
      });
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
