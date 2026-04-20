/**
 * 4명 기존 캐릭터의 PersonaCore 에 신체 스펙(heightCm/weightKg/threeSize/mbti) 을 채운다.
 * 카드 프로필 박스 노출용. 한 번만 실행하면 되고, 이미 값이 있으면 덮어쓰지 않는다.
 *
 * 실행: npx tsx scripts/seed-physical-stats.ts
 */
import { prisma } from "../src/lib/db";

type Stats = {
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

const BY_SLUG: Record<string, Stats> = {
  mira: { heightCm: 161, weightKg: 46, threeSize: "82-58-85", mbti: "ENFP" },
  jun: { heightCm: 178, weightKg: 72, threeSize: null, mbti: "ISFP" },
  yura: { heightCm: 168, weightKg: 52, threeSize: "85-61-88", mbti: "INTJ" },
  aria: { heightCm: 157, weightKg: 45, threeSize: "80-57-82", mbti: "INFP" },
};

async function main() {
  let updated = 0;
  for (const [slug, stats] of Object.entries(BY_SLUG)) {
    const c = await prisma.character.findUnique({
      where: { slug },
      select: { id: true, personaCore: { select: { id: true, heightCm: true, weightKg: true, threeSize: true, mbti: true } } },
    });
    if (!c?.personaCore) {
      console.log(`[skip] ${slug}: no personaCore`);
      continue;
    }
    const pc = c.personaCore;
    const data: Stats = {};
    if (pc.heightCm == null && stats.heightCm != null) data.heightCm = stats.heightCm;
    if (pc.weightKg == null && stats.weightKg != null) data.weightKg = stats.weightKg;
    if (pc.threeSize == null && stats.threeSize != null) data.threeSize = stats.threeSize;
    if (pc.mbti == null && stats.mbti != null) data.mbti = stats.mbti;
    if (Object.keys(data).length === 0) {
      console.log(`[keep] ${slug}: already filled`);
      continue;
    }
    await prisma.personaCore.update({ where: { id: pc.id }, data });
    console.log(`[fill] ${slug}:`, data);
    updated++;
  }
  console.log(`[done] updated=${updated}/${Object.keys(BY_SLUG).length}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
