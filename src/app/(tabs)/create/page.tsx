import Link from "next/link";
import { auth } from "@/lib/auth";
import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import { Lock, ArrowRight, Fingerprint, Settings2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function CreatePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "admin";

  return (
    <ScrollPage>
      <TopAppBar title="만들기" />
      <main className="pb-6 dot-pattern relative">
        <div className="max-w-3xl mx-auto px-5 relative z-10 pt-4">
          {/* Hero */}
          <section className="mb-8">
            <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-surface leading-tight mb-3">
              새 캐릭터 만들기
            </h2>
            <p className="text-on-surface-variant text-sm leading-relaxed max-w-lg">
              대화형 디자이너 Caster 가 몇 가지 질문을 통해 캐릭터의 페르소나,
              말투, 외형을 함께 설계해 줍니다.
            </p>
          </section>

          {/* Access gate */}
          {isAdmin ? (
            <section className="bg-surface-container-low p-8 relative overflow-hidden rounded-lg">
              <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-container/30 -translate-y-12 translate-x-12 rotate-45" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="p-5 bg-surface-container-lowest relative rounded-md">
                    <div className="absolute -right-2 -top-2 w-8 h-8 bg-primary flex items-center justify-center text-on-primary rounded-sm">
                      <Fingerprint size={14} strokeWidth={2.5} />
                    </div>
                    <h4 className="font-bold text-base mb-1 text-on-surface">
                      Caster 대화
                    </h4>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      자연어 대화로 캐릭터 설정을 모읍니다. 원하는 성격·배경·말투를
                      자유롭게 얘기하세요.
                    </p>
                  </div>
                  <div className="p-5 bg-surface-container-lowest border-l-4 border-surface-container-high hover:border-primary transition-all rounded-md">
                    <div className="flex items-center gap-2 mb-1">
                      <Settings2
                        size={14}
                        strokeWidth={2.5}
                        className="text-primary"
                      />
                      <h4 className="font-bold text-base text-on-surface">
                        커버리지 추적
                      </h4>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      필요한 항목이 모두 채워지면 저장(Commit) 이 활성화됩니다.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col justify-end gap-6">
                  <Link
                    href={{ pathname: "/admin/caster" }}
                    className="w-full btn-cta-gradient text-on-primary p-5 font-headline font-bold tracking-[0.2em] text-sm flex items-center justify-between group rounded-md"
                  >
                    <span>Caster 열기</span>
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
            <section className="bg-surface-container-low p-8 relative overflow-hidden rounded-lg">
              <div className="absolute top-0 right-0 w-24 h-24 bg-outline-variant/10 -translate-y-12 translate-x-12 rotate-45" />
              <div className="flex flex-col items-center text-center py-6">
                <div className="w-14 h-14 bg-surface-container-high flex items-center justify-center mb-5 rounded-md">
                  <Lock
                    size={22}
                    strokeWidth={2}
                    className="text-on-surface-variant"
                  />
                </div>
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-2">
                  관리자 전용
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed max-w-sm">
                  캐릭터 제작은 관리자 계정에서만 가능합니다.
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </ScrollPage>
  );
}
