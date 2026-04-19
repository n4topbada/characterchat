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
import { DeleteSessionButton } from "./DeleteSessionButton";

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
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}시간 전`;
  const day = Math.floor(h / 24);
  if (day < 7) return `${day}일 전`;
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "2-digit",
  });
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
      <TopAppBar title="대화" />
      <main className="pb-6 diagonal-bg relative">
        <div className="absolute inset-0 dot-pattern opacity-40 pointer-events-none" />

        <div className="max-w-2xl mx-auto px-5 relative z-10 pt-4">
          {rows.length === 0 ? (
            <div className="mt-12 px-4 py-12 bg-surface-container-low rounded-lg border-l-4 border-primary flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-tertiary-container flex items-center justify-center mb-4 rounded-md">
                <MessageSquare
                  size={24}
                  strokeWidth={2}
                  className="text-on-tertiary-container"
                />
              </div>
              <p className="font-headline text-xl font-bold text-on-surface mb-2">
                아직 대화가 없어요
              </p>
              <p className="text-on-surface-variant text-sm leading-relaxed">
                <Link
                  href={"/find" as "/find"}
                  className="text-primary font-bold underline decoration-secondary-fixed decoration-2 underline-offset-4"
                >
                  찾기
                </Link>
                {" 탭에서 대화할 상대를 골라보세요."}
              </p>
            </div>
          ) : (
            <div className="grid gap-5">
              {rows.map((s, idx) => {
                const preview = pickLastBotSpeech(s.messages);
                const portraitAsset = s.character.assets[0];
                const portrait =
                  portraitAsset?.animationUrl ?? portraitAsset?.blobUrl ?? null;
                const portraitIsAnimated =
                  !!portrait && /\/portraits\/ani\//.test(portrait);
                const isActive = idx === 0;
                return (
                  <div key={s.id} className="relative">
                    <Link
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
                      <div className="p-5 flex items-start gap-4 pr-14">
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
                                unoptimized={portraitIsAnimated}
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
                              : "아직 대화가 시작되지 않았어요."}
                          </p>
                        </div>
                      </div>
                    </div>
                    </Link>
                    <DeleteSessionButton
                      sessionId={s.id}
                      characterName={s.character.name}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </ScrollPage>
  );
}
