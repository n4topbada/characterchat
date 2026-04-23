import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const asset = await prisma.asset.findUnique({ where: { id } });
  if (!asset) return errorJson("not found", 404);

  // 순서 중요: DB 트랜잭션을 먼저 커밋해서 "DB 는 지워졌는데 파일은 남음"
  // 만 발생하게 한다. 반대로 하면 "파일은 지웠는데 DB 에 blobUrl 이 남아
  // 유저가 404 를 받는" 최악의 시나리오가 된다.
  await prisma.$transaction(async (tx) => {
    await tx.character.updateMany({
      where: { portraitAssetId: id },
      data: { portraitAssetId: null },
    });
    await tx.character.updateMany({
      where: { heroAssetId: id },
      data: { heroAssetId: null },
    });
    await tx.asset.delete({ where: { id } });
  });

  // DB 커밋 후에 로컬 정적 파일 cleanup. 실패해도 DB 는 이미 일관 상태.
  if (asset.blobUrl.startsWith("/")) {
    const abs = path.resolve(
      process.cwd(),
      "public",
      asset.blobUrl.replace(/^\/+/, ""),
    );
    await fs.unlink(abs).catch(() => void 0);
  }

  return NextResponse.json({ ok: true });
}
