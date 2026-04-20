/**
 * han-yo-il 캐릭터의 PersonaCore 데이터 확인 — shortTags 폴백 결과 미리보기.
 */
import { prisma } from "../src/lib/db";

(async () => {
  const r = await prisma.character.findUnique({
    where: { slug: "han-yo-il" },
    include: {
      personaCore: {
        select: {
          role: true,
          species: true,
          mbti: true,
          ageText: true,
          shortTags: true,
        },
      },
    },
  });
  if (!r) {
    console.log("not found");
    await prisma.$disconnect();
    return;
  }
  console.log(
    JSON.stringify(
      {
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        core: r.personaCore,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})();
