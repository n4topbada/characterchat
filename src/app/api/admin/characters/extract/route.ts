import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import {
  extractCharacterFromText,
  fetchSourceText,
} from "@/lib/characters/extract";
import { persistCharacter } from "@/lib/characters/persist";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  source: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("text"),
      text: z.string().min(1).max(200_000),
      title: z.string().max(200).optional(),
    }),
    z.object({
      type: z.literal("url"),
      url: z.string().url(),
      title: z.string().max(200).optional(),
    }),
    z.object({
      type: z.literal("knowledgeDoc"),
      docId: z.string().min(1),
    }),
  ]),
  commit: z.boolean().default(false),
  isPublic: z.boolean().default(false),
  nsfwEnabled: z.boolean().default(false),
});

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorJson("invalid_body", 400);
  const body = parsed.data;

  let sourceText = "";
  let sourceHint = "";
  let title = "character extraction source";
  let sourceUrls: string[] = [];

  if (body.source.type === "text") {
    sourceText = body.source.text;
    title = body.source.title ?? title;
    sourceHint = body.source.title ?? "uploaded text";
  } else if (body.source.type === "url") {
    sourceText = await fetchSourceText(body.source.url);
    title = body.source.title ?? body.source.url;
    sourceHint = body.source.url;
    sourceUrls = [body.source.url];
  } else {
    const doc = await prisma.knowledgeDoc.findUnique({
      where: { id: body.source.docId },
      select: { title: true, rawText: true, sourceUrls: true },
    });
    if (!doc) return errorJson("doc_not_found", 404);
    sourceText = doc.rawText;
    title = doc.title;
    sourceHint = `knowledgeDoc:${body.source.docId}`;
    sourceUrls = doc.sourceUrls;
  }

  const extracted = await extractCharacterFromText({ sourceText, sourceHint });

  if (!body.commit) {
    return NextResponse.json({ draft: extracted });
  }

  try {
    const character = await persistCharacter({
      slug: extracted.slug,
      name: extracted.name,
      tagline: extracted.tagline,
      accentColor: extracted.accentColor,
      greeting: extracted.greeting,
      isPublic: body.isPublic,
      nsfwEnabled: body.nsfwEnabled,
      persona: extracted.persona,
      interests: extracted.interests,
      sourceDoc: { title, rawText: sourceText, sourceUrls },
    });
    return NextResponse.json(
      { character: { id: character.id, slug: character.slug, name: character.name }, draft: extracted },
      { status: 201 },
    );
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return errorJson("slug_already_exists", 409);
    }
    throw e;
  }
}
