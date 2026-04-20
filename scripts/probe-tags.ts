import { prisma } from "../src/lib/db";

(async () => {
  const rows = await prisma.character.findMany({
    select: {
      slug: true,
      name: true,
      tagline: true,
      personaCore: {
        select: { ageText: true, role: true, species: true, mbti: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const r of rows) {
    console.log(
      r.slug,
      "|",
      JSON.stringify(r.personaCore),
      "|",
      r.tagline,
    );
  }
  await prisma.$disconnect();
})();
