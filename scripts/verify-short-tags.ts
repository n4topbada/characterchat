/**
 * 프로덕션 DB 에 PersonaCore.shortTags 컬럼 + 시드 데이터가 반영됐는지 확인.
 */
import { prisma } from "../src/lib/db";

(async () => {
  const rows = await prisma.personaCore.findMany({
    select: {
      character: { select: { slug: true, name: true } },
      shortTags: true,
    },
    orderBy: { character: { slug: "asc" } },
  });
  for (const r of rows) {
    console.log(
      `${r.character.slug.padEnd(8)} ${r.character.name.padEnd(4)} → [${r.shortTags.join(", ")}]`,
    );
  }
  console.log(`\n총 ${rows.length} 캐릭터.`);
  await prisma.$disconnect();
})();
