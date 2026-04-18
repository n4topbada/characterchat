import { prisma } from "@/lib/db";
import { json } from "@/lib/api-utils";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.character.findMany({
    where: { isPublic: true },
    include: {
      assets: { where: { kind: "portrait" }, orderBy: { order: "asc" }, take: 1 },
    },
    orderBy: { createdAt: "desc" },
  });
  return json(
    rows.map((r) => ({
      slug: r.slug,
      name: r.name,
      tagline: r.tagline,
      accentColor: r.accentColor,
      portraitUrl: r.assets[0]?.blobUrl ?? null,
    }))
  );
}
