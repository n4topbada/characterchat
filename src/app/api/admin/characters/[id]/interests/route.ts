import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const Interest = z.object({
  label: z.string().trim().min(1).max(80),
  query: z.string().trim().min(1).max(200),
  priority: z.number().int().min(1).max(100).default(50),
  freshnessHours: z.number().int().min(1).max(168).default(24),
  enabled: z.boolean().default(true),
});

const Body = z.object({
  interests: z.array(Interest).min(1).max(50),
  replace: z.boolean().default(false),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const interests = await prisma.characterInterest.findMany({
    where: { characterId: id },
    orderBy: [{ enabled: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ interests });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);

  const character = await prisma.character.findUnique({ where: { id }, select: { id: true } });
  if (!character) return errorJson("not_found", 404);

  await prisma.$transaction(async (tx) => {
    if (parsed.data.replace) {
      await tx.characterInterest.deleteMany({ where: { characterId: id } });
    }
    for (const item of parsed.data.interests) {
      await tx.characterInterest.upsert({
        where: {
          characterId_query: {
            characterId: id,
            query: item.query,
          },
        },
        update: {
          label: item.label,
          priority: item.priority,
          freshnessHours: item.freshnessHours,
          enabled: item.enabled,
        },
        create: {
          id: newId(),
          characterId: id,
          label: item.label,
          query: item.query,
          priority: item.priority,
          freshnessHours: item.freshnessHours,
          enabled: item.enabled,
        },
      });
    }
  });

  const interests = await prisma.characterInterest.findMany({
    where: { characterId: id },
    orderBy: [{ enabled: "desc" }, { priority: "desc" }],
  });
  return NextResponse.json({ interests });
}
