import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const run = await prisma.casterRun.findFirst({
    where: { id, adminUserId: guard.userId },
    include: {
      events: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ run });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const run = await prisma.casterRun.findFirst({
    where: { id, adminUserId: guard.userId },
    select: { id: true },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await prisma.casterRun.delete({ where: { id: run.id } });
  return NextResponse.json({ ok: true });
}
