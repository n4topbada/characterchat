import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const chars = await p.character.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      isPublic: true,
      _count: {
        select: { assets: true, sessions: true, knowledgeChunks: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(JSON.stringify(chars, null, 2));
  await p.$disconnect();
}
main();
