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
        portraitUrl: r.assets[0]?.animationUrl ?? r.assets[0]?.blobUrl ?? null,
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

export default async function FindPage() {
  const characters = await loadCharacters();
  return (
    <main className="h-full relative">
      <VerticalCarousel characters={characters} />
    </main>
  );
}
