import { redirect, notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { AdminCharacterEditor } from "./AdminCharacterEditor";

export const dynamic = "force-dynamic";

export default async function AdminCharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/admin");
  if (session.user.role !== "admin") redirect("/find");

  const { id } = await params;
  const character = await prisma.character.findUnique({
    where: { id },
    include: {
      config: true,
      personaCore: true,
      assets: { orderBy: [{ kind: "asc" }, { order: "asc" }] },
    },
  });
  if (!character) notFound();

  return (
    <AdminCharacterEditor
      character={{
        id: character.id,
        slug: character.slug,
        name: character.name,
        tagline: character.tagline,
        accentColor: character.accentColor,
        isPublic: character.isPublic,
        config: character.config && {
          id: character.config.id,
          model: character.config.model,
          temperature: character.config.temperature,
          maxOutputTokens: character.config.maxOutputTokens,
          greeting: character.config.greeting,
        },
        core: character.personaCore && {
          displayName: character.personaCore.displayName,
          aliases: character.personaCore.aliases,
          pronouns: character.personaCore.pronouns,
          ageText: character.personaCore.ageText,
          gender: character.personaCore.gender,
          species: character.personaCore.species,
          role: character.personaCore.role,
          backstorySummary: character.personaCore.backstorySummary,
          worldContext: character.personaCore.worldContext,
          coreBeliefs: character.personaCore.coreBeliefs,
          coreMotivations: character.personaCore.coreMotivations,
          fears: character.personaCore.fears,
          redLines: character.personaCore.redLines,
          speechRegister: character.personaCore.speechRegister,
          speechEndings: character.personaCore.speechEndings,
          speechRhythm: character.personaCore.speechRhythm,
          speechQuirks: character.personaCore.speechQuirks,
          languageNotes: character.personaCore.languageNotes,
          appearanceKeys: character.personaCore.appearanceKeys,
          defaultAffection: character.personaCore.defaultAffection,
          defaultTrust: character.personaCore.defaultTrust,
        },
        assets: character.assets.map((a) => ({
          id: a.id,
          kind: a.kind,
          blobUrl: a.blobUrl,
          width: a.width,
          height: a.height,
        })),
      }}
    />
  );
}
