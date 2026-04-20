import { prisma } from "@/lib/db";
import { VerticalCarousel } from "@/components/carousel/VerticalCarousel";
import type { CarouselCharacter } from "@/components/carousel/CharacterCard";
import { deriveShortTags } from "@/lib/character-display";

export const dynamic = "force-dynamic";

async function loadCharacters(): Promise<CarouselCharacter[]> {
  try {
    const rows = await prisma.character.findMany({
      where: { isPublic: true },
      include: {
        assets: { where: { kind: "portrait" }, orderBy: { order: "asc" }, take: 1 },
        personaCore: {
          select: {
            backstorySummary: true,
            shortTags: true,
            role: true,
            species: true,
            ageText: true,
            heightCm: true,
            weightKg: true,
            threeSize: true,
            mbti: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => {
      const core = r.personaCore;
      const asset = r.assets[0];
      const tags =
        core?.shortTags && core.shortTags.length > 0
          ? core.shortTags
          : deriveShortTags({
              role: core?.role,
              species: core?.species,
              mbti: core?.mbti,
            });
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        tagline: r.tagline,
        accentColor: r.accentColor,
        // 표시용 URL — 애니메이션이 있으면 그걸 우선, 없으면 스틸컷, 둘 다 없으면 null.
        portraitUrl: asset?.animationUrl ?? asset?.blobUrl ?? null,
        // SSE 재개 판정용 메타. 카드에서 "어떤 단계부터 돌릴지" 결정한다.
        portraitAssetId: asset?.id ?? null,
        hasAnimation: !!asset?.animationUrl,
        backstorySummary: core?.backstorySummary ?? null,
        tags,
        ageText: core?.ageText ?? null,
        heightCm: core?.heightCm ?? null,
        weightKg: core?.weightKg ?? null,
        threeSize: core?.threeSize ?? null,
        mbti: core?.mbti ?? null,
      };
    });
  } catch {
    // DB 연결 실패(로컬 .env 미설정 등) — 빈 배열로 우아하게 종료
    return [];
  }
}

/**
 * Find 페이지 — 세로 캐러셀로 공개된 캐릭터를 보여준다.
 *
 * 쿼리 파라미터:
 *   - focus=<slug> : 이 슬러그의 카드를 초기 포커스 (스크롤 & auto-generate 대상 지정)
 *   - gen=1        : focus 와 함께 오면, 해당 카드가 portrait/animation SSE 를
 *                    마운트 시점에 자동으로 호출한다. Caster 의 confirm-autocommit
 *                    직후 navigate 되어 들어오는 경로용. 이미 모든 에셋이 준비돼
 *                    있으면 카드가 조용히 no-op.
 */
export default async function FindPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; gen?: string }>;
}) {
  const sp = await searchParams;
  const focusSlug = typeof sp.focus === "string" ? sp.focus : null;
  const autoGenerate = sp.gen === "1";
  const characters = await loadCharacters();
  return (
    <main className="h-full relative">
      <VerticalCarousel
        characters={characters}
        focusSlug={focusSlug}
        autoGenerate={autoGenerate}
      />
    </main>
  );
}
