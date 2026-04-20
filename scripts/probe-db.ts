import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
async function main() {
  const cols = await p.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name='Asset' ORDER BY ordinal_position",
  );
  console.log("Asset columns:", cols.map((c) => c.column_name).join(", "));
  const ccols = await p.$queryRawUnsafe<{ column_name: string }[]>(
    "SELECT column_name FROM information_schema.columns WHERE table_name='Character' ORDER BY ordinal_position",
  );
  console.log("Character columns:", ccols.map((c) => c.column_name).join(", "));
  await p.$disconnect();
}
main();
