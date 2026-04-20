import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  try {
    await p.$executeRawUnsafe(
      'ALTER TABLE "Character" ADD COLUMN IF NOT EXISTS "nsfwEnabled" BOOLEAN NOT NULL DEFAULT FALSE',
    );
    console.log("OK: Character.nsfwEnabled");
  } catch (e) {
    console.log("Error:", String(e).slice(0, 200));
  }
  await p.$disconnect();
}
main();
