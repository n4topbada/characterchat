import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/gemini/client";

export const dynamic = "force-dynamic";

// slug 은 URL 세그먼트로 바로 쓰이므로 소문자/숫자/하이픈만.
// 이전엔 검증이 없어 "Admin/evil" 같은 값도 통과할 수 있었다.
const PostBody = z
  .object({
    slug: z
      .string()
      .trim()
      .min(2)
      .max(60)
      .regex(/^[a-z0-9][a-z0-9-]*$/, "slug must be lowercase [a-z0-9-]"),
    name: z.string().trim().min(1).max(80),
    tagline: z.string().trim().max(200).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "accentColor must be #RRGGBB")
      .optional(),
  })
  .strict();

export async function GET() {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const rows = await prisma.character.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      assets: {
        where: { kind: "portrait" },
        orderBy: { order: "asc" },
        take: 1,
      },
      personaCore: { select: { id: true } },
    },
  });

  const characters = rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    accentColor: c.accentColor,
    isPublic: c.isPublic,
    portraitUrl: c.assets[0]?.blobUrl ?? null,
    hasCore: Boolean(c.personaCore),
  }));

  return NextResponse.json({ characters });
}

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = PostBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorJson(
      "invalid_body: " + parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  const body = parsed.data;

  const { ulid } = await import("ulid");
  const id = ulid();
  try {
    const character = await prisma.character.create({
      data: {
        id,
        slug: body.slug,
        name: body.name,
        tagline: body.tagline ?? "",
        accentColor: body.accentColor ?? "#64748b",
        isPublic: false,
        config: {
          create: {
            id: ulid(),
            // 채팅 모델은 카탈로그(MODELS.chat) 에서만 가져온다.
            // 카탈로그 전문: src/lib/gemini/models.ts, 정책: docs/07-llm-config.md §0.
            model: MODELS.chat,
            temperature: 0.8,
            maxOutputTokens: 1024,
            greeting: "…",
          },
        },
      },
    });
    return NextResponse.json({ character });
  } catch (e) {
    // slug 은 @unique. findUnique → create 사이 경합 대신 그냥 unique
    // violation 을 잡아서 409 로 되돌린다.
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return errorJson("slug_already_exists", 409);
    }
    throw e;
  }
}
