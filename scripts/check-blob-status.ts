// 현재 Vercel Blob store 상태 진단 — public 403 원인 파악.
import { resolve } from "node:path";
import { config } from "dotenv";
import { list } from "@vercel/blob";

config({ path: resolve(process.cwd(), ".env.prod"), override: true });

async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  console.log("token prefix:", token?.slice(0, 20) ?? "(none)");
  if (!token || /placeholder/i.test(token)) {
    console.error("BLOB_READ_WRITE_TOKEN 없음");
    return;
  }
  try {
    const result = await list({ token, limit: 5 });
    console.log("list ok — first 5 keys:");
    for (const b of result.blobs) {
      console.log(`  ${b.size.toString().padStart(8)} B  ${b.pathname}`);
    }
    console.log("\n총 hasMore:", result.hasMore, " 다음 cursor:", result.cursor ?? "(none)");
  } catch (e) {
    console.error("list failed:", e instanceof Error ? e.message : String(e));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
