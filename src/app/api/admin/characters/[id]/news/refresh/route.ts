import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import {
  draftProactiveNewsLine,
  saveRealtimeNewsChunk,
  searchRealtimeNews,
} from "@/lib/news/realtime";
import { buildTemporalContext } from "@/lib/temporal/timeline";
import { newId } from "@/lib/ids";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    notifySessions?: boolean;
    maxSessions?: number;
  };

  const character = await prisma.character.findUnique({
    where: { id },
    include: { personaCore: true, interests: { where: { enabled: true } } },
  });
  if (!character || !character.personaCore) return errorJson("not_found", 404);

  const temporal = buildTemporalContext({
    lastInteractionAt: null,
    character: { slug: character.slug, role: character.personaCore.role },
  });

  const results = [];
  for (const interest of character.interests.sort((a, b) => b.priority - a.priority).slice(0, 8)) {
    const found = await searchRealtimeNews({
      query: interest.query,
      characterName: character.personaCore.displayName,
      nowLabel: temporal.localLabel,
    });
    const chunkId = await saveRealtimeNewsChunk({
      characterId: character.id,
      topic: interest.query,
      summary: found.summary,
      sourceUrls: found.sourceUrls,
      raw: found.raw,
      ttlHours: interest.freshnessHours,
    });
    await prisma.characterInterest.update({
      where: { id: interest.id },
      data: { lastCheckedAt: new Date() },
    });
    let queuedTasks = 0;
    if (body.notifySessions !== false) {
      const sessions = await prisma.session.findMany({
        where: { characterId: character.id },
        orderBy: { lastMessageAt: "desc" },
        take: Math.max(1, Math.min(body.maxSessions ?? 20, 100)),
        select: { id: true, userId: true },
      });
      const text = await draftProactiveNewsLine({
        characterName: character.personaCore.displayName,
        speechHint: character.personaCore.speechRegister,
        summary: found.summary,
        nowLabel: temporal.localLabel,
      }).catch(() => "");
      if (text) {
        for (const session of sessions) {
          await prisma.botTask.create({
            data: {
              id: newId(),
              sessionId: session.id,
              characterId: character.id,
              userId: session.userId,
              type: "proactive_news",
              status: "pending",
              scheduledAt: new Date(),
              payload: {
                text,
                chunkId,
                query: interest.query,
                sourceUrls: found.sourceUrls,
              },
            },
          });
          queuedTasks += 1;
        }
      }
    }
    results.push({ interestId: interest.id, query: interest.query, chunkId, queuedTasks });
  }

  return NextResponse.json({ refreshed: results });
}
