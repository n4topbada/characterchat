// Mira 의 모든 관련 모델을 덤프 — 새 캐릭터 설계 참고용.
import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const c = await p.character.findUnique({
    where: { slug: "mira" },
    include: {
      config: true,
      personaCore: true,
      eventTemplates: true,
      _count: { select: { assets: true, personaStates: true } },
    },
  });
  console.log(JSON.stringify(c, null, 2));
  await p.$disconnect();
}
main();
