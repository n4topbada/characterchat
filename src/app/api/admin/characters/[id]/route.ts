import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      config: true,
      personaCore: true,
      assets: { orderBy: { order: "asc" } },
    },
  });
  if (!character) return errorJson("not found", 404);
  return NextResponse.json({ character });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    tagline?: string;
    accentColor?: string;
    isPublic?: boolean;
  } | null;
  if (!body) return errorJson("invalid body", 400);

  const character = await prisma.character.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.tagline !== undefined ? { tagline: body.tagline } : {}),
      ...(body.accentColor !== undefined ? { accentColor: body.accentColor } : {}),
      ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
    },
  });
  return NextResponse.json({ character });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;
  await prisma.character.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
