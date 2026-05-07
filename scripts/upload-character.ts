/**
 * 일반 캐릭터 에셋 일괄 업로더.
 *
 * 파일명 스킴(`docs/11-assets.md §2`) 을 유일한 진실 소스로 사용하여,
 * `asset/charNNNN/*.png` 를 읽어 들이고, 각 파일의 분류 필드를 regex
 * 로 유도한다. 별도 카탈로그 JSON 이 필요 없다.
 *
 * 사용:
 *   npx tsx scripts/upload-character.ts \
 *     --slug ryu-ha-jin --src char0002 \
 *     --portrait char0002_home_aroused_sfw_0072.png \
 *     --cap 1
 *
 *   npx tsx scripts/upload-character.ts \
 *     --slug seo-ah-jin --src char0003 \
 *     --portrait char0003_daily_neutral_sfw_0030.png \
 *     --cap 3
 *
 * 흐름:
 *   1. .env.prod 로드 (BLOB_READ_WRITE_TOKEN 필요)
 *   2. Character 조회 (slug). 없으면 실패(먼저 등록되어 있어야 함)
 *   3. 기존 Asset 전부 삭제(wipe) + portraitAssetId/heroAssetId null
 *   4. 파일마다:
 *      - classify()  : 파일명 → { kind, sceneTag, expression, clothingTag,
 *                                  nsfwLevel, moodFit, locationFit, triggerTags, description }
 *      - processImage(): sharp 로 변환 (portrait: 3:4 cover, 그 외: 1280 cap)
 *      - putAsset()    : Blob 업로드
 *      - Asset.create()
 *   5. portrait 면 Character.portraitAssetId + heroAssetId 업데이트
 */
import {
  readdirSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { resolve, join } from "node:path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { ulid } from "ulid";
import { config as loadEnv } from "dotenv";
import { put } from "@vercel/blob";

loadEnv({ path: resolve(process.cwd(), ".env.prod"), override: true });

const prisma = new PrismaClient();

// ── CLI 파싱 ──────────────────────────────────────────────────────────
function arg(name: string, fallback?: string): string | undefined {
  const key = `--${name}`;
  const idx = process.argv.indexOf(key);
  if (idx >= 0 && idx + 1 < process.argv.length) return process.argv[idx + 1];
  const eq = process.argv.find((a) => a.startsWith(`${key}=`));
  if (eq) return eq.slice(key.length + 1);
  return fallback;
}

const SLUG = arg("slug");
const SRC = arg("src"); // asset 하위 디렉토리명
const PORTRAIT = arg("portrait"); // asset 내 파일명
const NSFW_CAP = parseInt(arg("cap", "3")!, 10);

if (!SLUG || !SRC || !PORTRAIT) {
  console.error(
    "사용법: --slug <slug> --src <asset-dir> --portrait <filename.png> [--cap 0-3]",
  );
  process.exit(1);
}
if (![0, 1, 2, 3].includes(NSFW_CAP)) {
  console.error("cap 은 0/1/2/3 중 하나여야 합니다.");
  process.exit(1);
}

const SRC_DIR = resolve(process.cwd(), "asset", SRC);
if (!existsSync(SRC_DIR)) {
  console.error(`소스 디렉토리 없음: ${SRC_DIR}`);
  process.exit(1);
}

// ── 매핑 테이블 (docs/11-assets.md §3) ────────────────────────────────
type Scene =
  | "home"
  | "daily"
  | "work"
  | "gym"
  | "sleep"
  | "nude"
  | "underwear"
  | "naked"
  | "shirt"
  | "sex_bg";
type Expression =
  | "neutral"
  | "happy"
  | "angry"
  | "sad"
  | "embarrassed"
  | "aroused"
  | "daily"; // 파일명 관례: 'daily' 가 expression 위치에 오면 '일상 무드' == neutral

const SCENE_MAP: Record<
  Scene,
  {
    sceneTag: string;
    clothingTag: string;
    baseNsfw: 0 | 1 | 2 | 3;
    locationFit: string[];
  }
> = {
  home: { sceneTag: "home", clothingTag: "dressed", baseNsfw: 0, locationFit: ["home"] },
  daily: { sceneTag: "casual", clothingTag: "dressed", baseNsfw: 0, locationFit: ["home"] },
  work: { sceneTag: "work", clothingTag: "dressed", baseNsfw: 0, locationFit: ["office"] },
  gym: { sceneTag: "gym", clothingTag: "dressed", baseNsfw: 0, locationFit: ["gym"] },
  sleep: { sceneTag: "sleep", clothingTag: "partial", baseNsfw: 0, locationFit: ["bedroom"] },
  nude: { sceneTag: "nude", clothingTag: "naked", baseNsfw: 1, locationFit: ["bedroom", "home"] },
  underwear: { sceneTag: "underwear", clothingTag: "underwear", baseNsfw: 2, locationFit: ["bedroom", "home"] },
  naked: { sceneTag: "naked", clothingTag: "naked", baseNsfw: 2, locationFit: ["bedroom", "home"] },
  // 셔츠만 입은 partial 노출 — char0005 의 sex_shirt 시리즈 대응. dress 와 naked
  // 사이의 중간 단계.
  shirt: { sceneTag: "partial", clothingTag: "partial", baseNsfw: 1, locationFit: ["bedroom", "home"] },
  sex_bg: { sceneTag: "sex_bg", clothingTag: "naked", baseNsfw: 3, locationFit: ["bedroom", "home"] },
};

// sex_<outfit> 의 sceneTag 는 "sex_<outfit>" (예: "sex_naked", "sex_underwear",
// "sex_home"). pickAsset 의 prefix 매칭(`startsWith("sex")`)이 정상 동작하므로
// "sex" 토큰 한 방에 모두 +12 보너스를 받는다.
function sexSceneFor(outfit: string): {
  sceneTag: string;
  clothingTag: string;
  baseNsfw: 3;
} {
  const map: Record<string, string> = {
    naked: "naked",
    nude: "naked",
    underwear: "underwear",
    shirt: "partial",
    home: "dressed",
    daily: "dressed",
    work: "dressed",
  };
  const ct = map[outfit] ?? "dressed";
  return { sceneTag: `sex_${outfit}`, clothingTag: ct, baseNsfw: 3 };
}

const EXPR_MAP: Record<
  Expression,
  { expression: string; moodFit: string[] }
> = {
  neutral: { expression: "neutral", moodFit: ["calm"] },
  happy: { expression: "smile", moodFit: ["happy"] },
  angry: { expression: "angry", moodFit: ["angry", "tense"] },
  sad: { expression: "crying", moodFit: ["sad"] },
  embarrassed: { expression: "shy", moodFit: ["shy"] },
  aroused: { expression: "seductive", moodFit: ["horny", "teasing"] },
  daily: { expression: "neutral", moodFit: ["calm"] }, // `home_daily` 같은 변주
};

// ── 파일명 파서 ─────────────────────────────────────────────────────
// 포트레이트/갤러리(표준 5-token): char0002_home_aroused_sfw_0072.png
const FG_RE =
  /^char\d{2,4}_(home|daily|work|gym|sleep|nude|underwear|naked|shirt)_(neutral|happy|angry|sad|embarrassed|aroused|daily)_(sfw|nsfw)_(\d{4})\.png$/;
// 6-token 변형 — bas section: char0004_bas_naked_aroused_nsfw_0091.png
//   bas 는 "기본 컷" 의 의미라 outfit 슬롯이 scene 으로, emotion 슬롯이 expression
//   으로 쓰인다.
const BAS_RE =
  /^char\d{2,4}_bas_(home|daily|work|gym|sleep|nude|underwear|naked|shirt|hoem)_(neutral|happy|angry|sad|embarrassed|aroused|daily)_(sfw|nsfw)_(\d{4})\.png$/;
// 6-token sex section: char0004_sex_naked_classroom_nsfw_0137.png
//   sex_<outfit>_<location>. sceneTag="sex_<outfit>" 로 prefix 매칭.
const SEX_NEW_RE =
  /^char\d{2,4}_sex_(home|daily|work|naked|nude|underwear|shirt)_([a-z][a-z0-9]*)_(sfw|nsfw)_(\d{4})\.png$/;
// 레거시 sex_bg (Mira/seo-ah-jin 시드용): char0003_sex_bg_nsfw_0150.png
const SEX_BG_RE = /^char\d{2,4}_sex_bg_(sfw|nsfw)_(\d{4})\.png$/;
// 배경: char0003_bg_bedroom1_0014.png
const BG_RE = /^char\d{2,4}_bg_([a-z0-9_-]+?)_(\d{4})\.png$/;

type Classified =
  | {
      kind: "gallery";
      scene: Scene;
      expression: Expression;
      ordinal: number;
      sceneTag: string;
      clothingTag: string;
      nsfwLevel: number;
      exprStr: string;
      moodFit: string[];
      locationFit: string[];
      triggerTags: string[];
      description: string;
    }
  | {
      kind: "background";
      location: string;
      ordinal: number;
    }
  | null;

function classify(filename: string): Classified {
  // 1) 5-token: char####_<scene>_<expr>_<sfw>_####
  const fg = FG_RE.exec(filename);
  if (fg) {
    const scene = fg[1] as Scene;
    const expression = fg[2] as Expression;
    const nsfw = fg[3];
    const ordinal = parseInt(fg[4], 10);
    const s = SCENE_MAP[scene];
    const e = EXPR_MAP[expression];
    const levelFromScene = s.baseNsfw;
    const levelFromTag =
      nsfw === "nsfw" ? Math.max(2, levelFromScene) : levelFromScene;
    const level = Math.min(NSFW_CAP, levelFromTag);
    return {
      kind: "gallery",
      scene,
      expression,
      ordinal,
      sceneTag: s.sceneTag,
      clothingTag: s.clothingTag,
      nsfwLevel: level,
      exprStr: e.expression,
      moodFit: e.moodFit,
      locationFit: s.locationFit,
      triggerTags: [scene, expression],
      description: `${scene} · ${expression}`,
    };
  }
  // 2) 6-token bas: char####_bas_<outfit>_<emotion>_<sfw>_####
  const bas = BAS_RE.exec(filename);
  if (bas) {
    let outfit = bas[1];
    if (outfit === "hoem") outfit = "home"; // 소스 측 오타 흡수
    const expression = bas[2] as Expression;
    const nsfw = bas[3];
    const ordinal = parseInt(bas[4], 10);
    const s = SCENE_MAP[outfit as Scene];
    const e = EXPR_MAP[expression];
    const levelFromScene = s.baseNsfw;
    const levelFromTag =
      nsfw === "nsfw" ? Math.max(2, levelFromScene) : levelFromScene;
    const level = Math.min(NSFW_CAP, levelFromTag);
    return {
      kind: "gallery",
      scene: outfit as Scene,
      expression,
      ordinal,
      sceneTag: s.sceneTag,
      clothingTag: s.clothingTag,
      nsfwLevel: level,
      exprStr: e.expression,
      moodFit: e.moodFit,
      locationFit: s.locationFit,
      triggerTags: ["bas", outfit, expression],
      description: `bas · ${outfit} · ${expression}`,
    };
  }
  // 3) 6-token sex: char####_sex_<outfit>_<location>_<sfw>_####
  const sxn = SEX_NEW_RE.exec(filename);
  if (sxn) {
    const outfit = sxn[1];
    const location = sxn[2];
    const ordinal = parseInt(sxn[4], 10);
    const sx = sexSceneFor(outfit);
    const level = Math.min(NSFW_CAP, sx.baseNsfw) as 0 | 1 | 2 | 3;
    return {
      kind: "gallery",
      scene: outfit as Scene,
      expression: "aroused",
      ordinal,
      sceneTag: sx.sceneTag,
      clothingTag: sx.clothingTag,
      nsfwLevel: level,
      exprStr: "seductive",
      moodFit: ["horny", "teasing", "aroused"],
      locationFit: [location, "bedroom", "home"],
      triggerTags: ["sex", outfit, location],
      description: `sex · ${outfit} · ${location}`,
    };
  }
  // 4) 레거시 sex_bg
  const sx = SEX_BG_RE.exec(filename);
  if (sx) {
    const ordinal = parseInt(sx[2], 10);
    const s = SCENE_MAP.sex_bg;
    const level = Math.min(NSFW_CAP, 3) as 0 | 1 | 2 | 3;
    return {
      kind: "gallery",
      scene: "sex_bg",
      expression: "aroused",
      ordinal,
      sceneTag: s.sceneTag,
      clothingTag: s.clothingTag,
      nsfwLevel: level,
      exprStr: "seductive",
      moodFit: ["horny", "teasing"],
      locationFit: s.locationFit,
      triggerTags: ["sex_bg"],
      description: "sex_bg",
    };
  }
  // 5) 배경
  const bg = BG_RE.exec(filename);
  if (bg) {
    return {
      kind: "background",
      location: bg[1],
      ordinal: parseInt(bg[2], 10),
    };
  }
  return null;
}

// ── 이미지 변환 ─────────────────────────────────────────────────────
async function processImage(
  bytes: Buffer,
  isPortrait: boolean,
): Promise<{ body: Buffer; width: number; height: number }> {
  if (isPortrait) {
    const out = await sharp(bytes)
      .resize(768, 1024, { fit: "cover", position: "attention" })
      .webp({ quality: 88 })
      .toBuffer();
    return { body: out, width: 768, height: 1024 };
  }
  const meta = await sharp(bytes).metadata();
  const srcW = meta.width ?? 1024;
  const srcH = meta.height ?? 1024;
  const MAX = 1280;
  if (srcW <= MAX) {
    const out = await sharp(bytes).webp({ quality: 85 }).toBuffer();
    return { body: out, width: srcW, height: srcH };
  }
  const scale = MAX / srcW;
  const w = MAX;
  const h = Math.round(srcH * scale);
  const out = await sharp(bytes).resize(w, h).webp({ quality: 85 }).toBuffer();
  return { body: out, width: w, height: h };
}

// ── Blob 업로드(docs/11-assets.md §4) ─────────────────────────────────
async function uploadBlob(
  relPath: string,
  body: Buffer,
  token: string,
): Promise<string> {
  const res = await put(relPath, body, {
    access: "public",
    contentType: "image/webp",
    addRandomSuffix: false,
    allowOverwrite: true,
    token,
  });
  return res.url;
}

// ── 메인 ────────────────────────────────────────────────────────────
async function main() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || /placeholder/i.test(token)) {
    console.error("BLOB_READ_WRITE_TOKEN 이 .env.prod 에서 로드되지 않음");
    process.exit(1);
  }

  const character = await prisma.character.findUnique({
    where: { slug: SLUG! },
    select: { id: true, name: true },
  });
  if (!character) {
    console.error(`character not found: slug=${SLUG}`);
    process.exit(1);
  }
  console.log(
    `Target: ${character.name} (/${SLUG}, id=${character.id})  cap=nsfwLevel≤${NSFW_CAP}`,
  );

  // 파일 목록 수집
  const files = readdirSync(SRC_DIR)
    .filter((f) => f.toLowerCase().endsWith(".png"))
    .sort();
  if (!files.includes(PORTRAIT!)) {
    console.error(`portrait 파일이 소스 디렉토리에 없음: ${PORTRAIT}`);
    process.exit(1);
  }

  // 분류
  const plan: Array<{ file: string; tag: Classified }> = [];
  let unclassified = 0;
  for (const f of files) {
    const tag = classify(f);
    if (!tag) {
      unclassified++;
      console.warn(`  [SKIP] 파일명 패턴 불일치: ${f}`);
      continue;
    }
    plan.push({ file: f, tag });
  }
  console.log(
    `Files: ${files.length} (classified=${plan.length}, skipped=${unclassified})`,
  );

  // 기존 Asset wipe
  const before = await prisma.asset.count({ where: { characterId: character.id } });
  if (before > 0) {
    await prisma.character.update({
      where: { id: character.id },
      data: { portraitAssetId: null, heroAssetId: null },
    });
    await prisma.asset.deleteMany({ where: { characterId: character.id } });
    console.log(`Wiped ${before} existing assets.`);
  }

  // 업로드 + Asset create
  let portraitAssetId: string | null = null;
  let idx = 0;
  const total = plan.length;
  for (const { file, tag } of plan) {
    idx++;
    const bytes = readFileSync(join(SRC_DIR, file));
    const isPortrait = file === PORTRAIT;
    const { body, width, height } = await processImage(bytes, isPortrait);

    // Blob key 정책 통일 — docs/11-assets.md §4 참조.
    //   characters/<slug>/portrait.webp                      (대표, 고정 키)
    //   characters/<slug>/gallery/<assetId>.webp             (갤러리, ULID)
    //   characters/<slug>/background/<assetId>.webp          (배경, ULID, 단수형)
    // ULID 키는 SFW/NSFW/장면을 URL 에 노출하지 않으며, DB 와 1:1 매핑되므로
    // orphan 청소가 단순하다.
    const assetId = ulid();
    let relPath: string;
    if (isPortrait) {
      relPath = `characters/${SLUG}/portrait.webp`;
    } else if (tag!.kind === "background") {
      relPath = `characters/${SLUG}/background/${assetId}.webp`;
    } else {
      relPath = `characters/${SLUG}/gallery/${assetId}.webp`;
    }

    const url = await uploadBlob(relPath, body, token);
    const kind = isPortrait
      ? "portrait"
      : tag!.kind === "background"
        ? "background"
        : "gallery";

    if (tag!.kind === "gallery" || isPortrait) {
      // 파일이 portrait 인 경우라도 원래 파일명의 tag (gallery 계열) 을 유지해
      // sceneTag / expression 을 채운다. portrait 로 쓰이지만 매칭에도 쓰일 수 있다.
      const gt = tag!.kind === "gallery"
        ? tag!
        : (classify(file) as Extract<Classified, { kind: "gallery" }>);
      await prisma.asset.create({
        data: {
          id: assetId,
          characterId: character.id,
          kind,
          blobUrl: url,
          mimeType: "image/webp",
          width,
          height,
          order: isPortrait ? 0 : gt.ordinal,
          sceneTag: gt.sceneTag,
          expression: gt.exprStr,
          clothingTag: gt.clothingTag,
          moodFit: gt.moodFit,
          locationFit: gt.locationFit,
          nsfwLevel: gt.nsfwLevel,
          description: gt.description,
          triggerTags: gt.triggerTags,
        },
      });
    } else {
      // background — scene/expression 없음
      await prisma.asset.create({
        data: {
          id: assetId,
          characterId: character.id,
          kind,
          blobUrl: url,
          mimeType: "image/webp",
          width,
          height,
          order: tag!.ordinal,
          locationFit: [tag!.location],
          nsfwLevel: 0,
          description: `background · ${tag!.location}`,
          triggerTags: ["bg", tag!.location],
          moodFit: [],
        },
      });
    }

    if (isPortrait) portraitAssetId = assetId;
    const pct = Math.floor((idx / total) * 100);
    console.log(
      `  [${String(idx).padStart(3)}/${total}] ${pct.toString().padStart(3)}% ${
        isPortrait ? "★" : " "
      } ${relPath}  (${width}×${height})`,
    );
  }

  if (portraitAssetId) {
    await prisma.character.update({
      where: { id: character.id },
      data: { portraitAssetId, heroAssetId: portraitAssetId },
    });
    console.log(`\nportraitAssetId=${portraitAssetId}`);
  } else {
    console.warn(`\n[WARN] portrait file not found among classified plans`);
  }

  const finalCount = await prisma.asset.count({
    where: { characterId: character.id },
  });
  console.log(`\nDone. ${finalCount} assets attached to /${SLUG}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
