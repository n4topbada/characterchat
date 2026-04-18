import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import {
  extractStatus,
  splitDialogueBlocks,
  splitNarration,
} from "@/lib/narration";
import { MessageSquare, Network } from "lucide-react";

export const dynamic = "force-dynamic";

// 봇의 최근 '대사'만 뽑는다. 나레이션(*...*) 과 <status> 블록은 제외.
// 대화기록 미리보기는 오로지 챗봇의 발화 문장만 보여준다.
function pickLastBotSpeech(
  messages: { role: string; content: string }[],
): string | null {
  for (const m of messages) {
    if (m.role !== "model") continue;
    const { body } = extractStatus(m.content);
    const blocks = splitDialogueBlocks(body);
    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      if (b.kind !== "dialogue") continue;
      const speech = splitNarration(b.value)
        .filter((s) => s.kind === "text")
        .map((s) => s.value)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (speech.length > 0) return speech;
    }
  }
  return null;
}

function formatTimestamp(d: Date): string {
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "NOW";
  if (min < 60) return `${min}M_AGO`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}H_AGO`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}D_AGO`;
  return d
    .toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    .toUpperCase();
}

export default async function HistoryPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/history");
  }

  const rows = await prisma.session.findMany({
    where: { userId: session.user.id },
    orderBy: { lastMessageAt: "desc" },
    include: {
      character: {
        include: {
          assets: {
            where: { kind: "portrait" },
            orderBy: { order: "asc" },
            take: 1,
          },
        },
      },
      messages: {
        where: { role: "model" },
        orderBy: { createdAt: "desc" },
        take: 8,
      },
    },
  });

  return (
    <ScrollPage>
      <TopAppBar title="DIALOGUE" subtitle="ARCHIVAL_SESSIONS" />
      <main className="pb-6 diagonal-bg relative">
        <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

        <div className="max-w-2xl mx-auto px-5 relative z-10">
          {/* Section header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="label-scholastic text-primary/60">Directory</span>
              <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
                Archival Sessions
              </h2>
            </div>
            <div className="hidden sm:flex gap-2">
              <span
                className="px-3 py-1 bg-secondary-container text-on-secondary-fixed label-scholastic-xs"
                style={{ transform: "skewX(-12deg)" }}
              >
                <span style={{ transform: "skewX(12deg)", display: "inline-block" }}>
                  LIVE_FEED
                </span>
              </span>
              <span
                className="px-3 py-1 bg-surface-container-high text-on-surface-variant label-scholastic-xs"
                style={{ transform: "skewX(-12deg)" }}
              >
                <span style={{ transform: "skewX(12deg)", display: "inline-block" }}>
                  V_SEQ.{String(rows.length).padStart(2, "0")}
                </span>
              </span>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="mt-12 px-4 py-12 bg-surface-container-low rounded-lg border-l-4 border-primary flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-tertiary-container flex items-center justify-center mb-4 rounded-md">
                <MessageSquare
                  size={24}
                  strokeWidth={2}
                  className="text-on-tertiary-container"
                />
              </div>
              <span className="label-scholastic-xs text-primary/70 mb-2">
                NULL_SET
              </span>
              <p className="font-headline text-xl font-bold text-on-surface mb-2">
                NO ACTIVE SESSIONS
              </p>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                <Link
                  href={"/find" as "/find"}
                  className="text-primary font-bold underline decoration-secondary-fixed decoration-2 underline-offset-4"
                >
                  INDEX
                </Link>
                {" 탭에서 SCHOLAR를 선택해 대화를 개시하세요."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {rows.map((s, idx) => {
                const preview = pickLastBotSpeech(s.messages);
                const portrait = s.character.assets[0]?.blobUrl ?? null;
                const isActive = idx === 0;
                return (
                  <Link
                    key={s.id}
                    href={`/chat/${s.id}`}
                    className={[
                      "group relative block transition-all duration-300 active:scale-[0.99]",
                      isActive
                        ? "bg-surface-container-low hover:bg-surface-container-highest"
                        : "bg-surface-container-lowest hover:bg-surface-container-low",
                    ].join(" ")}
                  >
                    {isActive && (
                      <div className="absolute -left-1 top-0 bottom-0 w-1 bg-primary" />
                    )}
                    <div className="p-5 flex items-start gap-4">
                      <div className="relative shrink-0">
                        <div
                          className="w-14 h-14 bg-tertiary-container flex items-center justify-center border border-tertiary-fixed-dim overflow-hidden"
                          style={{ transform: "skewX(-6deg)" }}
                        >
                          <div style={{ transform: "skewX(6deg)" }} className="w-full h-full">
                            {portrait ? (
                              <Image
                                src={portrait}
                                alt=""
                                width={56}
                                height={56}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <Network
                                size={24}
                                strokeWidth={2}
                                className="text-on-tertiary-container m-auto"
                              />
                            )}
                          </div>
                        </div>
                        {isActive && (
                          <div className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-secondary border-2 border-surface rotate-45" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="font-headline font-bold text-base text-primary tracking-tight truncate">
                            {s.character.name}
                          </h3>
                          <span className="label-mono text-primary/50 text-[10px] shrink-0 ml-3">
                            {formatTimestamp(s.lastMessageAt)}
                          </span>
                        </div>
                        <div
                          className="bg-surface p-2.5 border-l-2 border-tertiary-container shadow-tinted-sm min-w-0"
                          style={{ borderRadius: "0.125rem 0.5rem 0.5rem 0.5rem" }}
                        >
                          <p
                            className="text-on-surface-variant text-sm leading-relaxed break-words overflow-hidden"
                            style={{
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                            }}
                          >
                            {preview
                              ? preview.slice(0, 180)
                              : "아직 대사가 없습니다."}
                          </p>
                        </div>
                        {isActive && (
                          <div className="mt-2 flex gap-2">
                            <span className="px-2 py-0.5 bg-tertiary-container text-on-tertiary-container label-scholastic-xs">
                              ACTIVE_STREAM
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </ScrollPage>
  );
}
