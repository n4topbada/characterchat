// 이미지 선택 파이프라인 진단.
// 1) 가장 최근 model 메시지의 <status> 파싱
// 2) statusToTokens 로 토큰 변환
// 3) Mira 의 gallery asset 점수 순위 top10
// 4) 실제 메시지에 첨부된 imageAssetId 와 비교

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import {
  pickBestAsset,
  scoreAsset,
  spotBodyTokens,
  statusToTokens,
  type PickableAsset,
} from "../src/lib/assets/pickAsset";
import { extractStatus } from "../src/lib/narration";

const p = new PrismaClient();

async function main() {
  const char = await p.character.findUnique({ where: { slug: "mira" } });
  if (!char) throw new Error("mira not found");

  const sess = await p.session.findFirst({
    where: { characterId: char.id },
    orderBy: { lastMessageAt: "desc" },
  });
  if (!sess) throw new Error("no session");

  const recentModelMsgs = await p.message.findMany({
    where: { sessionId: sess.id, role: "model" },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      content: true,
      imageAssetId: true,
      createdAt: true,
    },
  });

  const assets = (await p.asset.findMany({
    where: { characterId: char.id, kind: "gallery" },
    select: {
      id: true,
      blobUrl: true,
      width: true,
      height: true,
      sceneTag: true,
      expression: true,
      composition: true,
      pose: true,
      clothingTag: true,
      moodFit: true,
      locationFit: true,
      nsfwLevel: true,
      description: true,
      triggerTags: true,
      kind: true,
    },
  })) as PickableAsset[];

  console.log(`=== Mira gallery: ${assets.length} assets ===`);
  console.log(`=== char.nsfwEnabled = ${char.nsfwEnabled} ===\n`);

  for (const m of recentModelMsgs) {
    const { status, body } = extractStatus(m.content);
    console.log(
      `--- msg ${m.id.slice(-6)} @ ${m.createdAt.toISOString().slice(11, 19)} ---`,
    );
    console.log("status:", JSON.stringify(status));
    console.log("attached imageAssetId:", m.imageAssetId ?? "(none)");
    if (m.imageAssetId) {
      const a = assets.find((x) => x.id === m.imageAssetId);
      if (a) {
        console.log("attached asset:", {
          url: a.blobUrl.split("/").pop(),
          clothing: a.clothingTag,
          scene: a.sceneTag,
          expr: a.expression,
          mood: a.moodFit,
          loc: a.locationFit,
          nsfw: a.nsfwLevel,
        });
      }
    }
    if (status && typeof status === "object") {
      const statusTokens = statusToTokens(status);
      const bodyTokens = spotBodyTokens(body);
      const tokens = [...statusTokens, ...bodyTokens];
      console.log("status tokens:", statusTokens);
      console.log("body tokens:  ", bodyTokens);
      const s = status as Record<string, unknown>;
      const ctx = {
        nsfwEnabled: char.nsfwEnabled,
        horny: typeof s.horny === "number" ? (s.horny as number) : null,
        affection: typeof s.affection === "number" ? (s.affection as number) : null,
      };
      const scored = assets
        .map((a) => ({ a, s: scoreAsset(a, tokens, ctx) }))
        .filter((x) => Number.isFinite(x.s))
        .sort((x, y) => y.s - x.s)
        .slice(0, 6);
      console.log("top candidates:");
      for (const { a, s } of scored) {
        console.log(
          `  ${s.toString().padStart(3)} | ${a.blobUrl.split("/").pop()} | clothing=${a.clothingTag ?? "-"} scene=${a.sceneTag ?? "-"} expr=${a.expression ?? "-"} mood=${a.moodFit.join(",")} loc=${a.locationFit.join(",")} trig=${a.triggerTags.join(",")} nsfw=${a.nsfwLevel}`,
        );
      }
      const best = pickBestAsset(assets, tokens, ctx, { messageId: m.id });
      console.log(
        "picker would choose:",
        best ? best.blobUrl.split("/").pop() : "(none)",
      );
    }
    console.log("body preview:", body.slice(0, 80).replace(/\n/g, " "));
    console.log();
  }

  await p.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
