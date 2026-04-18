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

  // 로컬 정적 경로(`/portraits/...`)이면 실제 파일도 제거
  if (asset.blobUrl.startsWith("/")) {
    const abs = path.resolve(
      process.cwd(),
      "public",
      asset.blobUrl.replace(/^\/+/, ""),
    );
    await fs.unlink(abs).catch(() => void 0);
  }

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

  return NextResponse.json({ ok: true });
}
