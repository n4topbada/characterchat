"use client";

import { useState } from "react";
import { Activity, X } from "lucide-react";

type Props = {
  status: unknown;
};

export function StatusPanel({ status }: Props) {
  const [open, setOpen] = useState(false);
  if (!status || typeof status !== "object") return null;
  const entries = Object.entries(status as Record<string, unknown>);
  if (entries.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="상태 열기"
        className="absolute right-3 top-16 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-outline/40 bg-surface-container-high/95 backdrop-blur-md shadow-tinted-sm text-on-surface-variant transition-colors hover:bg-surface-container-high"
      >
        <Activity size={14} strokeWidth={2} />
      </button>
    );
  }

  return (
    <div className="absolute right-3 top-16 z-20 w-48 rounded-md border border-outline/40 bg-surface-container-high/95 backdrop-blur-md shadow-tinted-sm">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          <Activity size={11} strokeWidth={2} />
          STATUS
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="상태 닫기"
          className="flex h-5 w-5 items-center justify-center text-on-surface-variant hover:text-on-surface"
        >
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      <dl className="border-t border-outline/30 px-3 py-2 space-y-1.5">
        {entries.map(([k, v]) => (
          <div key={k} className="flex items-start justify-between gap-2">
            <dt className="label-mono text-[10px] uppercase text-on-surface-variant/70">
              {k}
            </dt>
            <dd className="text-right text-[11px] font-medium text-on-surface">
              {renderValue(v)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number") return v.toString();
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return v.map(renderValue).join(", ");
  return JSON.stringify(v);
}
