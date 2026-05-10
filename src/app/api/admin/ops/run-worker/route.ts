import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-utils";
import { runBotTaskWorker } from "@/lib/tasks/worker";
import { logEvent } from "@/lib/observability/log";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const result = await runBotTaskWorker({ limit: body.limit ?? 5 });
  await logEvent({
    event: "admin.worker_run",
    userId: gate.userId,
    metadata: result,
  });
  return NextResponse.json(result);
}
