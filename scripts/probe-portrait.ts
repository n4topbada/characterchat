import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
config({ path: resolve(process.cwd(), ".env.prod"), override: true });
const p = new PrismaClient();
(async () => {
  const c = await p.character.findUnique({
    where: { slug: "seo-ah-jin" },
    select: { id: true, portraitAssetId: true },
  });
  process.stdout.write("char:" + JSON.stringify(c) + "\n");
  if (!c) return;
  const rows = await p.asset.findMany({
    where: {
      characterId: c.id,
      sceneTag: "casual",
      expression: "angry",
    },
    select: { id: true, order: true, kind: true },
    orderBy: { order: "asc" },
    take: 5,
  });
  process.stdout.write("casual+angry assets: " + JSON.stringify(rows) + "\n");
  await p.$disconnect();
})();
