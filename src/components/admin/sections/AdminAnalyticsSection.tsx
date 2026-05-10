"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

type Stats = {
  users: number;
  characters: number;
  sessions: number;
  messages: number;
  pendingTasks: number;
  runningTasks: number;
  failedTasks: number;
  recentErrors: number;
};

type OpsData = {
  tasks: Array<{
    id: string;
    type: string;
    status: string;
    scheduledAt: string;
    attemptCount: number;
    maxAttempts: number;
    error: string | null;
    character: { name: string; slug: string } | null;
    user: { email: string | null; name: string | null } | null;
  }>;
  events: Array<{
    id: string;
    level: "debug" | "info" | "warn" | "error";
    event: string;
    message: string | null;
    status: string | null;
    latencyMs: number | null;
    createdAt: string;
    character: { name: string; slug: string } | null;
  }>;
};

export function AdminAnalyticsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: () => fetch("/api/admin/stats").then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: ops, isLoading: opsLoading } = useQuery<OpsData>({
    queryKey: ["admin", "ops"],
    queryFn: () => fetch("/api/admin/ops").then((r) => r.json()),
    refetchInterval: 15_000,
  });
  const runWorker = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/ops/run-worker", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 5 }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "ops"] });
      qc.invalidateQueries({ queryKey: ["admin", "stats"] });
    },
  });

  const cards = [
    { key: "users", label: "USERS", value: data?.users },
    { key: "characters", label: "CHARACTERS", value: data?.characters },
    { key: "sessions", label: "SESSIONS", value: data?.sessions },
    { key: "messages", label: "MESSAGES", value: data?.messages },
    { key: "pendingTasks", label: "PENDING", value: data?.pendingTasks },
    { key: "runningTasks", label: "RUNNING", value: data?.runningTasks },
    { key: "failedTasks", label: "FAILED", value: data?.failedTasks },
    { key: "recentErrors", label: "ERRORS 24H", value: data?.recentErrors },
  ];

  return (
    <div className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Operations</h3>
          <p className="text-xs text-slate-500">BotTask queue and runtime events</p>
        </div>
        <button
          type="button"
          onClick={() => runWorker.mutate()}
          disabled={runWorker.isPending}
          className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {runWorker.isPending ? "running..." : "Run worker"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div
            key={c.key}
            className="rounded-md border border-slate-200 bg-white p-3"
          >
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {c.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-800">
              {isLoading ? "-" : (c.value ?? 0)}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Task Queue
          </h4>
          {opsLoading && <span className="text-[11px] text-slate-400">loading</span>}
        </div>
        <div className="divide-y divide-slate-100">
          {(ops?.tasks ?? []).slice(0, 16).map((task) => (
            <div key={task.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-800">
                    {task.type}
                  </div>
                  <div className="truncate text-[11px] text-slate-500">
                    {task.character?.name ?? "unknown"} · {task.user?.email ?? "no user"}
                  </div>
                </div>
                <StatusBadge status={task.status} />
              </div>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
                <span>
                  attempt {task.attemptCount}/{task.maxAttempts}
                </span>
                <span>{new Date(task.scheduledAt).toLocaleString()}</span>
              </div>
              {task.error && (
                <div className="mt-1 line-clamp-2 rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                  {task.error}
                </div>
              )}
            </div>
          ))}
          {!ops?.tasks?.length && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No task history yet.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-md border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
            Event Log
          </h4>
        </div>
        <div className="divide-y divide-slate-100">
          {(ops?.events ?? []).slice(0, 28).map((event) => (
            <div key={event.id} className="px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 truncate text-xs font-semibold text-slate-800">
                  {event.event}
                </div>
                <LevelBadge level={event.level} />
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px] text-slate-400">
                <span>{event.character?.name ?? event.status ?? "runtime"}</span>
                <span>{new Date(event.createdAt).toLocaleString()}</span>
              </div>
              {event.message && (
                <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                  {event.message}
                </div>
              )}
              {event.latencyMs != null && (
                <div className="mt-1 text-[10px] text-slate-400">
                  latency {event.latencyMs}ms
                </div>
              )}
            </div>
          ))}
          {!ops?.events?.length && (
            <div className="px-3 py-6 text-center text-xs text-slate-400">
              No event log yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "failed"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : status === "running"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "completed"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
      {status}
    </span>
  );
}

function LevelBadge({ level }: { level: "debug" | "info" | "warn" | "error" }) {
  const cls =
    level === "error"
      ? "bg-rose-100 text-rose-700"
      : level === "warn"
        ? "bg-amber-100 text-amber-700"
        : "bg-slate-100 text-slate-600";
  return (
    <span className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase ${cls}`}>
      {level}
    </span>
  );
}
