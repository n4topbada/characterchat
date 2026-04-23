import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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

  // 빠른 경로: 이미 존재하면 바로 반환. 아래 create 가 unique violation 으로
  // 실패하더라도 같은 id 가 돌아오므로 기능적으론 안전하지만, 이게 일반 경로.
  const existing = await prisma.session.findUnique({
    where: {
      userId_characterId: { userId: gate.userId, characterId },
    },
  });
  if (existing) {
    return json({ id: existing.id, reused: true });
  }

  const id = newId();
  try {
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
  } catch (e) {
    // Race condition: findUnique 직후 다른 동시 요청이 먼저 같은
    // (userId, characterId) 로 세션을 만들었을 때 발생한다.
    // @@unique([userId, characterId]) 가 잡아서 P2002 를 던진다.
    // 이 경우 기존 세션 id 를 돌려주면 클라이언트는 "reused" 로 이어간다.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      const again = await prisma.session.findUnique({
        where: {
          userId_characterId: { userId: gate.userId, characterId },
        },
      });
      if (again) return json({ id: again.id, reused: true });
    }
    throw e;
  }
}
