/**
 * mira 캐릭터가 /find 에 왜 안 나오는지 진단.
 *   - Character row + isPublic
 *   - portrait Asset (blobUrl, animationUrl)
 *   - personaCore 필드
 */
import { prisma } from "../src/lib/db";

(async () => {
  const c = await prisma.character.findUnique({
    where: { slug: "mira" },
    include: {
      assets: {
        where: { kind: "portrait" },
        orderBy: { order: "asc" },
      },
      personaCore: {
        select: {
          shortTags: true,
          backstorySummary: true,
          role: true,
          species: true,
          ageText: true,
          heightCm: true,
          weightKg: true,
          threeSize: true,
          mbti: true,
        },
      },
    },
  });
  if (!c) {
    console.log("mira: NOT FOUND in DB");
    await prisma.$disconnect();
    return;
  }
  console.log(
    JSON.stringify(
      {
        id: c.id,
        slug: c.slug,
        name: c.name,
        tagline: c.tagline,
        isPublic: c.isPublic,
        portraitAssetCount: c.assets.length,
        portraits: c.assets.map((a) => ({
          kind: a.kind,
          order: a.order,
          blobUrl: a.blobUrl?.slice(0, 120),
          animationUrl: a.animationUrl?.slice(0, 120),
        })),
        personaCore: c.personaCore,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
})();
