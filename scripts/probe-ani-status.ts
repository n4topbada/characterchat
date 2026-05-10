// 각 캐릭터 portrait 의 animationUrl 상태 + 도달성 점검.
import { config } from "dotenv";
config({ path: ".env.prod", override: true });
import { PrismaClient } from "@prisma/client";

async function head(url: string): Promise<number> {
  try {
    const r = await fetch(url, { method: "HEAD" });
    return r.status;
  } catch {
    return 0;
  }
}

async function main() {
  const p = new PrismaClient();
  const chars = await p.character.findMany({
    select: { slug: true, name: true, portraitAssetId: true },
    orderBy: { createdAt: "asc" },
  });
  for (const c of chars) {
    if (!c.portraitAssetId) {
      console.log(`/${c.slug.padEnd(15)} no portrait`);
      continue;
    }
    const a = await p.asset.findUnique({
      where: { id: c.portraitAssetId },
      select: { id: true, blobUrl: true, animationUrl: true },
    });
    if (!a) {
      console.log(`/${c.slug.padEnd(15)} portrait asset not found`);
      continue;
    }
    const portStatus = await head(a.blobUrl);
    const aniStatus = a.animationUrl ? await head(a.animationUrl) : null;
    console.log(
      `/${c.slug.padEnd(15)} ${c.name.padEnd(8)}  portrait=${portStatus}  ani=${
        a.animationUrl ? `${aniStatus} (${a.animationUrl.slice(-30)})` : "(none)"
      }`,
    );
  }
  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
