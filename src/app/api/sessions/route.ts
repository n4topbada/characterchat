import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, json, errorJson } from "@/lib/api-utils";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";

const Body = z.object({ characterId: z.string().min(1) });

export async function POST(req: Request) {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);

  const { characterId } = parsed.data;
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { config: { select: { greeting: true } } },
  });
  if (!character) return errorJson("character_not_found", 404);

  const existing = await prisma.session.findUnique({
    where: {
      userId_characterId: { userId: gate.userId, characterId },
    },
  });
  if (existing) {
    return json({ id: existing.id, reused: true });
  }

  const id = newId();
  await prisma.session.create({
    data: {
      id,
      userId: gate.userId,
      characterId,
      messages: character.config?.greeting
        ? {
            create: [
              {
                id: newId(),
                role: "model",
                content: character.config.greeting,
              },
            ],
          }
        : undefined,
    },
  });

  return json({ id, reused: false }, 201);
}
