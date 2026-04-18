import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/api-utils";
import { MODELS } from "@/lib/gemini/client";
import { newId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const PersonaSchema = z.object({
  displayName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  pronouns: z.string().nullable().optional(),
  ageText: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  species: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  backstorySummary: z.string().min(1),
  worldContext: z.string().nullable().optional(),
  coreBeliefs: z.array(z.string()).default([]),
  coreMotivations: z.array(z.string()).default([]),
  fears: z.array(z.string()).default([]),
  redLines: z.array(z.string()).default([]),
  speechRegister: z.string().nullable().optional(),
  speechEndings: z.array(z.string()).default([]),
  speechRhythm: z.string().nullable().optional(),
  speechQuirks: z.array(z.string()).default([]),
  languageNotes: z.string().nullable().optional(),
  appearanceKeys: z.array(z.string()).default([]),
});

const BodySchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/, "slug은 영소문자/숫자/대시만 가능"),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(200),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#3a5f94"),
  persona: PersonaSchema,
  greeting: z.string().min(1).max(2000),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (guard instanceof NextResponse) return guard;
  const { id } = await ctx.params;

  const run = await prisma.casterRun.findFirst({
    where: { id, adminUserId: guard.userId },
    select: { id: true, status: true, savedCharacterId: true },
  });
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (run.savedCharacterId) {
    return NextResponse.json({ error: "already_committed" }, { status: 409 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // slug 유일성
  const slugClash = await prisma.character.findUnique({
    where: { slug: body.slug },
    select: { id: true },
  });
  if (slugClash) {
    return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  const characterId = newId();
  const configId = newId();
  const personaId = newId();

  const created = await prisma.$transaction(async (tx) => {
    const character = await tx.character.create({
      data: {
        id: characterId,
        slug: body.slug,
        name: body.name,
        tagline: body.tagline,
        accentColor: body.accentColor,
        isPublic: true,
      },
    });

    await tx.characterConfig.create({
      data: {
        id: configId,
        characterId: character.id,
        model: MODELS.chat,
        temperature: 0.8,
        maxOutputTokens: 1024,
        greeting: body.greeting,
      },
    });

    await tx.personaCore.create({
      data: {
        id: personaId,
        characterId: character.id,
        displayName: body.persona.displayName,
        aliases: body.persona.aliases,
        pronouns: body.persona.pronouns ?? null,
        ageText: body.persona.ageText ?? null,
        gender: body.persona.gender ?? null,
        species: body.persona.species ?? null,
        role: body.persona.role ?? null,
        backstorySummary: body.persona.backstorySummary,
        worldContext: body.persona.worldContext ?? null,
        coreBeliefs: body.persona.coreBeliefs,
        coreMotivations: body.persona.coreMotivations,
        fears: body.persona.fears,
        redLines: body.persona.redLines,
        speechRegister: body.persona.speechRegister ?? null,
        speechEndings: body.persona.speechEndings,
        speechRhythm: body.persona.speechRhythm ?? null,
        speechQuirks: body.persona.speechQuirks,
        languageNotes: body.persona.languageNotes ?? null,
        appearanceKeys: body.persona.appearanceKeys,
      },
    });

    await tx.casterRun.update({
      where: { id: run.id },
      data: {
        status: "saved",
        savedCharacterId: character.id,
        endedAt: new Date(),
        draftJson: body as unknown as object,
      },
    });

    return character;
  });

  return NextResponse.json(
    { character: { id: created.id, slug: created.slug, name: created.name } },
    { status: 201 },
  );
}
