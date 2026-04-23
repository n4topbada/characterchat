import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.prod"), override: true });
const p = new PrismaClient();
(async () => {
  const chars = await p.character.findMany({
    select: {
      slug: true,
      name: true,
      portraitAssetId: true,
      nsfwEnabled: true,
      _count: { select: { assets: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const c of chars) {
    let portrait: {
      id: string;
      kind: string;
      sceneTag: string | null;
      expression: string | null;
      blobUrl: string;
      animationUrl: string | null;
    } | null = null;
    if (c.portraitAssetId) {
      portrait = await p.asset.findUnique({
        where: { id: c.portraitAssetId },
        select: {
          id: true,
          kind: true,
          sceneTag: true,
          expression: true,
          blobUrl: true,
          animationUrl: true,
        },
      });
    }
    const galleryByLevel = await p.asset.groupBy({
      by: ["nsfwLevel"],
      where: { character: { slug: c.slug }, kind: "gallery" },
      _count: true,
    });
    const bg = await p.asset.count({
      where: { character: { slug: c.slug }, kind: "background" },
    });
    process.stdout.write(`\n/${c.slug}  ${c.name}  (nsfw=${c.nsfwEnabled})\n`);
    process.stdout.write(`  assets=${c._count.assets}  bg=${bg}\n`);
    process.stdout.write(
      `  gallery by nsfwLevel: ${galleryByLevel
        .sort((a, b) => a.nsfwLevel - b.nsfwLevel)
        .map((g) => `L${g.nsfwLevel}=${g._count}`)
        .join(" ")}\n`,
    );
    if (portrait) {
      process.stdout.write(
        `  portrait: ${portrait.kind} · ${portrait.sceneTag}/${portrait.expression}\n`,
      );
      process.stdout.write(`    blob: ${portrait.blobUrl}\n`);
      process.stdout.write(
        `    ani : ${portrait.animationUrl ?? "(none)"}\n`,
      );
    } else {
      process.stdout.write("  portrait: (none)\n");
    }
  }
  await p.$disconnect();
})();
