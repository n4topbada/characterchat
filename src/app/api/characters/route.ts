import { prisma } from "@/lib/db";
import { json } from "@/lib/api-utils";

export const runtime = "nodejs";

function extractTags(appearanceKeys: string[] | null | undefined): string[] {
  if (!appearanceKeys?.length) return [];
  return appearanceKeys
    .filter((k) => !/^ref\s+image\s*:/i.test(k))
    .map((k) => (k.length > 24 ? k.slice(0, 22) + "…" : k))
    .slice(0, 4);
}

export async function GET() {
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
  return json(
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      accentColor: r.accentColor,
      // /find SSR 과 동일 정책 — ani 가 있으면 ani 우선.
      portraitUrl:
        r.assets[0]?.animationUrl ?? r.assets[0]?.blobUrl ?? null,
      role: r.personaCore?.role ?? null,
      ageText: r.personaCore?.ageText ?? null,
      species: r.personaCore?.species ?? null,
      worldContext: r.personaCore?.worldContext ?? null,
      backstorySummary: r.personaCore?.backstorySummary ?? null,
      tags: extractTags(r.personaCore?.appearanceKeys),
    })),
  );
}
