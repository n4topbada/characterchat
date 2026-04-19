/**
 * 대화기록 전부 삭제 — Message + Session + (옵션) PersonaState.statusPayload 초기화.
 *
 * 사용자 명시 허가: "대화기록은 삭제 해도 되". 캐릭터 / PersonaCore / KnowledgeChunk /
 * Asset 은 보존 (캐릭터 정의는 그대로 두고 대화 스레드만 리셋).
 *
 * 실행: npx tsx scripts/wipe-chat-history.ts
 */
import { prisma } from "../src/lib/db";

async function main() {
  const [msgs, sessions, stateReset] = await prisma.$transaction([
    prisma.message.deleteMany({}),
    prisma.session.deleteMany({}),
    // PersonaState 는 유지하되 statusPayload 만 비워 RoomBackdrop 이 최신 메시지에서
    // 다시 픽업하도록. pendingEmotions 도 함께 초기화.
    prisma.personaState.updateMany({
      data: { statusPayload: undefined, pendingEmotions: undefined },
    }),
  ]);
  console.log(
    `[wipe] deleted messages=${msgs.count} sessions=${sessions.count} state-reset=${stateReset.count}`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
