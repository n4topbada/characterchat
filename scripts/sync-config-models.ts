// 신규 캐릭터(do-yu-han, han-yi-rin, im-ha-neul, yoon-seo-ji) 의
// CharacterConfig.model 을 카탈로그 chat 모델(`gemini-flash-latest`) 로 정렬.
// reset-roster-v2 가 fallback 모델 (`gemini-3-flash-preview`) 로 시드해 둔 걸
// 잡는 일회성 정렬 스크립트.
import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";
import { GEMINI_MODELS } from "../src/lib/gemini/models";

async function main() {
  const p = new PrismaClient();
  const target = GEMINI_MODELS.chat;
  const slugs = ["do-yu-han", "han-yi-rin", "im-ha-neul", "yoon-seo-ji"];
  for (const slug of slugs) {
    const c = await p.character.findUnique({
      where: { slug },
      select: { id: true, name: true, config: { select: { model: true } } },
    });
    if (!c) {
      console.log(`/${slug} 없음 — skip`);
      continue;
    }
    const before = c.config?.model ?? "(none)";
    if (before === target) {
      console.log(`/${slug.padEnd(15)} ${c.name}  already ${target}`);
      continue;
    }
    await p.characterConfig.update({
      where: { characterId: c.id },
      data: { model: target },
    });
    console.log(`/${slug.padEnd(15)} ${c.name}  ${before}  →  ${target}`);
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
