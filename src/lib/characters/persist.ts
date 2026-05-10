import { Prisma } from "@prisma/client";
import { MODELS } from "@/lib/gemini/client";
import { newId } from "@/lib/ids";
import { prisma } from "@/lib/db";

export type PersistablePersona = {
  displayName: string;
  aliases?: string[];
  pronouns?: string | null;
  ageText?: string | null;
  gender?: string | null;
  species?: string | null;
  role?: string | null;
  backstorySummary: string;
  worldContext?: string | null;
  coreBeliefs?: string[];
  coreMotivations?: string[];
  fears?: string[];
  redLines?: string[];
  speechRegister?: string | null;
  speechEndings?: string[];
  speechRhythm?: string | null;
  speechQuirks?: string[];
  languageNotes?: string | null;
  appearanceKeys?: string[];
  shortTags?: string[];
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

export type PersistCharacterInput = {
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  greeting: string;
  isPublic?: boolean;
  nsfwEnabled?: boolean;
  persona: PersistablePersona;
  sourceDoc?: {
    title: string;
    rawText: string;
    sourceUrls?: string[];
  };
  interests?: Array<{
    label: string;
    query: string;
    priority?: number;
    freshnessHours?: number;
  }>;
};

export async function persistCharacter(input: PersistCharacterInput) {
  const clash = await prisma.character.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (clash) {
    throw new Prisma.PrismaClientKnownRequestError("slug_taken", {
      code: "P2002",
      clientVersion: Prisma.prismaVersion.client,
      meta: { target: ["slug"] },
    });
  }

  const characterId = newId();
  const persona = input.persona;

  return prisma.$transaction(async (tx) => {
    const character = await tx.character.create({
      data: {
        id: characterId,
        slug: input.slug,
        name: input.name,
        tagline: input.tagline,
        accentColor: input.accentColor,
        isPublic: input.isPublic ?? false,
        nsfwEnabled: input.nsfwEnabled ?? false,
      },
    });

    await tx.characterConfig.create({
      data: {
        id: newId(),
        characterId: character.id,
        model: MODELS.chat,
        temperature: 0.8,
        maxOutputTokens: 1024,
        greeting: input.greeting,
      },
    });

    await tx.personaCore.create({
      data: {
        id: newId(),
        characterId: character.id,
        displayName: persona.displayName,
        aliases: persona.aliases ?? [],
        pronouns: persona.pronouns ?? null,
        ageText: persona.ageText ?? null,
        gender: persona.gender ?? null,
        species: persona.species ?? null,
        role: persona.role ?? null,
        backstorySummary: persona.backstorySummary,
        worldContext: persona.worldContext ?? null,
        coreBeliefs: persona.coreBeliefs ?? [],
        coreMotivations: persona.coreMotivations ?? [],
        fears: persona.fears ?? [],
        redLines: persona.redLines ?? [],
        speechRegister: persona.speechRegister ?? null,
        speechEndings: persona.speechEndings ?? [],
        speechRhythm: persona.speechRhythm ?? null,
        speechQuirks: persona.speechQuirks ?? [],
        languageNotes: persona.languageNotes ?? null,
        appearanceKeys: persona.appearanceKeys ?? [],
        shortTags: persona.shortTags ?? [],
        heightCm: persona.heightCm ?? null,
        weightKg: persona.weightKg ?? null,
        threeSize: persona.threeSize ?? null,
        mbti: persona.mbti ?? null,
      },
    });

    if (input.sourceDoc?.rawText) {
      await tx.knowledgeDoc.create({
        data: {
          id: newId(),
          characterId: character.id,
          title: input.sourceDoc.title,
          source: "character_extraction",
          rawText: input.sourceDoc.rawText,
          sourceUrls: input.sourceDoc.sourceUrls ?? [],
        },
      });
    }

    for (const interest of input.interests ?? []) {
      if (!interest.query.trim()) continue;
      await tx.characterInterest.create({
        data: {
          id: newId(),
          characterId: character.id,
          label: interest.label.trim() || interest.query.trim(),
          query: interest.query.trim(),
          priority: interest.priority ?? 50,
          freshnessHours: interest.freshnessHours ?? 24,
        },
      });
    }

    return character;
  });
}
