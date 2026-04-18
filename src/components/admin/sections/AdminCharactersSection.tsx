"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Pencil, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

type CharRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  isPublic: boolean;
  portraitUrl: string | null;
  hasCore: boolean;
};

export function AdminCharactersSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ characters: CharRow[] }>({
    queryKey: ["admin", "characters"],
    queryFn: () => fetch("/api/admin/characters").then((r) => r.json()),
  });
  const [filter, setFilter] = useState("");

  const togglePublic = useMutation({
    mutationFn: async ({ id, isPublic }: { id: string; isPublic: boolean }) => {
      const res = await fetch(`/api/admin/characters/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isPublic }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "characters"] }),
  });

  const rows = (data?.characters ?? []).filter(
    (c) =>
      !filter ||
      c.name.toLowerCase().includes(filter.toLowerCase()) ||
      c.slug.toLowerCase().includes(filter.toLowerCase()),
  );

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="이름/slug 로 검색..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
        />
        <span className="text-xs text-slate-500">{rows.length} 개</span>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">loading...</div>
      ) : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <div
                className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-slate-100"
                style={{ aspectRatio: "3/4" }}
              >
                {c.portraitUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.portraitUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <ImageIcon size={18} />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-slate-800">
                    {c.name}
                  </h3>
                  {!c.hasCore && (
                    <span className="rounded-sm bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                      NO_CORE
                    </span>
                  )}
                </div>
                <p className="truncate text-xs text-slate-500">/{c.slug}</p>
                <p className="truncate text-xs text-slate-400">{c.tagline}</p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    togglePublic.mutate({ id: c.id, isPublic: !c.isPublic })
                  }
                  className={`rounded-md p-2 transition-colors ${
                    c.isPublic
                      ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                  title={c.isPublic ? "공개 중 — 비공개로 전환" : "비공개 — 공개로 전환"}
                >
                  {c.isPublic ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <Link
                  href={{ pathname: `/admin/characters/${c.id}` as `/admin/characters/${string}` }}
                  className="rounded-md bg-indigo-600 p-2 text-white hover:bg-indigo-500"
                  title="상세 편집"
                >
                  <Pencil size={14} />
                </Link>
              </div>
            </div>
          ))}
          {rows.length === 0 && !isLoading && (
            <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              캐릭터가 없습니다. Caster 콘솔에서 새로 생성하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
