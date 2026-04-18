import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, signOut } from "@/lib/auth";
import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import {
  LogOut,
  Shield,
  Settings,
  MapPin,
  Verified,
  BookOpen,
  Sparkles,
} from "lucide-react";

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/me");
  }
  const u = session.user;
  const userCode =
    (u.id ?? "UNKNOWN").slice(0, 4).toUpperCase() +
    "-" +
    (u.id ?? "0000").slice(-4).toUpperCase();

  return (
    <ScrollPage>
      <TopAppBar title="PROTOCOL" subtitle="OPERATOR_PROFILE" />
      <main className="pb-6 diagonal-bg relative">
        <div className="max-w-3xl mx-auto px-5 relative z-10">
          {/* Hero profile */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-10">
            <div className="md:col-span-8 relative">
              <div className="bg-surface-container-low rounded-xl p-6 border-l-4 border-primary flex flex-col md:flex-row items-center md:items-start gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary-container/10 -mr-32 -mt-32 transform rotate-45 pointer-events-none" />
                <div className="relative shrink-0">
                  <div
                    className="w-28 h-28 bg-primary rounded-lg overflow-hidden border-4 border-surface-container-highest shadow-tinted-lg"
                    style={{ transform: "rotate(-3deg)" }}
                  >
                    <div style={{ transform: "rotate(3deg)" }} className="w-full h-full">
                      {u.image ? (
                        <Image
                          src={u.image}
                          alt=""
                          width={112}
                          height={112}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-full h-full"
                          style={{
                            backgroundImage:
                              "linear-gradient(135deg, #3a5f94, #cee9d9)",
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <div
                    className="absolute -bottom-2 -right-2 bg-tertiary-container text-on-tertiary-container px-3 py-1 label-scholastic-xs"
                    style={{ transform: "skewX(-12deg)" }}
                  >
                    <span style={{ transform: "skewX(12deg)", display: "inline-block" }}>
                      {u.role === "admin" ? "SENIOR_ARCHIVIST" : "OPERATOR"}
                    </span>
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left z-10 min-w-0">
                  <div className="inline-block px-2 py-0.5 bg-secondary-container text-on-secondary-container label-scholastic-xs mb-2">
                    ID:{userCode}
                  </div>
                  <h2 className="font-headline text-3xl font-bold text-on-surface leading-tight mb-1 truncate">
                    {u.name ?? "UNNAMED"}
                  </h2>
                  <p className="text-on-surface-variant text-sm leading-relaxed mb-4 truncate">
                    {u.email}
                  </p>
                  <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-highest rounded-md">
                      <MapPin
                        size={14}
                        className="text-primary"
                        strokeWidth={2}
                      />
                      <span className="label-scholastic-xs text-on-surface-variant">
                        OXFORD_HUB_01
                      </span>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface-container-highest rounded-md">
                      <Verified
                        size={14}
                        className="text-primary"
                        strokeWidth={2}
                      />
                      <span className="label-scholastic-xs text-on-surface-variant">
                        {u.role === "admin" ? "L7_CLEAR" : "L2_CLEAR"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Archive sync tile */}
            <div className="md:col-span-4 flex flex-col gap-5">
              <div className="bg-surface-container-highest rounded-xl p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-6">
                  <span className="font-headline font-bold text-[11px] tracking-widest uppercase opacity-60">
                    Archive Sync
                  </span>
                  <span className="flex h-2 w-2 rounded-full bg-secondary animate-pulse-dot" />
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-4xl font-headline font-bold text-primary">
                    94<span className="text-base opacity-40">%</span>
                  </div>
                  <div className="w-1/2 h-1 bg-surface-container-low relative overflow-hidden mb-2">
                    <div className="absolute top-0 left-0 h-full w-[94%] bg-primary" />
                  </div>
                </div>
                <p className="label-scholastic-xs text-on-surface-variant mt-3">
                  PROTOCOL_STABLE
                </p>
              </div>
            </div>
          </section>

          {/* Actions */}
          <section className="mb-4">
            <div className="flex items-center gap-4 mb-4">
              <h3 className="font-headline text-xl font-bold tracking-tight text-on-surface">
                Operator Actions
              </h3>
              <div className="h-px flex-1 bg-outline-variant/30" />
            </div>
            <div className="space-y-3">
              {u.role === "admin" && (
                <a
                  href="/admin"
                  className="group flex items-center gap-4 bg-surface-container-low p-4 rounded-lg hover:bg-surface-container-high transition-all border-l-2 border-tertiary"
                >
                  <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center text-primary group-hover:scale-110 transition-transform rounded-md">
                    <Shield size={18} strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="label-scholastic-xs py-0.5 px-2 bg-tertiary-container text-on-tertiary-container">
                        ADMIN_CONSOLE
                      </span>
                    </div>
                    <h4 className="font-headline font-bold text-on-surface">
                      관리자 콘솔
                    </h4>
                  </div>
                </a>
              )}

              <a
                href="/history"
                className="group flex items-center gap-4 bg-surface-container-low p-4 rounded-lg hover:bg-surface-container-high transition-all"
              >
                <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center text-primary group-hover:scale-110 transition-transform rounded-md">
                  <BookOpen size={18} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <div className="label-scholastic-xs py-0.5 px-2 bg-surface-container-high text-on-surface-variant w-fit mb-1">
                    DIALOGUE_LOG
                  </div>
                  <h4 className="font-headline font-bold text-on-surface">
                    대화 기록
                  </h4>
                </div>
              </a>

              <button
                type="button"
                className="w-full group flex items-center gap-4 bg-surface-container-low p-4 rounded-lg hover:bg-surface-container-high transition-all text-left"
              >
                <div className="w-12 h-12 bg-surface-container-highest flex items-center justify-center text-primary group-hover:scale-110 transition-transform rounded-md">
                  <Settings size={18} strokeWidth={2} />
                </div>
                <div className="flex-1">
                  <div className="label-scholastic-xs py-0.5 px-2 bg-surface-container-high text-on-surface-variant w-fit mb-1">
                    CONFIG
                  </div>
                  <h4 className="font-headline font-bold text-on-surface">설정</h4>
                </div>
              </button>

              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/auth/signin" });
                }}
              >
                <button
                  type="submit"
                  className="w-full group flex items-center gap-4 bg-surface-container-low p-4 rounded-lg hover:bg-error-container/40 transition-all text-left"
                >
                  <div className="w-12 h-12 bg-error-container/40 flex items-center justify-center text-error group-hover:scale-110 transition-transform rounded-md">
                    <LogOut size={18} strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <div className="label-scholastic-xs py-0.5 px-2 bg-error-container text-on-error-container w-fit mb-1">
                      TERMINATE
                    </div>
                    <h4 className="font-headline font-bold text-error">
                      로그아웃
                    </h4>
                  </div>
                  <Sparkles
                    size={18}
                    strokeWidth={2}
                    className="text-error/40 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </ScrollPage>
  );
}
