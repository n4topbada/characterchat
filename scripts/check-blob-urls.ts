import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const sample = await p.asset.findFirst({
    where: { kind: "gallery" },
    select: { blobUrl: true, characterId: true },
  });
  console.log("any gallery:", sample?.blobUrl);
  const chars = await p.character.findMany({
    select: {
      slug: true,
      portraitAssetId: true,
    },
    orderBy: { createdAt: "asc" },
  });
  for (const c of chars) {
    if (!c.portraitAssetId) continue;
    const pa = await p.asset.findUnique({
      where: { id: c.portraitAssetId },
      select: { blobUrl: true },
    });
    console.log(`/${c.slug.padEnd(15)} portrait blobUrl=${pa?.blobUrl}`);
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
