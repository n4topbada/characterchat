import { prisma } from "@/lib/db";
import { VerticalCarousel } from "@/components/carousel/VerticalCarousel";
import type { CarouselCharacter } from "@/components/carousel/CharacterCard";

export const dynamic = "force-dynamic";

async function loadCharacters(): Promise<CarouselCharacter[]> {
  try {
    const rows = await prisma.character.findMany({
      where: { isPublic: true },
      include: {
        assets: { where: { kind: "portrait" }, orderBy: { order: "asc" }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      accentColor: r.accentColor,
      portraitUrl: r.assets[0]?.animationUrl ?? r.assets[0]?.blobUrl ?? null,
      tags: [],
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
