import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";
import { sseStream } from "@/lib/sse";
import { streamChat, type ChatTurn } from "@/lib/gemini/chat";
import { MODELS } from "@/lib/gemini/client";
import { CASTER_SYSTEM, extractDraft } from "@/lib/caster/prompt";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  content: z.string().min(1).max(4000),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const run = await prisma.casterRun.findFirst({
    where: { id, adminUserId: guard.userId },
    select: { id: true, status: true },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.status === "saved" || run.status === "cancelled") {
    return NextResponse.json({ error: "run_closed" }, { status: 409 });
  }

  // user_msg 이벤트 기록
  await prisma.casterEvent.create({
    data: {
      id: newId(),
      runId: run.id,
      kind: "user_msg",
      payload: { content: parsed.data.content },
    },
  });

  // 이전 대화 이벤트 → ChatTurn[] 구성
  const events = await prisma.casterEvent.findMany({
    where: { runId: run.id, kind: { in: ["user_msg", "model_msg"] } },
    orderBy: { createdAt: "asc" },
    select: { kind: true, payload: true },
  });

  const history: ChatTurn[] = events.map((e) => ({
    role: e.kind === "user_msg" ? "user" : "model",
    content: (e.payload as { content?: string })?.content ?? "",
  }));

  return sseStream(async (send) => {
    let full = "";
    try {
      for await (const delta of streamChat({
        model: MODELS.chat,
        systemInstruction: CASTER_SYSTEM,
        history,
        temperature: 0.7,
        maxOutputTokens: 2048,
      })) {
        full += delta;
        send("delta", { text: delta });
      }
    } catch (err) {
      send("error", {
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    // model_msg 이벤트 기록
    await prisma.casterEvent.create({
      data: {
        id: newId(),
        runId: run.id,
        kind: "model_msg",
        payload: { content: full },
      },
    });

    // 응답에 드래프트 JSON 이 섞여 있으면 draftJson 갱신 + draft_ready
    const draft = extractDraft(full);
    if (draft) {
      await prisma.casterRun.update({
        where: { id: run.id },
        data: {
          draftJson: draft as unknown as object,
          status: "draft_ready",
        },
      });
      send("draft_ready", { draft });
    }

    send("done", { ok: true });
  });
}
