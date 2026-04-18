"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Save,
  Wand2,
  Trash2,
  Image as ImageIcon,
  Eye,
  EyeOff,
} from "lucide-react";
import { PersonaEditor, type PersonaEditable } from "./PersonaEditor";
import { KnowledgeEditor } from "./KnowledgeEditor";

type Character = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  isPublic: boolean;
  config: {
    id: string;
    model: string;
    temperature: number;
    maxOutputTokens: number;
    greeting: string;
  } | null;
  core: PersonaEditable | null;
  assets: {
    id: string;
    kind: string;
    blobUrl: string;
    width: number;
    height: number;
  }[];
};

type Tab = "overview" | "persona" | "knowledge" | "assets";

export function AdminCharacterEditor({
  character,
}: {
  character: Character;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("overview");
  const [draft, setDraft] = useState({
    name: character.name,
    tagline: character.tagline,
    accentColor: character.accentColor,
    isPublic: character.isPublic,
  });
  const [generating, setGenerating] = useState(false);

  const portrait = character.assets.find((a) => a.kind === "portrait");

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/characters/${character.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "characters"] });
      router.refresh();
    },
  });

  async function regeneratePortrait() {
    setGenerating(true);
    try {
      const res = await fetch(
        `/api/admin/characters/${character.id}/portrait/generate`,
        { method: "POST" },
      );
      if (!res.ok) throw new Error(await res.text());
      qc.invalidateQueries({ queryKey: ["admin", "assets"] });
      qc.invalidateQueries({ queryKey: ["admin", "characters"] });
      router.refresh();
    } catch (e) {
      alert("생성 실패: " + (e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteAsset(id: string) {
    if (!confirm("에셋을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/admin/assets/${id}`, { method: "DELETE" });
    if (!res.ok) return alert("삭제 실패");
    router.refresh();
  }

  return (
    <main className="min-h-full bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <Link
            href={"/admin" as "/admin"}
            className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
          >
            <ArrowLeft size={16} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-900">
              {draft.name}
            </h1>
            <p className="truncate text-[11px] font-mono text-slate-500">
              /{character.slug} · {character.id}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setDraft((d) => ({ ...d, isPublic: !d.isPublic }))
            }
            className={[
              "flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-bold",
              draft.isPublic
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200 text-slate-600",
            ].join(" ")}
          >
            {draft.isPublic ? <Eye size={12} /> : <EyeOff size={12} />}
            {draft.isPublic ? "PUBLIC" : "DRAFT"}
          </button>
          <button
            type="button"
            disabled={save.isPending}
            onClick={() => save.mutate()}
            className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
          >
            <Save size={12} />
            {save.isPending ? "저장 중..." : "저장"}
          </button>
        </div>
        <nav className="flex gap-1 px-4 pb-2">
          {(["overview", "persona", "knowledge", "assets"] as Tab[]).map(
            (t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold capitalize",
                  tab === t
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                {t}
              </button>
            ),
          )}
        </nav>
      </header>

      <div className="mx-auto max-w-3xl p-5 space-y-5">
        {tab === "overview" && (
          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex gap-4">
              <div
                className="h-24 w-18 overflow-hidden rounded-md bg-slate-100"
                style={{ aspectRatio: "3/4", width: 72 }}
              >
                {portrait ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={portrait.blobUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-400">
                    <ImageIcon size={16} />
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2">
                <Field
                  label="이름"
                  value={draft.name}
                  onChange={(v) => setDraft({ ...draft, name: v })}
                />
                <Field
                  label="태그라인"
                  value={draft.tagline}
                  onChange={(v) => setDraft({ ...draft, tagline: v })}
                />
                <div className="flex items-center gap-2">
                  <label className="text-[11px] font-bold uppercase text-slate-500">
                    Accent
                  </label>
                  <input
                    type="color"
                    value={draft.accentColor}
                    onChange={(e) =>
                      setDraft({ ...draft, accentColor: e.target.value })
                    }
                    className="h-8 w-14 rounded border border-slate-300"
                  />
                  <code className="font-mono text-xs text-slate-600">
                    {draft.accentColor}
                  </code>
                </div>
              </div>
            </div>

            {character.config && (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs">
                <div className="mb-2 font-bold uppercase tracking-wider text-slate-500">
                  Config
                </div>
                <dl className="grid grid-cols-3 gap-2">
                  <Info label="Model" value={character.config.model} />
                  <Info
                    label="Temp"
                    value={character.config.temperature.toFixed(2)}
                  />
                  <Info
                    label="Max tokens"
                    value={String(character.config.maxOutputTokens)}
                  />
                </dl>
                <div className="mt-3">
                  <div className="text-[11px] font-bold uppercase text-slate-500">
                    Greeting
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">
                    {character.config.greeting}
                  </p>
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "persona" &&
          (character.core ? (
            <PersonaEditor
              characterId={character.id}
              initial={character.core}
            />
          ) : (
            <p className="rounded-md border border-dashed border-amber-300 bg-amber-50 p-4 text-xs text-amber-800">
              PersonaCore 가 아직 없습니다. Caster 에서 생성하거나 seed.ts 를 다시
              돌리세요.
            </p>
          ))}

        {tab === "knowledge" && (
          <KnowledgeEditor characterId={character.id} />
        )}

        {tab === "assets" && (
          <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Portrait
                </h3>
                <p className="text-[11px] text-slate-500">
                  3:4 / 1K, Gemini 이미지 모델
                </p>
              </div>
              <button
                type="button"
                disabled={generating}
                onClick={regeneratePortrait}
                className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <Wand2 size={12} />
                {generating ? "생성 중..." : "재생성"}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {character.assets.length === 0 && (
                <div className="col-span-3 rounded-md border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
                  에셋이 없습니다.
                </div>
              )}
              {character.assets.map((a) => (
                <div
                  key={a.id}
                  className="group relative overflow-hidden rounded-md border border-slate-200"
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
                  <span className="absolute right-1 top-1 rounded-sm bg-slate-900/70 px-1 py-0.5 text-[9px] text-white">
                    {a.width}×{a.height}
                  </span>
                  <button
                    type="button"
                    onClick={() => deleteAsset(a.id)}
                    className="absolute bottom-1 right-1 rounded-md bg-red-600/90 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="font-mono text-xs text-slate-800">{value}</div>
    </div>
  );
}
