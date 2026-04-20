import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
config({ path: resolve(process.cwd(), ".env") });
const prisma = new PrismaClient();

async function main() {
  const c = await prisma.character.findFirst({
    where: { slug: "mira" },
    select: { id: true, name: true, slug: true },
  });
  console.log("character:", c);
  if (c) {
    const assets = await prisma.asset.findMany({
      where: { characterId: c.id, kind: "portrait" },
      select: { id: true, blobUrl: true, animationUrl: true, order: true, mimeType: true, width: true, height: true },
      orderBy: { order: "asc" },
    });
    console.log("portraits:", assets);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
