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
    portraitUrl:
      c.assets.find((a) => a.kind === "portrait")?.blobUrl ?? null,
    heroUrl: c.assets.find((a) => a.kind === "hero")?.blobUrl ?? null,
    greeting: c.config?.greeting ?? null,
  });
}
