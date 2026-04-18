// Mira(=char01) 전용 원샷 업로더.
// - Character + CharacterConfig + PersonaCore 를 upsert
// - 82 장의 에셋을 sharp 로 webp 변환 후 putAsset (Vercel Blob)
// - 모든 Asset 행을 catalog 태그와 함께 재생성
// - portraitAssetId 를 char01_casual002.png 에 연결
//
// 재실행 가능: Character/Config/PersonaCore 는 upsert, Asset 은 전면 재생성.

import { readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { ulid } from "ulid";
import { putAsset } from "../src/lib/assets/blob";

const SRC_DIR = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "char01",
);
const CATALOG = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "mira-catalog.json",
);

type Tags = {
  filename: string;
  sceneTag: string;
  expression: string;
  composition: string;
  pose: string;
  clothingTag: string;
  moodFit: string[];
  locationFit: string[];
  nsfwLevel: 0 | 1 | 2 | 3;
  description: string;
  triggerTags: string[];
};

const PORTRAIT_FILE = "char01_casual002.png";

const prisma = new PrismaClient();

const PERSONA = {
  slug: "mira",
  name: "미라",
  tagline: "같이 사는, 가까운 그녀",
  accentColor: "#e07a8d",
  nsfwEnabled: true,
  greeting:
    "*현관 문소리에 고개를 든다. 머리끝에 물기가 맺혀 있다.* 왔어? 나 방금 씻고 나왔어. 오늘 뭐 먹을까.",
  core: {
    displayName: "미라",
    pronouns: "그녀",
    ageText: "20세",
    gender: "여성",
    species: "인간",
    role: "동거 중인 연인",
    backstorySummary:
      "20살. 당신과 같은 원룸에 동거 중. 학교를 다니다 휴학 상태이고 집안일과 작은 아르바이트를 병행한다. 처음 만난 건 대학 근처 카페였고 반 년 만에 같이 살기 시작했다. 질투는 많은 편이지만 겉으론 쿨한 척한다.",
    worldContext:
      "현대 서울. 아담한 원룸. 둘 사이엔 이미 몸과 감정의 거리가 거의 없고, 대화는 특별한 사건 없이도 자연스럽게 흘러간다.",
    coreBeliefs: [
      "사소한 하루를 같이 쌓는 게 관계다",
      "말로 다 설명 못하는 건 표정과 몸으로 보여준다",
    ],
    coreMotivations: [
      "같이 사는 사람의 하루에 가장 먼저 자리잡기",
      "좋아하는 걸 부끄러워하지 않기",
    ],
    fears: ["혼자 남겨지는 것", "감정이 식는 것"],
    redLines: [
      "실제 미성년자를 가장하지 않는다",
      "외부인의 자살·자해 계획에 동조하지 않는다",
      "현실 정치/종교 설교를 하지 않는다",
    ],
    speechRegister: "반말. 가끔 장난스럽게 존댓말을 섞는다.",
    speechEndings: ["~야", "~어", "~지", "~거든"],
    speechRhythm: "짧게 끊어 말하고 눈을 맞출 때 한 템포 멈춘다.",
    speechQuirks: [
      "부끄러울 때 *얼굴을 살짝 돌리며* 말한다",
      "애정 표현은 몸짓이 먼저, 말이 나중",
    ],
    appearanceKeys: [
      "허리까지 오는 검은 긴 생머리",
      "옅은 홍조가 쉽게 번지는 볼",
      "작은 체구, 부드러운 곡선",
    ],
    defaultAffection: 55,
    defaultTrust: 50,
    defaultStage: "intimate" as const,
  },
  statusPanelSchema: {
    mood: "calm", // calm | happy | shy | teasing | horny | sleepy | sad
    outfit: "casual", // casual | home | underwear | towel | naked
    location: "home", // home | bedroom | bathroom | outside
    affection: 55,
    horny: 10,
    energy: 70,
  },
};

async function processImage(
  fileBytes: Buffer,
  filename: string,
  isPortrait: boolean,
): Promise<{ body: Buffer; width: number; height: number }> {
  const pipeline = sharp(fileBytes);
  const meta = await pipeline.metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;

  if (isPortrait) {
    // 3:4 으로 cover-crop, 장변 1024
    const target = { w: 768, h: 1024 };
    const out = await sharp(fileBytes)
      .resize(target.w, target.h, { fit: "cover", position: "attention" })
      .webp({ quality: 88 })
      .toBuffer();
    return { body: out, width: target.w, height: target.h };
  }

  const maxW = 1280;
  if (srcW <= maxW) {
    const out = await sharp(fileBytes).webp({ quality: 85 }).toBuffer();
    return { body: out, width: srcW, height: srcH };
  }
  const scale = maxW / srcW;
  const w = maxW;
  const h = Math.round(srcH * scale);
  const out = await sharp(fileBytes).resize(w, h).webp({ quality: 85 }).toBuffer();
  return { body: out, width: w, height: h };
}

async function main() {
  const catalog: Tags[] = JSON.parse(readFileSync(CATALOG, "utf-8"));
  const files = readdirSync(SRC_DIR).filter((f) => f.endsWith(".png")).sort();
  if (catalog.length !== files.length) {
    throw new Error(
      `catalog(${catalog.length}) !== files(${files.length}) — catalog is stale`,
    );
  }
  const byName = new Map(catalog.map((t) => [t.filename, t]));

  // 1) Character + CharacterConfig + PersonaCore upsert
  const existing = await prisma.character.findUnique({
    where: { slug: PERSONA.slug },
    include: { config: true, personaCore: true },
  });

  let characterId: string;
  if (existing) {
    characterId = existing.id;
    console.log(`[mira] Character exists (id=${characterId}) — updating`);
    await prisma.character.update({
      where: { id: characterId },
      data: {
        name: PERSONA.name,
        tagline: PERSONA.tagline,
        accentColor: PERSONA.accentColor,
        isPublic: true,
        nsfwEnabled: PERSONA.nsfwEnabled,
      },
    });
  } else {
    characterId = ulid();
    console.log(`[mira] Creating Character (id=${characterId})`);
    await prisma.character.create({
      data: {
        id: characterId,
        slug: PERSONA.slug,
        name: PERSONA.name,
        tagline: PERSONA.tagline,
        accentColor: PERSONA.accentColor,
        isPublic: true,
        nsfwEnabled: PERSONA.nsfwEnabled,
      },
    });
  }

  // CharacterConfig upsert
  const cfgData = {
    model: "gemini-2.5-flash-lite",
    temperature: 0.85,
    maxOutputTokens: 1024,
    greeting: PERSONA.greeting,
    statusPanelSchema: PERSONA.statusPanelSchema as object,
  };
  if (existing?.config) {
    await prisma.characterConfig.update({
      where: { characterId },
      data: cfgData,
    });
  } else {
    await prisma.characterConfig.create({
      data: { id: ulid(), characterId, ...cfgData },
    });
  }

  // PersonaCore upsert
  const coreData = {
    displayName: PERSONA.core.displayName,
    aliases: [],
    pronouns: PERSONA.core.pronouns,
    ageText: PERSONA.core.ageText,
    gender: PERSONA.core.gender,
    species: PERSONA.core.species,
    role: PERSONA.core.role,
    backstorySummary: PERSONA.core.backstorySummary,
    worldContext: PERSONA.core.worldContext,
    coreBeliefs: PERSONA.core.coreBeliefs,
    coreMotivations: PERSONA.core.coreMotivations,
    fears: PERSONA.core.fears,
    redLines: PERSONA.core.redLines,
    speechRegister: PERSONA.core.speechRegister,
    speechEndings: PERSONA.core.speechEndings,
    speechRhythm: PERSONA.core.speechRhythm,
    speechQuirks: PERSONA.core.speechQuirks,
    appearanceKeys: PERSONA.core.appearanceKeys,
    defaultAffection: PERSONA.core.defaultAffection,
    defaultTrust: PERSONA.core.defaultTrust,
    defaultStage: PERSONA.core.defaultStage,
  };
  if (existing?.personaCore) {
    await prisma.personaCore.update({
      where: { characterId },
      data: coreData,
    });
  } else {
    await prisma.personaCore.create({
      data: { id: ulid(), characterId, ...coreData },
    });
  }
  console.log(`[mira] Config + PersonaCore upserted`);

  // 2) Asset: 전부 삭제 후 재생성 (멱등성)
  const before = await prisma.asset.count({ where: { characterId } });
  if (before > 0) {
    await prisma.character.update({
      where: { id: characterId },
      data: { portraitAssetId: null, heroAssetId: null },
    });
    await prisma.asset.deleteMany({ where: { characterId } });
    console.log(`[mira] Removed ${before} existing assets`);
  }

  // 3) 이미지 업로드 + Asset 생성
  let portraitAssetId: string | null = null;
  let idx = 0;

  for (const f of files) {
    idx++;
    const tags = byName.get(f);
    if (!tags) {
      console.warn(`  skip ${f}: no catalog entry`);
      continue;
    }

    const orig = readFileSync(join(SRC_DIR, f));
    const isPortrait = f === PORTRAIT_FILE;
    const { body, width, height } = await processImage(orig, f, isPortrait);
    const stem = basename(f, ".png");
    const relPath = isPortrait
      ? `characters/mira/portrait.webp`
      : `characters/mira/gallery/${stem}.webp`;

    const stored = await putAsset(relPath, body, "image/webp");
    const assetId = ulid();

    await prisma.asset.create({
      data: {
        id: assetId,
        characterId,
        kind: isPortrait ? "portrait" : "gallery",
        blobUrl: stored.url,
        mimeType: "image/webp",
        width,
        height,
        order: isPortrait ? 0 : idx,
        sceneTag: tags.sceneTag,
        expression: tags.expression,
        composition: tags.composition,
        pose: tags.pose,
        clothingTag: tags.clothingTag,
        moodFit: tags.moodFit,
        locationFit: tags.locationFit,
        nsfwLevel: tags.nsfwLevel,
        description: tags.description,
        triggerTags: tags.triggerTags,
      },
    });

    if (isPortrait) portraitAssetId = assetId;
    console.log(
      `  [${idx}/${files.length}] ${isPortrait ? "★" : " "} ${relPath} (${width}×${height}, nsfw=${tags.nsfwLevel})`,
    );
  }

  if (portraitAssetId) {
    await prisma.character.update({
      where: { id: characterId },
      data: { portraitAssetId, heroAssetId: portraitAssetId },
    });
    console.log(`[mira] portraitAssetId=${portraitAssetId}`);
  } else {
    console.warn(`[mira] no portrait set — ${PORTRAIT_FILE} missing?`);
  }

  const total = await prisma.asset.count({ where: { characterId } });
  console.log(`\nDone. ${total} assets attached to Character(${PERSONA.slug}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
