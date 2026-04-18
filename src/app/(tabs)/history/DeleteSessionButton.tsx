"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

export function DeleteSessionButton({
  sessionId,
  characterName,
}: {
  sessionId: string;
  characterName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const ok = window.confirm(
      `${characterName} 와의 대화를 전부 삭제할까요? 이 작업은 되돌릴 수 없습니다.`,
    );
    if (!ok) return;
    startTransition(async () => {
      setErr(null);
      const r = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!r.ok) {
        setErr("삭제 실패");
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-label="대화 삭제"
      title={err ?? "대화 삭제"}
      className="absolute top-3 right-3 z-20 w-9 h-9 flex items-center justify-center rounded-md text-on-surface-variant hover:bg-error-container hover:text-on-error-container active:scale-95 transition-colors disabled:opacity-50"
    >
      <Trash2 size={16} strokeWidth={2} />
    </button>
  );
}
