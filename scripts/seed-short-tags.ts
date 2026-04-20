/**
 * PersonaCore.shortTags 시드.
 *
 * 카드 상단 단어형(1줄) 태그 — 2~4개의 짧은 단어. appearanceKeys 는 서술형
 * (예: "허리까지 오는 검은 긴 생머리") 이라 카드 칩으로 쓰기엔 길다.
 *
 * 이미 설정된 값은 덮어쓰지 않는다. 빈 배열인 경우에만 채운다.
 */
import { prisma } from "../src/lib/db";

const BY_SLUG: Record<string, string[]> = {
  mira: ["동거", "연인", "학생", "ENFP"],
  jun: ["포차 주인", "중년", "ISFP"],
  yura: ["AI 연구원", "야간조", "INTJ"],
  aria: ["견습 마법사", "학생", "INFP"],
  "han-yo-il": ["도서실", "고등학생", "츤데레", "친구"],
};

(async () => {
  const rows = await prisma.character.findMany({
    where: { slug: { in: Object.keys(BY_SLUG) } },
    select: {
      id: true,
      slug: true,
      personaCore: {
        select: { id: true, shortTags: true },
      },
    },
  });

  let updated = 0;
  for (const r of rows) {
    if (!r.personaCore) {
      console.warn(`[skip] ${r.slug}: no personaCore`);
      continue;
    }
    if (r.personaCore.shortTags.length > 0) {
      console.log(
        `[keep] ${r.slug}: already has ${r.personaCore.shortTags.length} tags`,
      );
      continue;
    }
    const tags = BY_SLUG[r.slug];
    await prisma.personaCore.update({
      where: { id: r.personaCore.id },
      data: { shortTags: tags },
    });
    console.log(`[set]  ${r.slug} ← ${tags.join(", ")}`);
    updated++;
  }

  console.log(`\nUpdated ${updated}/${rows.length}.`);
  await prisma.$disconnect();
})();
