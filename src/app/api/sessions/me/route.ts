import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, json } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;

  const sessions = await prisma.session.findMany({
    where: { userId: gate.userId },
    orderBy: { lastMessageAt: "desc" },
    include: {
      character: {
        include: {
          assets: {
            where: { kind: "portrait" },
            orderBy: { order: "asc" },
            take: 1,
          },
        },
      },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return json(
    sessions.map((s) => ({
      id: s.id,
      lastMessageAt: s.lastMessageAt,
      character: {
        slug: s.character.slug,
        name: s.character.name,
        portraitUrl: s.character.assets[0]?.blobUrl ?? null,
        accentColor: s.character.accentColor,
      },
      preview: s.messages[0]?.content.slice(0, 80) ?? "",
    }))
  );
}
