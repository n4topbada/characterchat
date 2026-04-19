"use client";

// Caster 가 점진적으로 채우는 "캐릭터 시트" 프리뷰.
// - PersonaCore 편집기와 동일한 필드 구성을 사람이 읽는 형태로 보여준다.
// - 빈 필드는 em-dash 로 placeholder 렌더.
// - 최근에 변경된 키는 ring 으로 짧게 강조 (updatedKeys prop).
// - 수치 상태값(defaultAffection 등)과 behaviorPatterns 는 이 시트에서 다루지 않는다.

import { useMemo } from "react";

type PersonaPartial = {
  displayName?: string;
  aliases?: string[];
  pronouns?: string | null;
  ageText?: string | null;
  gender?: string | null;
  species?: string | null;
  role?: string | null;
  backstorySummary?: string;
  worldContext?: string | null;
  coreBeliefs?: string[];
  coreMotivations?: string[];
  fears?: string[];
  redLines?: string[];
  speechRegister?: string | null;
  speechEndings?: string[];
  speechRhythm?: string | null;
  speechQuirks?: string[];
  languageNotes?: string | null;
  appearanceKeys?: string[];
};

export type SheetDraft = {
  slug?: string | null;
  name?: string | null;
  tagline?: string | null;
  accentColor?: string | null;
  greeting?: string | null;
  persona?: PersonaPartial;
};

type Props = {
  draft: SheetDraft | null;
  /** 가장 최근 patch 에 포함된 키 경로(예: "name", "persona.role"). 깜빡임 강조용. */
  updatedKeys?: string[];
  /** 전체 필수 필드 대비 몇 개 찼는지 표시하는 진행바에 쓰임. */
  completionPct?: number;
};

const KEY_LABELS: Record<string, string> = {
  name: "이름",
  slug: "슬러그",
  tagline: "한 줄 소개",
  accentColor: "액센트 컬러",
  greeting: "인사말",
  "persona.displayName": "표시명",
  "persona.aliases": "별칭",
  "persona.pronouns": "대명사",
  "persona.ageText": "나이",
  "persona.gender": "성별",
  "persona.species": "종",
  "persona.role": "역할",
  "persona.backstorySummary": "배경 요약",
  "persona.worldContext": "세계관",
  "persona.coreBeliefs": "핵심 신념",
  "persona.coreMotivations": "동기",
  "persona.fears": "두려움",
  "persona.redLines": "레드라인",
  "persona.speechRegister": "어조",
  "persona.speechEndings": "종결어미",
  "persona.speechRhythm": "리듬",
  "persona.speechQuirks": "말버릇",
  "persona.languageNotes": "언어 규칙",
  "persona.appearanceKeys": "외형 키워드",
};

export function computeCompletion(draft: SheetDraft | null): number {
  if (!draft) return 0;
  const keys: (keyof SheetDraft | `persona.${keyof PersonaPartial}`)[] = [
    "name",
    "slug",
    "tagline",
    "accentColor",
    "greeting",
    "persona.displayName",
    "persona.role",
    "persona.backstorySummary",
    "persona.coreBeliefs",
    "persona.coreMotivations",
    "persona.speechRegister",
    "persona.speechEndings",
    "persona.appearanceKeys",
  ];
  let filled = 0;
  for (const k of keys) {
    const v = getAt(draft, k);
    if (valueIsFilled(v)) filled += 1;
  }
  return Math.round((filled / keys.length) * 100);
}

function getAt(draft: SheetDraft, path: string): unknown {
  if (!path.includes(".")) return (draft as Record<string, unknown>)[path];
  const [a, b] = path.split(".");
  const parent = (draft as Record<string, unknown>)[a];
  if (!parent || typeof parent !== "object") return undefined;
  return (parent as Record<string, unknown>)[b];
}

function valueIsFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function CharacterSheet({ draft, updatedKeys, completionPct }: Props) {
  const recent = useMemo(() => new Set(updatedKeys ?? []), [updatedKeys]);
  const pct = completionPct ?? computeCompletion(draft);
  const d = draft ?? {};
  const p = d.persona ?? {};
  const accent = d.accentColor ?? null;

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
          <span>커버리지</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Section title="기본 정보">
        <Row label={KEY_LABELS["name"]} keyPath="name" recent={recent}>
          <TextValue value={d.name} />
        </Row>
        <Row
          label={KEY_LABELS["persona.displayName"]}
          keyPath="persona.displayName"
          recent={recent}
        >
          <TextValue value={p.displayName} />
        </Row>
        <Row
          label={KEY_LABELS["persona.aliases"]}
          keyPath="persona.aliases"
          recent={recent}
        >
          <ChipList items={p.aliases} />
        </Row>
        <Row label={KEY_LABELS["tagline"]} keyPath="tagline" recent={recent}>
          <TextValue value={d.tagline} />
        </Row>
        <Row label={KEY_LABELS["slug"]} keyPath="slug" recent={recent}>
          {d.slug ? (
            <code className="font-mono text-xs text-on-surface">/{d.slug}</code>
          ) : (
            <Empty />
          )}
        </Row>
        <Row
          label={KEY_LABELS["accentColor"]}
          keyPath="accentColor"
          recent={recent}
        >
          {accent ? (
            <span className="inline-flex items-center gap-2">
              <span
                className="h-4 w-4 rounded-sm border border-outline/40"
                style={{ background: accent }}
              />
              <code className="font-mono text-xs text-on-surface">
                {accent}
              </code>
            </span>
          ) : (
            <Empty />
          )}
        </Row>
      </Section>

      <Section title="정체성">
        <Row
          label={KEY_LABELS["persona.pronouns"]}
          keyPath="persona.pronouns"
          recent={recent}
        >
          <TextValue value={p.pronouns} />
        </Row>
        <Row
          label={KEY_LABELS["persona.ageText"]}
          keyPath="persona.ageText"
          recent={recent}
        >
          <TextValue value={p.ageText} />
        </Row>
        <Row
          label={KEY_LABELS["persona.gender"]}
          keyPath="persona.gender"
          recent={recent}
        >
          <TextValue value={p.gender} />
        </Row>
        <Row
          label={KEY_LABELS["persona.species"]}
          keyPath="persona.species"
          recent={recent}
        >
          <TextValue value={p.species} />
        </Row>
        <Row
          label={KEY_LABELS["persona.role"]}
          keyPath="persona.role"
          recent={recent}
        >
          <TextValue value={p.role} />
        </Row>
      </Section>

      <Section title="배경">
        <Row
          label={KEY_LABELS["persona.backstorySummary"]}
          keyPath="persona.backstorySummary"
          recent={recent}
          block
        >
          <Paragraph value={p.backstorySummary} />
        </Row>
        <Row
          label={KEY_LABELS["persona.worldContext"]}
          keyPath="persona.worldContext"
          recent={recent}
          block
        >
          <Paragraph value={p.worldContext} />
        </Row>
      </Section>

      <Section title="가치관">
        <Row
          label={KEY_LABELS["persona.coreBeliefs"]}
          keyPath="persona.coreBeliefs"
          recent={recent}
        >
          <ChipList items={p.coreBeliefs} />
        </Row>
        <Row
          label={KEY_LABELS["persona.coreMotivations"]}
          keyPath="persona.coreMotivations"
          recent={recent}
        >
          <ChipList items={p.coreMotivations} />
        </Row>
        <Row
          label={KEY_LABELS["persona.fears"]}
          keyPath="persona.fears"
          recent={recent}
        >
          <ChipList items={p.fears} />
        </Row>
        <Row
          label={KEY_LABELS["persona.redLines"]}
          keyPath="persona.redLines"
          recent={recent}
        >
          <ChipList items={p.redLines} tone="error" />
        </Row>
      </Section>

      <Section title="말투">
        <Row
          label={KEY_LABELS["persona.speechRegister"]}
          keyPath="persona.speechRegister"
          recent={recent}
        >
          <TextValue value={p.speechRegister} />
        </Row>
        <Row
          label={KEY_LABELS["persona.speechEndings"]}
          keyPath="persona.speechEndings"
          recent={recent}
        >
          <ChipList items={p.speechEndings} mono />
        </Row>
        <Row
          label={KEY_LABELS["persona.speechRhythm"]}
          keyPath="persona.speechRhythm"
          recent={recent}
        >
          <TextValue value={p.speechRhythm} />
        </Row>
        <Row
          label={KEY_LABELS["persona.speechQuirks"]}
          keyPath="persona.speechQuirks"
          recent={recent}
        >
          <ChipList items={p.speechQuirks} />
        </Row>
        <Row
          label={KEY_LABELS["persona.languageNotes"]}
          keyPath="persona.languageNotes"
          recent={recent}
          block
        >
          <Paragraph value={p.languageNotes} />
        </Row>
      </Section>

      <Section title="외형">
        <Row
          label={KEY_LABELS["persona.appearanceKeys"]}
          keyPath="persona.appearanceKeys"
          recent={recent}
        >
          <ChipList items={p.appearanceKeys} />
        </Row>
      </Section>

      <Section title="인사말">
        <Row label={KEY_LABELS["greeting"]} keyPath="greeting" recent={recent} block>
          <Paragraph value={d.greeting} />
        </Row>
      </Section>
    </div>
  );
}

// ---------- 서브 컴포넌트 ----------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        {title}
      </h4>
      <div className="space-y-2 rounded-md border border-outline/20 bg-surface-container/40 p-3">
        {children}
      </div>
    </section>
  );
}

function Row({
  label,
  keyPath,
  recent,
  children,
  block,
}: {
  label: string;
  keyPath: string;
  recent: Set<string>;
  children: React.ReactNode;
  block?: boolean;
}) {
  const isRecent = recent.has(keyPath);
  return (
    <div
      className={[
        "rounded px-1 py-0.5 transition-colors",
        block
          ? "flex flex-col gap-0.5"
          : "flex items-baseline gap-3",
        isRecent ? "bg-primary-container/40" : "",
      ].join(" ")}
    >
      <span
        className={[
          "shrink-0 text-[11px] font-semibold uppercase tracking-wider",
          block ? "" : "w-24",
          isRecent ? "text-primary" : "text-on-surface-variant",
        ].join(" ")}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm text-on-surface">{children}</div>
    </div>
  );
}

function Empty() {
  return <span className="text-on-surface-variant/40"></span>;
}

function TextValue({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined || value === "") return <Empty />;
  return <span>{value}</span>;
}

function Paragraph({ value }: { value: string | null | undefined }) {
  if (value === null || value === undefined || value === "") return <Empty />;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
  );
}

function ChipList({
  items,
  tone,
  mono,
}: {
  items: string[] | undefined;
  tone?: "error";
  mono?: boolean;
}) {
  if (!items || items.length === 0) return <Empty />;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((x, i) => (
        <span
          key={i}
          className={[
            "inline-flex items-center rounded-sm px-2 py-0.5 text-xs",
            tone === "error"
              ? "bg-error/15 text-error"
              : "bg-surface-container text-on-surface",
            mono ? "font-mono" : "",
          ].join(" ")}
        >
          {x}
        </span>
      ))}
    </div>
  );
}
