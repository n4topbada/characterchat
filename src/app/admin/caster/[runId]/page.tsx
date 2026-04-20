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
      sources?: {
        uri: string;
        title?: string;
        domain?: string;
        image?: string;
      }[];
      choices?: string[];
    };
    return {
      id: e.id,
      role: e.kind === "user_msg" ? ("user" as const) : ("model" as const),
      content: p.body ?? p.content ?? "",
      searchQueries: p.searchQueries ?? [],
      // OG 이미지 URL 도 함께 복구 — 썸네일이 재로드된다.
      sources: p.sources ?? [],
      choices: p.choices ?? [],
      createdAt: e.createdAt.toISOString(),
    };
  });

  return (
    // fixed inset-0 로 visualViewport 에 고정 — 모바일 가상 키보드가 올라올 때
    // 바디 scroll 이 뜨지 않고 헤더/본문/입력창 비율만 줄어들어 헤더가 상단에
    // 그대로 유지된다. (h-dvh + overflow-hidden 은 키보드 오픈 시 iOS 크롬에서
    // 바디 scroll 이 생겨 헤더가 밀려올라가는 현상이 있었다.)
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-surface">
      <TopAppBar
        title="Caster"
        subtitle={`초안 · ${
          run.status === "saved"
            ? "저장됨"
            : run.status === "draft_ready"
              ? "준비됨"
              : "작성 중"
        }`}
        backHref="/find"
      />
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
