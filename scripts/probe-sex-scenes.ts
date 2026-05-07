// 캐릭터별 sex_* sceneTag 분포 — naked→sex 전환 자산이 모두 등록됐는지 확인.
import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const chars = await p.character.findMany({
    select: { id: true, slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  for (const c of chars) {
    const dist = await p.asset.groupBy({
      by: ["sceneTag"],
      where: {
        characterId: c.id,
        sceneTag: { startsWith: "sex" },
        kind: "gallery",
      },
      _count: { _all: true },
    });
    const total = dist.reduce((acc, r) => acc + r._count._all, 0);
    const summary = dist
      .sort((a, b) => b._count._all - a._count._all)
      .map((r) => `${r.sceneTag}=${r._count._all}`)
      .join(" ");
    console.log(
      `/${c.slug.padEnd(15)} ${c.name.padEnd(8)}  sex_total=${String(total).padStart(3)}  (${summary})`,
    );
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
