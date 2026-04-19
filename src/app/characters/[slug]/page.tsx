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
    },
  });
  if (!c || !c.isPublic) notFound();

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
            <h2 className="font-headline text-4xl font-bold text-on-surface leading-tight tracking-tight mb-3">
              {c.name}
            </h2>
            <p className="text-on-surface-variant text-sm leading-relaxed mb-8">
              {c.tagline}
            </p>

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
