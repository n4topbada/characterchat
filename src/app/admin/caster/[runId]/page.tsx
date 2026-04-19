import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { TopAppBar } from "@/components/nav/TopAppBar";
import { CasterConsole, type CasterMessage } from "./CasterConsole";

export const dynamic = "force-dynamic";

export default async function CasterRunPage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin/caster");
  if (session.user.role !== "admin") redirect("/find");

  const { runId } = await params;
  const run = await prisma.casterRun.findFirst({
    where: { id: runId, adminUserId: session.user.id },
    include: {
      events: {
        where: { kind: { in: ["user_msg", "model_msg"] } },
        orderBy: { createdAt: "asc" },
        select: { id: true, kind: true, payload: true, createdAt: true },
      },
    },
  });
  if (!run) notFound();

  const initialMessages: CasterMessage[] = run.events.map((e) => {
    const p = (e.payload ?? {}) as {
      content?: string;
      body?: string;
      searchQueries?: string[];
      sources?: { uri: string; title?: string; domain?: string }[];
      choices?: string[];
    };
    return {
      id: e.id,
      role: e.kind === "user_msg" ? ("user" as const) : ("model" as const),
      content: p.body ?? p.content ?? "",
      searchQueries: p.searchQueries ?? [],
      sources: p.sources ?? [],
      choices: p.choices ?? [],
      createdAt: e.createdAt.toISOString(),
    };
  });

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-surface">
      <TopAppBar title="Caster" subtitle={`run · ${run.status}`} />
      <CasterConsole
        runId={run.id}
        initialStatus={run.status}
        initialMessages={initialMessages}
        initialDraft={run.draftJson as Record<string, unknown> | null}
        savedCharacterId={run.savedCharacterId ?? null}
      />
    </main>
  );
}
