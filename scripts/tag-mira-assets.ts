// 82장 이미지를 Gemini Vision 으로 자동 태깅.
// 결과는 asset/char01-20260418T144742Z-3-001/mira-catalog.json 으로 저장.
// 재실행 가능(이미 태깅된 파일은 건너뜀).

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { withGeminiFallback, MODELS } from "../src/lib/gemini/client";

const SRC_DIR = join(
  process.cwd(),
  "asset",
  "char01-20260418T144742Z-3-001",
  "char01",
);
const OUT = join(
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

function sceneFromFilename(fn: string): string {
  // char01_<scene><NNN>.png → <scene>
  const m = fn.match(/^char01_([a-z_]+?)\d{3}\.png$/);
  if (!m) return "gallery";
  // "sex_b" / "sex_bg" / "sex_nobg" / "casual" / "home" / "naked" / ...
  return m[1].replace(/_+$/, "");
}

const PROMPT = `You are an image analyst. Analyze this character reference image and return ONLY a JSON object. No markdown, no prose.

The character's name is Mira (20 year old adult woman, fictional, 18+).

Scene hint from filename: "{{SCENE}}"

Return JSON with these exact keys:
{
  "expression": one of ["neutral","smile","shy","teasing","seductive","sleeping","crying","moaning","blissful","surprised","pouting","laughing"],
  "composition": one of ["full_body","waist_up","bust","face_close","pov","wide","over_shoulder"],
  "pose": one of ["standing","sitting","lying","crouching","kneeling","leaning","walking"],
  "clothingTag": one of ["dressed","underwear","naked","towel","partial","swimwear"],
  "moodFit": array of 2-4 moods from ["happy","shy","teasing","sleepy","horny","neutral","calm","playful","sad","upset","embarrassed","loving"],
  "locationFit": array of 1-3 locations from ["outside","home","bedroom","bathroom","kitchen","cafe","street","classroom","park"],
  "nsfwLevel": integer 0-3 (0 safe, 1 suggestive, 2 partial nudity, 3 explicit sexual),
  "description": Korean sentence under 60 characters describing the image,
  "triggerTags": array of 2-5 extra English keywords (e.g. ["rain","morning","post_shower","embarrassed"])
}

Output the JSON object only.`;

type Pending = { file: string; scene: string; bytes: Uint8Array };

async function tagOne(p: Pending): Promise<Tags | null> {
  const prompt = PROMPT.replace("{{SCENE}}", p.scene);
  const base64 = Buffer.from(p.bytes).toString("base64");
  return withGeminiFallback(async (ai) => {
    const res = await ai.models.generateContent({
      model: MODELS.chat,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/png", data: base64 } },
          ],
        },
      ],
      config: { temperature: 0.3, responseMimeType: "application/json" },
    });
    const text = res.text ?? "";
    if (!text) return null;
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return null;
      obj = JSON.parse(m[0]);
    }
    const tags: Tags = {
      filename: p.file,
      sceneTag: p.scene,
      expression: String(obj.expression ?? "neutral"),
      composition: String(obj.composition ?? "waist_up"),
      pose: String(obj.pose ?? "standing"),
      clothingTag: String(obj.clothingTag ?? "dressed"),
      moodFit: Array.isArray(obj.moodFit)
        ? (obj.moodFit as string[])
        : ["neutral"],
      locationFit: Array.isArray(obj.locationFit)
        ? (obj.locationFit as string[])
        : ["home"],
      nsfwLevel: Math.min(3, Math.max(0, Number(obj.nsfwLevel ?? 0))) as
        | 0
        | 1
        | 2
        | 3,
      description: String(obj.description ?? ""),
      triggerTags: Array.isArray(obj.triggerTags)
        ? (obj.triggerTags as string[])
        : [],
    };
    return tags;
  });
}

async function pLimit<T>(
  items: Pending[],
  n: number,
  fn: (p: Pending) => Promise<T>,
): Promise<(T | null)[]> {
  const results: (T | null)[] = new Array(items.length).fill(null);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = await fn(items[i]);
      } catch (e) {
        console.error(
          `  ! ${items[i].file}: ${String(e).slice(0, 150)}`,
        );
        results[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function main() {
  const files = readdirSync(SRC_DIR)
    .filter((f) => f.endsWith(".png"))
    .sort();
  console.log(`Found ${files.length} files in ${SRC_DIR}`);

  const existing: Tags[] = existsSync(OUT)
    ? JSON.parse(readFileSync(OUT, "utf-8"))
    : [];
  const done = new Set(existing.map((t) => t.filename));
  console.log(`Already tagged: ${done.size}`);

  const pending: Pending[] = files
    .filter((f) => !done.has(f))
    .map((f) => ({
      file: f,
      scene: sceneFromFilename(f),
      bytes: readFileSync(join(SRC_DIR, f)),
    }));
  console.log(`To tag: ${pending.length}`);

  const CONCURRENCY = 4;
  const BATCH_SIZE = 8;
  const result: Tags[] = [...existing];

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    console.log(
      `\nBatch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pending.length / BATCH_SIZE)} (${batch.map((p) => p.file).join(", ")})`,
    );
    const tagged = await pLimit(batch, CONCURRENCY, tagOne);
    for (const t of tagged) {
      if (t) {
        result.push(t);
        console.log(
          `  ✓ ${t.filename}: ${t.expression}/${t.composition}/${t.clothingTag} nsfw=${t.nsfwLevel} [${t.moodFit.join(",")}]`,
        );
      }
    }
    // 체크포인트 저장
    writeFileSync(OUT, JSON.stringify(result, null, 2), "utf-8");
  }

  console.log(`\nDone. Wrote ${result.length} tags to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
