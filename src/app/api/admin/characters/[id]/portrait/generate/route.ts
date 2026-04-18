import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import {
  buildPortraitPrompt,
  generatePortraitBytes,
  savePortraitForCharacter,
} from "@/lib/portraits";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: { personaCore: true },
  });
  if (!character) return errorJson("character not found", 404);

  const body = (await req.json().catch(() => ({}))) as { prompt?: string };
  const prompt =
    body.prompt?.trim() ||
    buildPortraitPrompt(character, character.personaCore);

  let data: Buffer;
  let mimeType = "image/png";
  try {
    const res = await generatePortraitBytes(prompt);
    data = res.data;
    mimeType = res.mimeType;
  } catch (e) {
    console.error("[portrait/generate] gemini failure", e);
    return errorJson("generation failed", 502);
  }

  const saved = await savePortraitForCharacter({
    characterId: character.id,
    slug: character.slug,
    png: data,
    mimeType,
  });

  return NextResponse.json({ ...saved, prompt });
}
