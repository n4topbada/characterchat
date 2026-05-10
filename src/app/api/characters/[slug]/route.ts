import { prisma } from "@/lib/db";
import { json, errorJson } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const c = await prisma.character.findUnique({
    where: { slug },
    include: {
      assets: { orderBy: { order: "asc" } },
      config: { select: { greeting: true } },
    },
  });
  if (!c || !c.isPublic) return errorJson("not_found", 404);

  return json({
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    accentColor: c.accentColor,
    portraitUrl: (() => {
      const p = c.assets.find((a) => a.kind === "portrait");
      // ani 가 등록돼 있으면 ani 우선 — 카드/헤더 일관성.
      return p?.animationUrl ?? p?.blobUrl ?? null;
    })(),
    heroUrl: c.assets.find((a) => a.kind === "hero")?.blobUrl ?? null,
    greeting: c.config?.greeting ?? null,
  });
}
