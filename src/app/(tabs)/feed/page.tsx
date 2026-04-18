import { TopAppBar } from "@/components/nav/TopAppBar";
import { ScrollPage } from "@/components/layout/ScrollPage";
import { LayoutGrid, BookOpen, Database, TrendingUp } from "lucide-react";

export default function FeedPage() {
  return (
    <ScrollPage>
      <TopAppBar title="COLLECTION" subtitle="CURATED_INDEX" />
      <main className="pb-6 diagonal-bg relative">
        <div className="absolute inset-0 dot-pattern opacity-30 pointer-events-none" />

        <div className="max-w-3xl mx-auto px-5 relative z-10">
          {/* Section header */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <span className="label-scholastic text-primary/60">Catalog</span>
              <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface">
                Featured Collection
              </h2>
            </div>
            <span
              className="px-3 py-1 bg-surface-container-high text-on-surface-variant label-scholastic-xs"
              style={{ transform: "skewX(-12deg)" }}
            >
              <span style={{ transform: "skewX(12deg)", display: "inline-block" }}>
                STAGING
              </span>
            </span>
          </div>

          {/* Bento grid — empty-state preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
            <div className="bg-surface-container-low rounded-xl p-6 border-b-2 border-primary-container flex flex-col justify-between min-h-[180px]">
              <LayoutGrid size={20} className="text-primary mb-4" strokeWidth={2} />
              <div>
                <h3 className="font-headline text-2xl font-bold mb-1 text-on-surface">
                  —
                </h3>
                <p className="label-scholastic-xs text-on-surface-variant">
                  VOLUMES_CATALOGED
                </p>
              </div>
            </div>
            <div className="bg-surface-container-low rounded-xl p-6 border-b-2 border-secondary-container flex flex-col justify-between min-h-[180px]">
              <BookOpen size={20} className="text-secondary mb-4" strokeWidth={2} />
              <div>
                <h3 className="font-headline text-2xl font-bold mb-1 text-on-surface">
                  —
                </h3>
                <p className="label-scholastic-xs text-on-surface-variant">
                  DIALOGUE_HOURS
                </p>
              </div>
            </div>
            <div className="bg-surface-container-low rounded-xl p-6 border-b-2 border-tertiary-container flex flex-col justify-between min-h-[180px]">
              <Database size={20} className="text-tertiary mb-4" strokeWidth={2} />
              <div>
                <h3 className="font-headline text-2xl font-bold mb-1 text-on-surface">
                  —
                </h3>
                <p className="label-scholastic-xs text-on-surface-variant">
                  KNOWLEDGE_NODES
                </p>
              </div>
            </div>
          </div>

          <section className="bg-surface-container-low p-8 relative overflow-hidden border-l-4 border-primary">
            <div className="absolute top-0 right-0 w-24 h-24 bg-tertiary-container/30 -translate-y-12 translate-x-12 rotate-45" />
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={18} strokeWidth={2} className="text-primary" />
              <span className="label-scholastic text-primary/70">COMING_SOON</span>
            </div>
            <h3 className="font-headline text-2xl font-bold text-on-surface mb-2">
              CURATED COLLECTION
            </h3>
            <p className="text-on-surface-variant text-sm leading-relaxed max-w-lg">
              추천 SCHOLAR, 최근 업데이트된 프로토콜, 큐레이터 노트가 이 자리에
              배치될 예정입니다. 지금은 <span className="font-bold text-primary">INDEX</span>{" "}
              탭에서 전체 아카이브를 열람할 수 있습니다.
            </p>
          </section>
        </div>
      </main>
    </ScrollPage>
  );
}
