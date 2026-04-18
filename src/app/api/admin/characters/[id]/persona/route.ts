// PersonaCore 조회 / 갱신.
// GET  : 전체 필드 반환 (편집 UI 용)
// PATCH: 편집 가능한 필드만 부분 업데이트

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { newId } from "@/lib/ids";

const StringArray = z.array(z.string().trim().min(1)).max(32);

const PatchBody = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  aliases: StringArray.optional(),
  pronouns: z.string().trim().max(40).nullable().optional(),
  ageText: z.string().trim().max(40).nullable().optional(),
  gender: z.string().trim().max(40).nullable().optional(),
  species: z.string().trim().max(40).nullable().optional(),
  role: z.string().trim().max(80).nullable().optional(),
  backstorySummary: z.string().trim().max(4000).optional(),
  worldContext: z.string().trim().max(4000).nullable().optional(),
  coreBeliefs: StringArray.optional(),
  coreMotivations: StringArray.optional(),
  fears: StringArray.optional(),
  redLines: StringArray.optional(),
  speechRegister: z.string().trim().max(120).nullable().optional(),
  speechEndings: StringArray.optional(),
  speechRhythm: z.string().trim().max(120).nullable().optional(),
  speechQuirks: StringArray.optional(),
  languageNotes: z.string().trim().max(1000).nullable().optional(),
  appearanceKeys: StringArray.optional(),
  defaultAffection: z.number().int().min(-100).max(100).optional(),
  defaultTrust: z.number().int().min(-100).max(100).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const core = await prisma.personaCore.findUnique({
    where: { characterId: id },
  });
  if (!core) return errorJson("not_found", 404);
  return NextResponse.json(core);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);

  const existing = await prisma.personaCore.findUnique({
    where: { characterId: id },
  });
  if (!existing) {
    // 캐릭터가 PersonaCore 없이 생성된 경우 여기서 만든다 (필수 필드 디폴트 채움)
    const body = parsed.data;
    if (!body.displayName || !body.backstorySummary) {
      return errorJson("persona_missing_required", 400);
    }
    const created = await prisma.personaCore.create({
      data: {
        id: newId(),
        characterId: id,
        displayName: body.displayName,
        aliases: body.aliases ?? [],
        pronouns: body.pronouns ?? null,
        ageText: body.ageText ?? null,
        gender: body.gender ?? null,
        species: body.species ?? null,
        role: body.role ?? null,
        backstorySummary: body.backstorySummary,
        worldContext: body.worldContext ?? null,
        coreBeliefs: body.coreBeliefs ?? [],
        coreMotivations: body.coreMotivations ?? [],
        fears: body.fears ?? [],
        redLines: body.redLines ?? [],
        speechRegister: body.speechRegister ?? null,
        speechEndings: body.speechEndings ?? [],
        speechRhythm: body.speechRhythm ?? null,
        speechQuirks: body.speechQuirks ?? [],
        languageNotes: body.languageNotes ?? null,
        appearanceKeys: body.appearanceKeys ?? [],
        defaultAffection: body.defaultAffection ?? 0,
        defaultTrust: body.defaultTrust ?? 0,
      },
    });
    return NextResponse.json(created);
  }

  const updated = await prisma.personaCore.update({
    where: { id: existing.id },
    data: {
      ...parsed.data,
      version: { increment: 1 },
    },
  });
  return NextResponse.json(updated);
}
