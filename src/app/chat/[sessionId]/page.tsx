import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ChatShell } from "@/components/chat/ChatShell";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/auth/signin?callbackUrl=/chat/${sessionId}`);
  }

  const s = await prisma.session.findUnique({
    where: { id: sessionId },
    include: {
      character: {
        include: {
          assets: {
            where: { kind: "portrait" },
            orderBy: { order: "asc" },
            take: 1,
          },
        },
      },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!s || s.userId !== session.user.id) notFound();

  return (
    <ChatShell
      sessionId={s.id}
      character={{
        name: s.character.name,
        portraitUrl: s.character.assets[0]?.blobUrl ?? null,
        tagline: s.character.tagline,
      }}
      initialMessages={s.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
