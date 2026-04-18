"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

export function StartChatButton({ characterId }: { characterId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleStart() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId }),
      });
      if (!r.ok) {
        alert("세션을 시작할 수 없습니다.");
        setBusy(false);
        return;
      }
      const { id } = (await r.json()) as { id: string };
      router.push(`/chat/${id}`);
    } catch {
      setBusy(false);
      alert("네트워크 오류가 발생했습니다.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleStart}
      disabled={busy}
      className="relative group w-full h-14 flex items-center justify-center overflow-hidden disabled:opacity-60 active:scale-[0.98] transition-transform"
    >
      <div
        className="absolute inset-0 btn-cta-gradient group-hover:brightness-110 transition-all"
        style={{ transform: "skewX(-12deg)" }}
      />
      <div className="relative flex items-center gap-3 text-on-primary font-headline font-bold uppercase tracking-[0.2em] text-xs">
        {busy ? (
          <Loader2 size={16} className="animate-spin" strokeWidth={2.5} />
        ) : (
          <>
            <span>INITIATE DIALOGUE</span>
            <ArrowRight size={16} strokeWidth={2.5} />
          </>
        )}
      </div>
    </button>
  );
}
