import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth, json } from "@/lib/api-utils";
import { stripImageTags } from "@/lib/assets/pickAsset";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireAuth();
  if (gate instanceof NextResponse) return gate;

  // 대화 기록 응답도 /history 페이지와 동일하게 "유저가 1회 이상 발화한
  // 세션" 만 노출한다. 캐릭터에 진입만 하고 돌아간 empty session 은 숨긴다.
  const sessions = await prisma.session.findMany({
    where: {
      userId: gate.userId,
      messages: { some: { role: "user" } },
    },
    orderBy: { lastMessageAt: "desc" },
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
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  return json(
    sessions.map((s) => ({
      id: s.id,
      lastMessageAt: s.lastMessageAt,
      character: {
        slug: s.character.slug,
        name: s.character.name,
        // /history SSR 과 동일 정책: ani 가 등록돼 있으면 ani 우선. 이전엔
        // blobUrl 만 내보내서 클라가 이 API 를 쓸 경우 정지컷이 떴다.
        portraitUrl:
          s.character.assets[0]?.animationUrl ??
          s.character.assets[0]?.blobUrl ??
          null,
        accentColor: s.character.accentColor,
      },
      preview: stripImageTags(s.messages[0]?.content ?? "").slice(0, 80),
    }))
  );
}
