import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const runs = await prisma.casterRun.findMany({
    where: { adminUserId: guard.userId },
    orderBy: { startedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      startedAt: true,
      endedAt: true,
      savedCharacterId: true,
      draftJson: true,
    },
  });

  return NextResponse.json({ runs });
}

export async function POST() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const run = await prisma.casterRun.create({
    data: {
      id: newId(),
      adminUserId: guard.userId,
      status: "running",
    },
    select: { id: true, status: true, startedAt: true },
  });

  return NextResponse.json({ run }, { status: 201 });
}
