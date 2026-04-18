"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";

export function NewRunButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/caster/runs", { method: "POST" });
      if (!r.ok) return;
      const j = (await r.json()) as { run: { id: string } };
      router.push(`/admin/caster/${j.run.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={busy}
      className="flex items-center gap-1 text-primary font-bold text-sm disabled:opacity-50"
    >
      <Plus size={16} strokeWidth={2.5} />
      새 세션
    </button>
  );
}
