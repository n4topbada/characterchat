// 각 캐릭터의 portrait 와 임의 gallery / sex_* 자산 한 개씩 HEAD 로 200 확인.
// "DB 엔 들어갔는데 Blob 엔 없는" 미스를 잡는다.
import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";

async function head(url: string): Promise<{ status: number; type: string }> {
  const r = await fetch(url, { method: "HEAD" });
  return { status: r.status, type: r.headers.get("content-type") ?? "" };
}

async function pickRandom<T extends { id: string; blobUrl: string }>(
  arr: T[],
): Promise<T | null> {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

async function main() {
  const p = new PrismaClient();
  const chars = await p.character.findMany({
    select: { id: true, slug: true, name: true, portraitAssetId: true },
    orderBy: { createdAt: "asc" },
  });
  let problems = 0;
  for (const c of chars) {
    if (!c.portraitAssetId) {
      console.log(`/${c.slug.padEnd(15)} no portrait`);
      problems++;
      continue;
    }
    const portrait = await p.asset.findUnique({
      where: { id: c.portraitAssetId },
      select: { id: true, blobUrl: true },
    });
    const galleries = await p.asset.findMany({
      where: { characterId: c.id, kind: "gallery" },
      take: 30,
      select: { id: true, blobUrl: true, sceneTag: true, nsfwLevel: true },
    });
    // sex_* 자산은 take 윈도우 밖일 수 있어 별도 쿼리.
    const sexAssets = await p.asset.findMany({
      where: {
        characterId: c.id,
        kind: "gallery",
        sceneTag: { startsWith: "sex" },
      },
      take: 5,
      select: { id: true, blobUrl: true, sceneTag: true, nsfwLevel: true },
    });
    const randomGallery = await pickRandom(galleries);
    const randomSex = await pickRandom(sexAssets);
    const checks = [
      ["portrait", portrait?.blobUrl],
      ["gallery", randomGallery?.blobUrl],
      ["sex", randomSex?.blobUrl],
    ] as const;
    const results: string[] = [];
    for (const [label, url] of checks) {
      if (!url) {
        results.push(`${label}=N/A`);
        continue;
      }
      try {
        const r = await head(url);
        const mark = r.status === 200 ? "OK" : `FAIL(${r.status})`;
        if (r.status !== 200) problems++;
        results.push(`${label}=${mark}`);
      } catch (e) {
        problems++;
        results.push(`${label}=ERR`);
      }
    }
    console.log(`/${c.slug.padEnd(15)} ${c.name.padEnd(8)}  ${results.join("  ")}`);
  }
  await p.$disconnect();
  if (problems > 0) {
    console.error(`\n${problems} probe(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll Blob URLs reachable.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
