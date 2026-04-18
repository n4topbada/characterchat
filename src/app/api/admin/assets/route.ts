import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const rows = await prisma.asset.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: {
      character: { select: { name: true, slug: true } },
    },
  });

  const assets = rows.map((a) => ({
    id: a.id,
    characterId: a.characterId,
    characterSlug: a.character.slug,
    characterName: a.character.name,
    kind: a.kind,
    blobUrl: a.blobUrl,
    width: a.width,
    height: a.height,
    order: a.order,
    createdAt: a.createdAt.toISOString(),
  }));

  return NextResponse.json({ assets });
}
