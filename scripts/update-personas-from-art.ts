/**
 * 실제 아트(char0002/char0003) 를 확인한 뒤 PersonaCore.appearanceKeys 를
 * 그림과 맞게 재조정. 백스토리/성격은 유지, 외형 묘사만 바꾼다.
 *
 *   npx tsx scripts/update-personas-from-art.ts         # dry-run
 *   npx tsx scripts/update-personas-from-art.ts --apply
 */
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });

const APPLY = process.argv.includes("--apply");
const prisma = new PrismaClient();

// char0002 관찰:
//   - 은회색/애시 + 금빛 눈빛, 검은 뿔테 안경, 슬림-탄탄 체형.
//   - 업무 시엔 검은색으로 다운된 스타일링(work_neutral). 그래서 "평소 은회색
//     → 정장 차림에서는 눌러 정돈" 으로 양립 가능하게 표현한다.
const HAJIN_APPEARANCE = [
  "188cm, 슬림하지만 어깨와 가슴이 또렷한 탄탄한 체형",
  "짧게 정리한 은회색-애시 헤어. 업무 시엔 다크하게 눌러 넘김",
  "검은 뿔테 안경 (사적·업무 모두)",
  "차분하고 깊은 호박색 눈동자",
  "또렷한 턱선과 긴 목선",
  "손가락이 길고 마디가 또렷 — 연필과 스케일자를 쥐던 손",
];
const HAJIN_SHORT = ["대리", "건축", "크로스핏", "ISTJ"];

// char0003 관찰:
//   - 허리까지 내려오는 긴 웨이브 블론드 + 벽안, 볼륨 있는 신체, 우유빛 피부.
//   - PersonaCore 의 국제/갤러리 큐레이터 세팅은 이 외형과 어울림(이국적
//     스타일). 스토리/가족배경에도 자연스럽게 설명되도록 aliases 보강.
const AJIN_APPEARANCE = [
  "173cm, 긴 다리와 곧은 자세 — 힐 없이도 시선을 끈다",
  "허리께까지 내려오는 웨이브 진 밝은 블론드 머리 (염색·뿌리까지 관리)",
  "맑은 푸른 눈과 긴 속눈썹",
  "우유빛 피부에 목덜미 아래 작은 점 하나",
  "풍만한 곡선의 여성적 실루엣 — 허리-골반 라인이 또렷",
  "손톱은 짧고 깔끔, 반지는 가운데손가락에 하나",
];
const AJIN_ALIASES = ["아진", "서 큐레이터", "사장", "Ah-jin"];
const AJIN_SHORT = ["큐레이터", "와인바", "연상", "INTJ"];

async function updateOne(
  slug: string,
  appearanceKeys: string[],
  shortTags: string[],
  aliases?: string[],
) {
  const character = await prisma.character.findUnique({
    where: { slug },
    include: { personaCore: true },
  });
  if (!character) {
    console.error(`  [MISS] /${slug} 없음`);
    return;
  }
  if (!character.personaCore) {
    console.error(`  [MISS] /${slug} PersonaCore 없음`);
    return;
  }
  console.log(`  /${slug}`);
  console.log(`    appearanceKeys before:`, character.personaCore.appearanceKeys);
  console.log(`    appearanceKeys after :`, appearanceKeys);
  if (aliases) console.log(`    aliases          →`, aliases);
  if (!APPLY) return;
  await prisma.personaCore.update({
    where: { characterId: character.id },
    data: {
      appearanceKeys,
      shortTags,
      ...(aliases ? { aliases } : {}),
      version: { increment: 1 },
    },
  });
  console.log(`    ✓ updated`);
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY" : "DRY-RUN"}\n`);
  await updateOne("ryu-ha-jin", HAJIN_APPEARANCE, HAJIN_SHORT);
  await updateOne("seo-ah-jin", AJIN_APPEARANCE, AJIN_SHORT, AJIN_ALIASES);
  if (!APPLY) console.log("\n--apply 로 실제 수행.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
