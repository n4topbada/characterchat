import { prisma } from "@/lib/db";
import { VerticalCarousel } from "@/components/carousel/VerticalCarousel";
import type { CarouselCharacter } from "@/components/carousel/CharacterCard";

export const dynamic = "force-dynamic";

/**
 * appearanceKeys 에서 태그용 키워드 뽑기.
 * - "ref image: https://…" 같은 URL 앵커 토큰은 제외
 * - 너무 긴 항목(> 24자) 은 축약
 * - 최대 4개
 */
function extractTags(appearanceKeys: string[] | null | undefined): string[] {
  if (!appearanceKeys?.length) return [];
  return appearanceKeys
    .filter((k) => !/^ref\s+image\s*:/i.test(k))
    .map((k) => (k.length > 24 ? k.slice(0, 22) + "…" : k))
    .slice(0, 4);
}

async function loadCharacters(): Promise<CarouselCharacter[]> {
  try {
    const rows = await prisma.character.findMany({
      where: { isPublic: true },
      include: {
        assets: { where: { kind: "portrait" }, orderBy: { order: "asc" }, take: 1 },
        personaCore: {
          select: {
            role: true,
            ageText: true,
            species: true,
            worldContext: true,
            backstorySummary: true,
            appearanceKeys: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      accentColor: r.accentColor,
      portraitUrl: r.assets[0]?.animationUrl ?? r.assets[0]?.blobUrl ?? null,
      role: r.personaCore?.role ?? null,
      ageText: r.personaCore?.ageText ?? null,
      species: r.personaCore?.species ?? null,
      worldContext: r.personaCore?.worldContext ?? null,
      backstorySummary: r.personaCore?.backstorySummary ?? null,
      tags: extractTags(r.personaCore?.appearanceKeys),
    }));
  } catch {
    // DB 연결 실패(로컬 .env 미설정 등) — 빈 배열로 우아하게 종료
    return [];
  }
}

export default async function FindPage() {
  const characters = await loadCharacters();
  return (
    <main className="h-full relative">
      <VerticalCarousel characters={characters} />
    </main>
  );
}
