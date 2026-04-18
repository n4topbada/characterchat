"use client";

import { useState } from "react";
import { ChevronDown, Activity } from "lucide-react";

type Props = {
  status: unknown;
};

export function StatusPanel({ status }: Props) {
  const [open, setOpen] = useState(true);
  if (!status || typeof status !== "object") return null;
  const entries = Object.entries(status as Record<string, unknown>);
  if (entries.length === 0) return null;

  return (
    <div className="fixed right-3 top-20 z-20 w-48 rounded-md border border-outline/40 bg-surface-container-high/95 backdrop-blur-md shadow-tinted-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">
          <Activity size={11} strokeWidth={2} />
          STATUS
        </span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`text-on-surface-variant transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open && (
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
      )}
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
