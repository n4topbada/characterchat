import { redirect } from "next/navigation";
import Image from "next/image";
import { auth, signOut } from "@/lib/auth";
import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import { LogOut, Shield, Settings, BookOpen } from "lucide-react";

export default async function MePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/auth/signin?callbackUrl=/me");
  }
  const u = session.user;

  return (
    <ScrollPage>
      <TopAppBar title="내 정보" />
      <main className="pb-6 diagonal-bg relative">
        <div className="max-w-3xl mx-auto px-5 relative z-10 pt-4">
          {/* Profile card */}
          <section className="mb-8">
            <div className="bg-surface-container-low rounded-xl p-6 border-l-4 border-primary flex flex-col sm:flex-row items-center sm:items-start gap-5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary-container/10 -mr-32 -mt-32 transform rotate-45 pointer-events-none" />
              <div className="relative shrink-0">
                <div
                  className="w-24 h-24 bg-primary rounded-lg overflow-hidden border-4 border-surface-container-highest shadow-tinted-lg"
                  style={{ transform: "rotate(-3deg)" }}
                >
                  <div
                    style={{ transform: "rotate(3deg)" }}
                    className="w-full h-full"
                  >
                    {u.image ? (
                      <Image
                        src={u.image}
                        alt=""
                        width={96}
                        height={96}
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
              </div>
              <div className="flex-1 text-center sm:text-left z-10 min-w-0">
                <h2 className="font-headline text-2xl font-bold text-on-surface leading-tight mb-1 truncate">
                  {u.name ?? "이름 없음"}
                </h2>
                <p className="text-on-surface-variant text-sm leading-relaxed truncate">
                  {u.email}
                </p>
                {u.role === "admin" && (
                  <span className="inline-block mt-3 px-2 py-0.5 bg-tertiary-container text-on-tertiary-container label-scholastic-xs">
                    관리자
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Actions */}
          <section className="mb-4">
            <div className="flex items-center gap-4 mb-4">
              <h3 className="font-headline text-lg font-bold tracking-tight text-on-surface">
                메뉴
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
                  <h4 className="font-headline font-bold text-on-surface">
                    설정
                  </h4>
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
                    <h4 className="font-headline font-bold text-error">
                      로그아웃
                    </h4>
                  </div>
                </button>
              </form>
            </div>
          </section>
        </div>
      </main>
    </ScrollPage>
  );
}
