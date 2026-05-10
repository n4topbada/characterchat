import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, errorJson } from "@/lib/api-utils";
import { sseStream } from "@/lib/sse";
import { newId } from "@/lib/ids";
import { ensureProactiveNewsTask } from "@/lib/news/autopilot";

export const runtime = "nodejs";
export const maxDuration = 60;

function payloadText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const text = p.text ?? p.content ?? p.message;
  return typeof text === "string" && text.trim().length > 0 ? text.trim() : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const session = await prisma.session.findUnique({
    where: { id },
    select: { id: true, userId: true, characterId: true },
  });
  if (!session || session.userId !== gate.userId) return errorJson("not_found", 404);

  return sseStream(async (send) => {
    const started = Date.now();
    const seenMessages = new Set<string>();
    let lastAutopilotAt = 0;

    while (Date.now() - started < 55_000) {
      if (Date.now() - lastAutopilotAt > 30_000) {
        lastAutopilotAt = Date.now();
        const auto = await ensureProactiveNewsTask({
          sessionId: id,
          userId: gate.userId,
        }).catch((e) => {
          console.warn(
            "[events] proactive news autopilot failed:",
            e instanceof Error ? e.message : String(e),
          );
          return null;
        });
        if (auto?.queued) {
          send("task_queued", { type: "proactive_news", id: auto.taskId });
        }
      }

      const task = await prisma.botTask.findFirst({
        where: {
          sessionId: id,
          userId: gate.userId,
          status: "pending",
          scheduledAt: { lte: new Date() },
          type: {
            in: ["proactive_news", "proactive_memory", "proactive_life_event", "continue_after_lookup"],
          },
        },
        orderBy: { scheduledAt: "asc" },
      });

      if (!task) {
        send("heartbeat", { now: new Date().toISOString() });
        await new Promise((r) => setTimeout(r, 2_500));
        continue;
      }

      await prisma.botTask.update({
        where: { id: task.id },
        data: { status: "running", claimedAt: new Date() },
      });

      try {
        const text = payloadText(task.payload);
        if (!text) {
          await prisma.botTask.update({
            where: { id: task.id },
            data: {
              status: "failed",
              completedAt: new Date(),
              error: "payload_text_missing",
            },
          });
          continue;
        }

        const messageId = newId();
        const createdAt = new Date();
        await prisma.message.create({
          data: {
            id: messageId,
            sessionId: id,
            role: "model",
            content: text,
            createdAt,
          },
        });
        await prisma.session.update({
          where: { id },
          data: { lastMessageAt: createdAt },
        });
        await prisma.botTask.update({
          where: { id: task.id },
          data: { status: "completed", completedAt: new Date() },
        });

        if (!seenMessages.has(messageId)) {
          seenMessages.add(messageId);
          send("message_start", {
            id: messageId,
            role: "model",
            createdAt: createdAt.toISOString(),
            proactive: true,
            taskType: task.type,
          });
          send("message_delta", { id: messageId, text });
          send("message_done", { id: messageId });
        }
      } catch (e) {
        await prisma.botTask.update({
          where: { id: task.id },
          data: {
            status: "failed",
            completedAt: new Date(),
            error: e instanceof Error ? e.message : String(e),
          },
        });
      }
    }

    send("done", { ok: true });
  });
}
