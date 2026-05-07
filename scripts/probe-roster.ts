// 현재 DB 의 roster 상태 빠른 점검 — 캐릭터별 자산 수 / portrait 여부 / 세션
// 수를 한눈에. NSFW 분포(level 0~3 카운트) 도 포함해 컨텐츠 등급 cap 이 제대로
// 적용됐는지 검증.
import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  const chars = await p.character.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      nsfwEnabled: true,
      portraitAssetId: true,
      _count: { select: { assets: true, sessions: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  for (const c of chars) {
    const dist = await p.asset.groupBy({
      by: ["nsfwLevel"],
      where: { characterId: c.id },
      _count: { _all: true },
    });
    const map: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const r of dist) map[r.nsfwLevel] = r._count._all;
    const sceneDist = await p.asset.groupBy({
      by: ["sceneTag"],
      where: { characterId: c.id, kind: "gallery" },
      _count: { _all: true },
    });
    const sceneSummary = sceneDist
      .filter((r) => r.sceneTag)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 6)
      .map((r) => `${r.sceneTag}=${r._count._all}`)
      .join(" ");
    console.log(
      `/${c.slug.padEnd(15)} ${c.name.padEnd(8)}  nsfw=${
        c.nsfwEnabled ? "Y" : "N"
      }  assets=${c._count.assets.toString().padStart(4)}  portrait=${
        c.portraitAssetId ? "yes" : "NO "
      }  L[0=${map[0]} 1=${map[1]} 2=${map[2]} 3=${map[3]}]  scenes(${sceneSummary})`,
    );
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
