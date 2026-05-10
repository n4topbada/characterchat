import { NextResponse } from "next/server";
import { runBotTaskWorker } from "@/lib/tasks/worker";
import { logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const secret = process.env.INTERNAL_WORKER_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-worker-secret") === secret;
}

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const result = await runBotTaskWorker({ limit: body.limit });
  await logEvent({
    event: "worker.bot_tasks.completed",
    metadata: result,
  });
  return NextResponse.json(result);
}
