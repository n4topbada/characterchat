import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, json, errorJson } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const s = await prisma.session.findUnique({ where: { id } });
  if (!s || s.userId !== gate.userId) return errorJson("not_found", 404);

  await prisma.session.delete({ where: { id } });
  return json({ ok: true });
}
