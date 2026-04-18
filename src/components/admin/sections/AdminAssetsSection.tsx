"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Upload, Wand2, Trash2, Image as ImageIcon } from "lucide-react";

type AssetRow = {
  id: string;
  characterId: string;
  characterSlug: string;
  characterName: string;
  kind: "portrait" | "hero" | "gallery";
  blobUrl: string;
  width: number;
  height: number;
  order: number;
  createdAt: string;
};

export function AdminAssetsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ assets: AssetRow[] }>({
    queryKey: ["admin", "assets"],
    queryFn: () => fetch("/api/admin/assets").then((r) => r.json()),
  });

  const [genFor, setGenFor] = useState<string | null>(null);
  const generate = useMutation({
    mutationFn: async (characterId: string) => {
      setGenFor(characterId);
      const res = await fetch(
        `/api/admin/characters/${characterId}/portrait/generate`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSettled: () => {
      setGenFor(null);
      qc.invalidateQueries({ queryKey: ["admin", "assets"] });
      qc.invalidateQueries({ queryKey: ["admin", "characters"] });
    },
  });

  const removeAsset = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/assets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "assets"] });
      qc.invalidateQueries({ queryKey: ["admin", "characters"] });
    },
  });

  const assets = data?.assets ?? [];
  const grouped = assets.reduce<
    Record<string, { name: string; slug: string; assets: AssetRow[] }>
  >((acc, a) => {
    if (!acc[a.characterId]) {
      acc[a.characterId] = {
        name: a.characterName,
        slug: a.characterSlug,
        assets: [],
      };
    }
    acc[a.characterId].assets.push(a);
    return acc;
  }, {});

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          캐릭터별 에셋. 포트레이트는 3:4 1K, Gemini 이미지 모델로 재생성 가능.
        </p>
      </div>

      {isLoading ? (
        <div className="text-sm text-slate-500">loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          에셋이 없습니다. 각 캐릭터 상세 페이지에서 업로드하세요.
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([charId, g]) => (
            <section key={charId} className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">
                    {g.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">/{g.slug}</p>
                </div>
                <button
                  type="button"
                  onClick={() => generate.mutate(charId)}
                  disabled={generate.isPending && genFor === charId}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <Wand2 size={12} />
                  {generate.isPending && genFor === charId
                    ? "생성 중..."
                    : "포트레이트 재생성"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {g.assets.map((a) => (
                  <div
                    key={a.id}
                    className="group relative overflow-hidden rounded-md border border-slate-200 bg-slate-100"
                    style={{ aspectRatio: "3/4" }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={a.blobUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                    <span className="absolute left-1 top-1 rounded-sm bg-slate-900/70 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">
                      {a.kind}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm("에셋을 삭제하시겠습니까?"))
                          removeAsset.mutate(a.id);
                      }}
                      className="absolute bottom-1 right-1 rounded-md bg-red-600/90 p-1 text-white opacity-0 transition-opacity hover:bg-red-500 group-hover:opacity-100"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="rounded-md border border-slate-200 bg-slate-100/80 p-3 text-[11px] leading-relaxed text-slate-600">
        <div className="mb-1 flex items-center gap-1 font-semibold text-slate-700">
          <ImageIcon size={12} />
          <Upload size={12} />
          <span>저장 경로</span>
        </div>
        <code className="block font-mono">/public/portraits/{"{slug}.png"}</code>
        <p className="mt-1">
          MVP 단계에서는 public 정적 파일로 저장. 프로덕션에서는 Vercel Blob 으로
          이전.
        </p>
      </div>
    </div>
  );
}
