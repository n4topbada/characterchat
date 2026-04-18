import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { spotBodyTokens, statusToTokens, scoreAsset, type PickableAsset } from "../src/lib/assets/pickAsset";
import { extractStatus } from "../src/lib/narration";

const p = new PrismaClient();

async function main() {
  const char = await p.character.findUnique({ where: { slug: "mira" } });
  if (!char) throw new Error("mira not found");

  console.log("char.nsfwEnabled:", char.nsfwEnabled);

  const assets = (await p.asset.findMany({
    where: { characterId: char.id, kind: "gallery" },
    select: {
      id: true, blobUrl: true, width: true, height: true,
      sceneTag: true, expression: true, composition: true, pose: true,
      clothingTag: true, moodFit: true, locationFit: true,
      nsfwLevel: true, description: true, triggerTags: true, kind: true,
    },
  })) as PickableAsset[];

  const byLevel: Record<number, number> = {};
  for (const a of assets) byLevel[a.nsfwLevel] = (byLevel[a.nsfwLevel] ?? 0) + 1;
  console.log("assets by nsfwLevel:", byLevel);

  const nsfwAssets = assets.filter(a => a.nsfwLevel > 0);
  console.log("\nNSFW assets (nsfwLevel > 0):");
  for (const a of nsfwAssets.slice(0, 15)) {
    console.log(`  L${a.nsfwLevel} | ${a.blobUrl.split("/").pop()} | clothing=${a.clothingTag} scene=${a.sceneTag} expr=${a.expression} mood=${a.moodFit.join(",")} trig=${a.triggerTags.join(",")}`);
  }

  const sess = await p.session.findFirst({
    where: { characterId: char.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!sess) return;

  const msgs = await p.message.findMany({
    where: { sessionId: sess.id, role: "model" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { id: true, content: true, imageAssetId: true, createdAt: true },
  });

  console.log("\n=== Recent model messages ===");
  for (const m of msgs) {
    const { status, body } = extractStatus(m.content);
    const s = status as Record<string, unknown> | null;
    const horny = s && typeof s.horny === "number" ? s.horny : null;
    const statusTokens = s ? statusToTokens(s) : [];
    const bodyTokens = spotBodyTokens(body);
    const tokens = [...statusTokens, ...bodyTokens];
    const attached = assets.find(a => a.id === m.imageAssetId);
    console.log(`\n--- ${m.id.slice(-6)} @ ${m.createdAt.toISOString().slice(11,19)} ---`);
    console.log("  horny:", horny, "| tokens:", tokens);
    console.log("  attached:", attached ? `${attached.blobUrl.split("/").pop()} (L${attached.nsfwLevel})` : "(none)");
    if (s) {
      const ctx = { nsfwEnabled: char.nsfwEnabled, horny, affection: typeof s.affection === "number" ? s.affection : null };
      const scored = assets
        .map(a => ({ a, s: scoreAsset(a, tokens, ctx) }))
        .filter(x => Number.isFinite(x.s))
        .sort((x,y) => y.s - x.s)
        .slice(0, 5);
      for (const { a, s: sc } of scored) {
        console.log(`    ${sc.toString().padStart(3)} L${a.nsfwLevel} | ${a.blobUrl.split("/").pop()}`);
      }
      const nsfwOnly = assets
        .filter(a => a.nsfwLevel > 0)
        .map(a => ({ a, s: scoreAsset(a, tokens, ctx) }))
        .sort((x,y) => y.s - x.s)
        .slice(0, 3);
      console.log("  top NSFW asset scores (even if excluded):");
      for (const { a, s: sc } of nsfwOnly) {
        console.log(`    ${sc === -Infinity ? "-Inf" : sc.toString().padStart(3)} L${a.nsfwLevel} | ${a.blobUrl.split("/").pop()}`);
      }
    }
  }
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
