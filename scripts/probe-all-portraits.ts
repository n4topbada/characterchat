import { prisma } from "../src/lib/db";
(async () => {
  const rows = await prisma.character.findMany({
    where: { isPublic: true },
    include: { assets: { where: { kind: "portrait" }, take: 1 } },
    orderBy: { createdAt: "desc" },
  });
  for (const r of rows) {
    const a = r.assets[0];
    console.log(
      r.slug.padEnd(12),
      "→",
      (a?.blobUrl ?? "(no portrait)").slice(0, 80),
      "| ani:",
      (a?.animationUrl ?? "-").slice(0, 80),
    );
  }
  await prisma.$disconnect();
})();
