import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { extractStatus } from "../src/lib/narration";

const p = new PrismaClient();
async function main() {
  const char = await p.character.findUnique({ where: { slug: "mira" } });
  if (!char) throw new Error("mira not found");

  const sess = await p.session.findFirst({
    where: { characterId: char.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!sess) return;

  const msgs = await p.message.findMany({
    where: { sessionId: sess.id, role: "model" },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, content: true, imageAssetId: true, createdAt: true },
  });

  console.log(`Last ${msgs.length} model messages:`);
  for (const m of msgs) {
    const { status, body } = extractStatus(m.content);
    const bodyLen = body.trim().length;
    const s = status as Record<string, unknown> | null;
    console.log(
      `  ${m.id.slice(-6)} | ${m.createdAt.toISOString().slice(11,19)} | ` +
      `body=${bodyLen.toString().padStart(4)}c | ` +
      `status=${s ? "Y" : "N"} | ` +
      `img=${m.imageAssetId ? "Y" : "-"} | ` +
      `horny=${s?.horny ?? "-"}  mood=${s?.mood ?? "-"}  outfit=${s?.outfit ?? "-"}`
    );
    if (bodyLen < 20 || !m.imageAssetId) {
      console.log(`     content: ${JSON.stringify(m.content.slice(0, 200))}`);
    }
  }

  const withoutImg = msgs.filter(m => !m.imageAssetId).length;
  const empty = msgs.filter(m => extractStatus(m.content).body.trim().length < 20).length;
  console.log(`\nno-image: ${withoutImg}/${msgs.length}`);
  console.log(`near-empty-body: ${empty}/${msgs.length}`);

  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
