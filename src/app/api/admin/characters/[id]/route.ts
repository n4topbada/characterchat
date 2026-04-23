import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";

export const dynamic = "force-dynamic";

// PATCH body 검증. name 은 UI 카드/헤더에서 잘리지 않게 80 자, tagline 은
// 줄바꿈 없는 한 줄 카피라 200 자 상한. accentColor 는 Tailwind/인라인 style
// 로 직접 주입되므로 반드시 `#RRGGBB` 로 고정한다.
const PatchBody = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    tagline: z.string().trim().max(200).optional(),
    accentColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "accentColor must be #RRGGBB")
      .optional(),
    isPublic: z.boolean().optional(),
    nsfwEnabled: z.boolean().optional(),
  })
  .strict();

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      config: true,
      personaCore: true,
      assets: { orderBy: { order: "asc" } },
    },
  });
  if (!character) return errorJson("not found", 404);
  return NextResponse.json({ character });
}

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorJson(
      "invalid_body: " + parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }
  const body = parsed.data;

  // Prisma 는 빈 data 객체를 받으면 그냥 find + 반환만 수행. 하지만 여기선
  // "아무 필드도 안 왔다" 면 요청 자체가 의미 없으므로 400 으로 막는다.
  if (Object.keys(body).length === 0) return errorJson("empty_patch", 400);

  const character = await prisma.character.update({
    where: { id },
    data: body,
  });
  return NextResponse.json({ character });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;
  await prisma.character.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
