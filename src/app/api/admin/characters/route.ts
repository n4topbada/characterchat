import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const rows = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      assets: {
        where: { kind: "portrait" },
        orderBy: { order: "asc" },
        take: 1,
      },
      personaCore: { select: { id: true } },
    },
  });

  const characters = rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    accentColor: c.accentColor,
    isPublic: c.isPublic,
    portraitUrl: c.assets[0]?.blobUrl ?? null,
    hasCore: Boolean(c.personaCore),
  }));

  return NextResponse.json({ characters });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const body = (await req.json().catch(() => null)) as {
    slug?: string;
    name?: string;
    tagline?: string;
    accentColor?: string;
  } | null;
  if (!body?.slug || !body?.name) return errorJson("slug and name required", 400);

  const existing = await prisma.character.findUnique({
    where: { slug: body.slug },
  });
  if (existing) return errorJson("slug already exists", 409);

  const { ulid } = await import("ulid");
  const id = ulid();
  const character = await prisma.character.create({
    data: {
      id,
      slug: body.slug,
      name: body.name,
      tagline: body.tagline ?? "",
      accentColor: body.accentColor ?? "#64748b",
      isPublic: false,
      config: {
        create: {
          id: ulid(),
          model: "gemini-2.5-flash-lite",
          temperature: 0.8,
          maxOutputTokens: 1024,
          greeting: "…",
        },
      },
    },
  });
  return NextResponse.json({ character });
}
