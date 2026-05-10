import { PrismaClient } from "@prisma/client";
import { newId } from "../src/lib/ids";

const prisma = new PrismaClient();

type InterestSeed = {
  label: string;
  query: string;
  priority: number;
  freshnessHours: number;
};

const INTERESTS: Record<string, InterestSeed[]> = {
  mira: [
    { label: "대학생 트렌드", query: "한국 대학생 트렌드", priority: 70, freshnessHours: 48 },
    { label: "자취 요리", query: "자취생 간단 요리 신상", priority: 66, freshnessHours: 72 },
    { label: "서울 데이트", query: "서울 실내 데이트 코스", priority: 62, freshnessHours: 72 },
    { label: "편의점 신상", query: "편의점 신상 디저트", priority: 58, freshnessHours: 48 },
    { label: "ENFP 밈", query: "ENFP 밈 트렌드", priority: 42, freshnessHours: 168 },
  ],
  "do-yu-han": [
    { label: "위스키", query: "위스키 신제품 한국 출시", priority: 88, freshnessHours: 24 },
    { label: "칵테일", query: "서울 칵테일 바 트렌드", priority: 84, freshnessHours: 48 },
    { label: "한남동 바", query: "한남동 바 위스키", priority: 74, freshnessHours: 72 },
    { label: "도쿄 바", query: "도쿄 바 칵테일 트렌드", priority: 68, freshnessHours: 72 },
    { label: "바텐더 대회", query: "바텐더 대회 칵테일", priority: 64, freshnessHours: 72 },
  ],
  "han-yi-rin": [
    { label: "한국 수영", query: "한국 수영 국가대표 경기", priority: 90, freshnessHours: 24 },
    { label: "국제 수영대회", query: "국제 수영대회 자유형 배영", priority: 84, freshnessHours: 24 },
    { label: "수영 훈련", query: "수영 훈련법 코치", priority: 68, freshnessHours: 96 },
    { label: "스포츠 재활", query: "어깨 부상 스포츠 재활 수영", priority: 64, freshnessHours: 168 },
    { label: "생활체육 수영", query: "생활체육 수영장 강습", priority: 52, freshnessHours: 168 },
  ],
  "im-ha-neul": [
    { label: "임용고시", query: "임용고시 일정 교육 이슈", priority: 86, freshnessHours: 24 },
    { label: "대학생 생활", query: "대학생 생활비 알바 트렌드", priority: 72, freshnessHours: 48 },
    { label: "편의점 신상", query: "편의점 신상 야식", priority: 70, freshnessHours: 48 },
    { label: "카페 알바", query: "카페 알바 트렌드", priority: 54, freshnessHours: 96 },
    { label: "캠퍼스 축제", query: "서울 대학 축제 라인업", priority: 48, freshnessHours: 72 },
  ],
  "yoon-seo-ji": [
    { label: "출판계", query: "한국 출판계 뉴스", priority: 84, freshnessHours: 24 },
    { label: "신간 소설", query: "한국 신간 소설 추천", priority: 78, freshnessHours: 48 },
    { label: "문학상", query: "문학상 수상작 발표", priority: 74, freshnessHours: 48 },
    { label: "서울국제도서전", query: "서울국제도서전 출판 행사", priority: 62, freshnessHours: 72 },
    { label: "독립서점", query: "서울 독립서점 행사", priority: 58, freshnessHours: 96 },
  ],
};

async function main() {
  const results: Array<{ slug: string; upserted: number }> = [];
  for (const [slug, interests] of Object.entries(INTERESTS)) {
    const character = await prisma.character.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!character) {
      results.push({ slug, upserted: 0 });
      continue;
    }
    let upserted = 0;
    for (const item of interests) {
      await prisma.characterInterest.upsert({
        where: {
          characterId_query: {
            characterId: character.id,
            query: item.query,
          },
        },
        update: {
          label: item.label,
          priority: item.priority,
          freshnessHours: item.freshnessHours,
          enabled: true,
        },
        create: {
          id: newId(),
          characterId: character.id,
          label: item.label,
          query: item.query,
          priority: item.priority,
          freshnessHours: item.freshnessHours,
          enabled: true,
        },
      });
      upserted += 1;
    }
    results.push({ slug, upserted });
  }
  console.log(JSON.stringify({ results }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
