import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { StartChatButton } from "./StartChatButton";
import { ArrowLeft, SlidersHorizontal } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CharacterLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = await prisma.character.findUnique({
    where: { slug },
    include: {
      assets: { orderBy: { order: "asc" } },
      personaCore: {
        select: {
          role: true,
          ageText: true,
          species: true,
          worldContext: true,
          backstorySummary: true,
          coreMotivations: true,
          appearanceKeys: true,
        },
      },
    },
  });
  if (!c || !c.isPublic) notFound();

  const meta = [
    c.personaCore?.role,
    c.personaCore?.ageText,
    c.personaCore?.species,
  ]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .join(" · ");

  const appearanceTags = (c.personaCore?.appearanceKeys ?? [])
    .filter((k) => !/^ref\s+image\s*:/i.test(k))
    .slice(0, 5);

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/characters/${slug}`);
  }

  const portraitAsset = c.assets.find((a) => a.kind === "portrait");
  const heroAsset = c.assets.find((a) => a.kind === "hero") ?? portraitAsset;
  const portrait =
    portraitAsset?.animationUrl ?? portraitAsset?.blobUrl ?? null;
  const hero = heroAsset?.animationUrl ?? heroAsset?.blobUrl ?? portrait;
  const heroIsAnimated = !!(hero && /\/portraits\/ani\//.test(hero));

  return (
    <main className="flex-1 min-h-0 bg-surface relative overflow-y-auto">
      <div className="absolute inset-0 pointer-events-none dot-pattern opacity-30 z-0" />

      <header className="glass sticky top-0 inset-x-0 z-30">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={"/find" as "/find"}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-md transition-colors"
              aria-label="Back"
            >
              <ArrowLeft size={20} strokeWidth={2} />
            </Link>
            <div>
              <h1 className="font-headline font-black tracking-[0.15em] text-on-surface uppercase text-sm truncate max-w-[60vw]">
                {c.name}
              </h1>
            </div>
          </div>
          <button
            type="button"
            aria-label="Settings"
            className="w-10 h-10 flex items-center justify-center text-primary hover:bg-surface-container-low transition-colors rounded-md"
          >
            <SlidersHorizontal size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* Hero portrait */}
      <div className="relative h-[58dvh] w-full overflow-hidden z-10 -mt-16 pt-16">
        {hero ? (
          <Image
            src={hero}
            alt=""
            fill
            className="object-cover"
            priority
            sizes="100vw"
            unoptimized={heroIsAnimated}
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(135deg, #3a5f94 0%, #a7c8ff 50%, #cee9d9 100%)",
            }}
          />
        )}
        <div className="absolute inset-0 diagonal-bg opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-surface" />
      </div>

      {/* Card */}
      <section className="-mt-16 relative z-20 px-4">
        <div className="bg-surface-container-lowest rounded-lg shadow-tinted-lg relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
          <div className="p-7 pl-8">
            <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight tracking-tight mb-2">
              {c.name}
            </h2>
            {meta && (
              <p className="label-mono text-primary/70 text-[11px] mb-3 truncate">
                {meta}
              </p>
            )}
            <p className="text-on-surface text-sm leading-relaxed mb-4 font-medium">
              {c.tagline}
            </p>

            {c.personaCore?.backstorySummary && (
              <p className="text-on-surface-variant text-sm leading-relaxed mb-4">
                {c.personaCore.backstorySummary}
              </p>
            )}

            {c.personaCore?.worldContext && (
              <div className="mb-5 p-3 bg-surface-container-low border-l-2 border-secondary">
                <p className="label-mono text-secondary text-[10px] mb-1">
                  WORLD
                </p>
                <p className="text-on-surface-variant text-xs leading-relaxed">
                  {c.personaCore.worldContext}
                </p>
              </div>
            )}

            {(c.personaCore?.coreMotivations?.length ?? 0) > 0 && (
              <div className="mb-5">
                <p className="label-mono text-primary/70 text-[10px] mb-2">
                  MOTIVATION
                </p>
                <ul className="space-y-1">
                  {c.personaCore!.coreMotivations.slice(0, 3).map((m) => (
                    <li
                      key={m}
                      className="text-on-surface-variant text-xs leading-relaxed pl-3 border-l border-primary/30"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {appearanceTags.length > 0 && (
              <div className="mb-6 flex flex-wrap gap-2">
                {appearanceTags.map((t, i) => (
                  <span
                    key={t}
                    className={[
                      "px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-sm truncate max-w-[14rem]",
                      i % 3 === 0
                        ? "bg-tertiary-container text-on-tertiary-container"
                        : i % 3 === 1
                          ? "bg-secondary-container text-on-secondary-container"
                          : "bg-surface-container-high text-on-surface-variant",
                    ].join(" ")}
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div>
              <StartChatButton characterId={c.id} />
            </div>
          </div>
        </div>
      </section>

      <div className="h-20" />
    </main>
  );
}
