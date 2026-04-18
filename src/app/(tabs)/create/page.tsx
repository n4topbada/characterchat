import Link from "next/link";
import { auth } from "@/lib/auth";
import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import {
  Lock,
  Terminal,
  ArrowRight,
  Fingerprint,
  Settings2,
  Sparkles,
} from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <ScrollPage>
      <TopAppBar title="INITIATE" subtitle="UNIT_INITIALIZATION" />
      <main className="pb-6 dot-pattern relative">
        <div className="max-w-3xl mx-auto px-5 relative z-10">
          {/* Hero */}
          <section className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-10">
            <div className="md:col-span-8 flex flex-col justify-center">
              <div className="inline-block px-3 py-1 bg-tertiary-container text-on-tertiary-container label-scholastic-xs mb-4 w-fit">
                SYSTEM_PROTOCOL:0x82A
              </div>
              <h2 className="font-headline text-4xl md:text-5xl font-bold text-on-surface-variant leading-none tracking-tighter mb-4">
                UNIT <span className="text-primary">INITIALIZATION</span>
              </h2>
              <p className="font-mono text-xs text-on-surface-variant/80 leading-relaxed">
                &gt; Preparing neural architecture for scholastic engagement.
                <br />&gt; Defining cognitive constraints and personality matrices.
                <br />&gt; Ready for sequence deployment.
              </p>
            </div>
            <div className="md:col-span-4">
              <div className="aspect-square bg-surface-container-high p-3 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 pointer-events-none">
                  <div className="absolute top-0 right-0 w-20 h-20 border-t-[6px] border-r-[6px] border-primary" />
                  <div className="absolute bottom-0 left-0 w-20 h-20 border-b-[6px] border-l-[6px] border-tertiary" />
                </div>
                <div
                  className="w-full h-full bg-surface-container-highest flex items-center justify-center relative overflow-hidden"
                  style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 0 100%)" }}
                >
                  <Sparkles
                    size={48}
                    strokeWidth={1}
                    className="text-primary/40"
                  />
                  <div className="absolute bottom-3 left-3 right-3 glass-white p-3 border-l-4 border-primary-container">
                    <div className="label-mono text-primary mb-1 text-[10px]">
                      STATUS:{isAdmin ? "READY" : "LOCKED"}
                    </div>
                    <div className="h-1 w-full bg-surface-container overflow-hidden">
                      <div
                        className={[
                          "h-full",
                          isAdmin ? "bg-primary w-2/3" : "bg-outline-variant w-1/6",
                        ].join(" ")}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Access gate */}
          {isAdmin ? (
            <section className="bg-surface-container-low p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-container/30 -translate-y-12 translate-x-12 rotate-45" />
              <div className="flex items-center gap-2 mb-6">
                <Terminal size={18} strokeWidth={2} className="text-primary" />
                <h3 className="font-headline font-bold uppercase tracking-widest text-sm text-on-surface-variant">
                  Logic Protocols
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-5 bg-surface-container-lowest relative">
                    <div className="absolute -right-2 -top-2 w-8 h-8 bg-primary flex items-center justify-center text-on-primary">
                      <Fingerprint size={14} strokeWidth={2.5} />
                    </div>
                    <h4 className="font-bold text-base mb-1 text-on-surface">
                      Caster Protocol
                    </h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      디자이너 에이전트가 자연어 대화로 캐릭터 구조체를
                      수집합니다.
                    </p>
                  </div>
                  <div className="p-5 bg-surface-container-lowest border-l-4 border-surface-container-high hover:border-primary transition-all">
                    <div className="flex items-center gap-2 mb-1">
                      <Settings2 size={14} strokeWidth={2.5} className="text-primary" />
                      <h4 className="font-bold text-base text-on-surface">
                        Coverage Tracking
                      </h4>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      숨겨진 100% 게이지가 도달하면 자동으로 Commit 프로세스가
                      가능해집니다.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col justify-end gap-6">
                  <div
                    className="bg-surface-container-highest p-5"
                    style={{ clipPath: "polygon(0 0, 100% 0, 100% 85%, 0 100%)" }}
                  >
                    <p className="font-mono text-xs text-on-surface-variant/70 italic leading-relaxed">
                      &quot;Knowledge is not merely a collection of data, but the
                      architectural synthesis of information and intent.&quot;
                    </p>
                  </div>
                  <Link
                    href={{ pathname: "/admin/caster" }}
                    className="w-full btn-cta-gradient text-on-primary p-5 font-headline font-bold uppercase tracking-[0.3em] text-sm flex items-center justify-between group"
                  >
                    <span>Initialize Unit</span>
                    <ArrowRight
                      size={16}
                      strokeWidth={2.5}
                      className="transform group-hover:translate-x-1 transition-transform"
                    />
                  </Link>
                </div>
              </div>
            </section>
          ) : (
            <section className="bg-surface-container-low p-8 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-outline-variant/10 -translate-y-12 translate-x-12 rotate-45" />
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 bg-surface-container-high flex items-center justify-center mb-5 rounded-md">
                  <Lock
                    size={22}
                    strokeWidth={2}
                    className="text-on-surface-variant"
                  />
                </div>
                <div className="inline-block px-3 py-1 bg-error-container text-on-error-container label-scholastic-xs mb-3">
                  ACCESS_DENIED: L7_CLEARANCE
                </div>
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">
                  RESTRICTED PROTOCOL
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed max-w-sm">
                  UNIT_INITIALIZATION 프로토콜은 SENIOR_ARCHIVIST 권한이 있는
                  운영자만 개시할 수 있습니다.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </ScrollPage>
  );
}
