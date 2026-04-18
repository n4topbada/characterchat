"use client";

import { useQuery } from "@tanstack/react-query";

type Stats = {
  users: number;
  admins: number;
  characters: number;
  publicCharacters: number;
  sessions: number;
  messages: number;
};

export function AdminAnalyticsSection() {
  const { data, isLoading } = useQuery<Stats>({
    queryKey: ["admin", "stats"],
    queryFn: () => fetch("/api/admin/stats").then((r) => r.json()),
    staleTime: 30_000,
  });

  const cards = [
    { key: "users", label: "USERS", value: data?.users },
    { key: "admins", label: "ADMINS", value: data?.admins },
    { key: "characters", label: "CHARACTERS", value: data?.characters },
    {
      key: "publicCharacters",
      label: "PUBLIC",
      value: data?.publicCharacters,
    },
    { key: "sessions", label: "SESSIONS", value: data?.sessions },
    { key: "messages", label: "MESSAGES", value: data?.messages },
  ];

  return (
    <div className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Telemetry</h3>
        {isLoading && <span className="text-[11px] text-slate-400">loading</span>}
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
              {c.value ?? "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
