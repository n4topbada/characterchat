"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { useState } from "react";

export type PersonaEditable = {
  displayName: string;
  aliases: string[];
  pronouns: string | null;
  ageText: string | null;
  gender: string | null;
  species: string | null;
  role: string | null;
  backstorySummary: string;
  worldContext: string | null;
  coreBeliefs: string[];
  coreMotivations: string[];
  fears: string[];
  redLines: string[];
  speechRegister: string | null;
  speechEndings: string[];
  speechRhythm: string | null;
  speechQuirks: string[];
  languageNotes: string | null;
  appearanceKeys: string[];
  defaultAffection: number;
  defaultTrust: number;
};

export function PersonaEditor({
  characterId,
  initial,
}: {
  characterId: string;
  initial: PersonaEditable;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<PersonaEditable>(initial);

  const save = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/admin/characters/${characterId}/persona`, {
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

  const set = <K extends keyof PersonaEditable>(
    key: K,
    val: PersonaEditable[K],
  ) => setDraft((d) => ({ ...d, [key]: val }));

  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">PersonaCore</h3>
          <p className="text-[11px] text-slate-500">
            프롬프트 합성기가 조건 구조로 직렬화하는 불변 페르소나
          </p>
        </div>
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending}
          className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <Save size={12} />
          {save.isPending ? "저장 중..." : "Persona 저장"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Display name"
          value={draft.displayName}
          onChange={(v) => set("displayName", v)}
        />
        <Text
          label="Pronouns"
          value={draft.pronouns ?? ""}
          onChange={(v) => set("pronouns", v || null)}
        />
        <Text
          label="나이 (ageText)"
          value={draft.ageText ?? ""}
          onChange={(v) => set("ageText", v || null)}
        />
        <Text
          label="성별"
          value={draft.gender ?? ""}
          onChange={(v) => set("gender", v || null)}
        />
        <Text
          label="종"
          value={draft.species ?? ""}
          onChange={(v) => set("species", v || null)}
        />
        <Text
          label="역할/직업"
          value={draft.role ?? ""}
          onChange={(v) => set("role", v || null)}
        />
      </div>

      <Area
        label="Backstory (요약)"
        value={draft.backstorySummary}
        onChange={(v) => set("backstorySummary", v)}
        rows={4}
      />
      <Area
        label="세계관 / 배경 컨텍스트"
        value={draft.worldContext ?? ""}
        onChange={(v) => set("worldContext", v || null)}
        rows={3}
      />

      <ListField
        label="핵심 신념 (coreBeliefs)"
        items={draft.coreBeliefs}
        onChange={(v) => set("coreBeliefs", v)}
      />
      <ListField
        label="동기 (coreMotivations)"
        items={draft.coreMotivations}
        onChange={(v) => set("coreMotivations", v)}
      />
      <ListField
        label="두려움"
        items={draft.fears}
        onChange={(v) => set("fears", v)}
      />
      <ListField
        label="레드라인 (절대 넘지 않는 선)"
        items={draft.redLines}
        onChange={(v) => set("redLines", v)}
        tone="red"
      />

      <div className="grid grid-cols-2 gap-3">
        <Text
          label="말투 어조 (speechRegister)"
          value={draft.speechRegister ?? ""}
          onChange={(v) => set("speechRegister", v || null)}
        />
        <Text
          label="말투 리듬 (speechRhythm)"
          value={draft.speechRhythm ?? ""}
          onChange={(v) => set("speechRhythm", v || null)}
        />
      </div>
      <ListField
        label="어미 (speechEndings)"
        items={draft.speechEndings}
        onChange={(v) => set("speechEndings", v)}
      />
      <ListField
        label="말버릇 (speechQuirks)"
        items={draft.speechQuirks}
        onChange={(v) => set("speechQuirks", v)}
      />
      <Area
        label="언어 메모"
        value={draft.languageNotes ?? ""}
        onChange={(v) => set("languageNotes", v || null)}
        rows={2}
      />

      <ListField
        label="외형 키 (appearanceKeys)"
        items={draft.appearanceKeys}
        onChange={(v) => set("appearanceKeys", v)}
        tone="emerald"
      />

      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="기본 호감도 (-100~+100)"
          value={draft.defaultAffection}
          onChange={(v) => set("defaultAffection", v)}
        />
        <NumberField
          label="기본 신뢰도 (-100~+100)"
          value={draft.defaultTrust}
          onChange={(v) => set("defaultTrust", v)}
        />
      </div>
    </section>
  );
}

function Text({
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

function Area({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <textarea
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10) || 0)}
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
      />
    </div>
  );
}

function ListField({
  label,
  items,
  onChange,
  tone = "slate",
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  tone?: "slate" | "red" | "emerald";
}) {
  const [input, setInput] = useState("");
  const cls =
    tone === "red"
      ? "bg-red-50 text-red-700 border-red-200"
      : tone === "emerald"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : "bg-slate-100 text-slate-700 border-slate-200";
  return (
    <div>
      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {items.map((s, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${cls}`}
          >
            {s}
            <button
              type="button"
              onClick={() => onChange(items.filter((_, j) => j !== i))}
              className="text-slate-500 hover:text-slate-900"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (input.trim()) {
                onChange([...items, input.trim()]);
                setInput("");
              }
            }
          }}
          placeholder="항목 추가 후 Enter"
          className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500"
        />
        <button
          type="button"
          onClick={() => {
            if (input.trim()) {
              onChange([...items, input.trim()]);
              setInput("");
            }
          }}
          className="rounded-md bg-slate-900 px-2 py-1 text-xs font-bold text-white"
        >
          +
        </button>
      </div>
    </div>
  );
}
