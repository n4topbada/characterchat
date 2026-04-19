import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { auth } from "@/lib/auth";
import { ChatShell } from "@/components/chat/ChatShell";
import {
  pickBestBackground,
  type PickableBackground,
} from "@/lib/assets/pickBackground";
import {
  statusToTokens,
  spotBodyTokens,
} from "@/lib/assets/pickAsset";
import { extractStatus } from "@/lib/narration";

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
      messages: {
        orderBy: { createdAt: "desc" },
        take: 60,
        include: {
          imageAsset: {
            select: { blobUrl: true, width: true, height: true },
          },
        },
      },
    },
  });

  if (!s || s.userId !== session.user.id) notFound();

  // 초기 RoomBackdrop URL 계산: (1) PersonaState.statusPayload 우선,
  // (2) 없으면 최신 model 메시지의 <status> 블록에서 추출. location+mood 토큰으로
  // pickBestBackground 스코어링. 매칭 없으면 null (기존 diagonal/dot 패턴만 보임).
  let initialBackgroundUrl: string | null = null;
  const backgroundRows = await prisma.asset.findMany({
    where: { characterId: s.characterId, kind: "background" },
    select: {
      id: true,
      blobUrl: true,
      width: true,
      height: true,
      moodFit: true,
      locationFit: true,
      triggerTags: true,
      description: true,
    },
  });
  if (backgroundRows.length) {
    const personaState = await prisma.personaState.findUnique({
      where: {
        userId_characterId: {
          userId: session.user.id,
          characterId: s.characterId,
        },
      },
      select: { statusPayload: true },
    });
    let status: unknown = personaState?.statusPayload ?? null;
    let body = "";
    if (!status) {
      for (const m of [...s.messages]) {
        if (m.role !== "model") continue;
        const parsed = extractStatus(m.content);
        if (parsed.status) {
          status = parsed.status;
          body = parsed.body;
          break;
        }
      }
    }
    if (status && typeof status === "object") {
      const tokens = [
        ...statusToTokens(status),
        ...(body ? spotBodyTokens(body) : []),
      ];
      const bg = pickBestBackground(
        backgroundRows as PickableBackground[],
        tokens,
        { seed: s.id },
      );
      initialBackgroundUrl = bg?.blobUrl ?? null;
    }
  }

  return (
    <ChatShell
      sessionId={s.id}
      character={{
        name: s.character.name,
        portraitUrl:
          s.character.assets[0]?.animationUrl ??
          s.character.assets[0]?.blobUrl ??
          null,
        tagline: s.character.tagline,
      }}
      initialMessages={[...s.messages].reverse().map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        image: m.imageAsset
          ? {
              url: m.imageAsset.blobUrl,
              width: m.imageAsset.width,
              height: m.imageAsset.height,
            }
          : null,
      }))}
      initialBackgroundUrl={initialBackgroundUrl}
    />
  );
}
