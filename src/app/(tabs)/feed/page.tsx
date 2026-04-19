import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import { TrendingUp } from "lucide-react";

export default function FeedPage() {
  return (
    <ScrollPage>
      <TopAppBar title="피드" />
      <main className="pb-6 diagonal-bg relative">
        <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-5 relative z-10 pt-4">
          <section className="bg-surface-container-low p-8 relative overflow-hidden border-l-4 border-primary rounded-lg">
            <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-container/30 -translate-y-12 translate-x-12 rotate-45" />
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} strokeWidth={2} className="text-primary" />
              <span className="label-scholastic text-primary/70">
                준비 중
              </span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">
              추천 피드
            </h3>
            <p className="text-on-surface-variant text-sm leading-relaxed max-w-lg">
              추천 캐릭터, 최근 업데이트, 큐레이터 노트가 이 자리에 배치될
              예정입니다. 지금은{" "}
              <span className="font-bold text-primary">찾기</span> 탭에서 전체
              목록을 열람할 수 있습니다.
            </p>
          </section>
        </div>
      </main>
    </ScrollPage>
  );
}
