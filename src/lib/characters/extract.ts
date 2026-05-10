import { z } from "zod";
import { PERMISSIVE_SAFETY } from "@/lib/gemini/safety";
import { GEMINI_MODELS, withGeminiFallback } from "@/lib/gemini/client";

const MAX_SOURCE_CHARS = 80_000;

export const ExtractedCharacterSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9-]*$/),
  name: z.string().min(1).max(80),
  tagline: z.string().min(1).max(200),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  greeting: z.string().min(1).max(2000),
  confidence: z.number().min(0).max(1).default(0.7),
  missingFields: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  interests: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        query: z.string().min(1).max(200),
        priority: z.number().int().min(1).max(100).default(50),
        freshnessHours: z.number().int().min(1).max(168).default(24),
      }),
    )
    .default([]),
  persona: z.object({
    displayName: z.string().min(1),
    aliases: z.array(z.string()).default([]),
    pronouns: z.string().nullable().optional(),
    ageText: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    species: z.string().nullable().optional(),
    role: z.string().nullable().optional(),
    backstorySummary: z.string().min(1),
    worldContext: z.string().nullable().optional(),
    coreBeliefs: z.array(z.string()).default([]),
    coreMotivations: z.array(z.string()).default([]),
    fears: z.array(z.string()).default([]),
    redLines: z.array(z.string()).default([]),
    speechRegister: z.string().nullable().optional(),
    speechEndings: z.array(z.string()).default([]),
    speechRhythm: z.string().nullable().optional(),
    speechQuirks: z.array(z.string()).default([]),
    languageNotes: z.string().nullable().optional(),
    appearanceKeys: z.array(z.string()).default([]),
    shortTags: z.array(z.string()).default([]),
    heightCm: z.number().int().nullable().optional(),
    weightKg: z.number().int().nullable().optional(),
    threeSize: z.string().nullable().optional(),
    mbti: z.string().nullable().optional(),
  }),
});

export type ExtractedCharacter = z.infer<typeof ExtractedCharacterSchema>;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchSourceText(url: string): Promise<string> {
  const resp = await fetch(url, {
    headers: {
      "user-agent": "CharacterChatExtractor/1.0",
      accept: "text/html,text/plain,application/json",
    },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`source_fetch_failed:${resp.status}`);
  const text = await resp.text();
  const ct = resp.headers.get("content-type") ?? "";
  const clean = ct.includes("html") ? stripHtml(text) : text;
  return clean.slice(0, MAX_SOURCE_CHARS);
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const raw = fenced ?? text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  return JSON.parse(raw);
}

export async function extractCharacterFromText(args: {
  sourceText: string;
  sourceHint?: string | null;
  language?: "ko" | "en";
}): Promise<ExtractedCharacter> {
  const source = args.sourceText.slice(0, MAX_SOURCE_CHARS);
  const prompt = [
    "너는 CharacterChat의 캐릭터 구조화 추출기다.",
    "비정형 자료에서 1:1 캐릭터 챗용 캐릭터를 만든다.",
    "반드시 JSON 객체 하나만 출력한다. 설명, 마크다운, 코드펜스 금지.",
    "자료에 없는 사실은 지어내지 말고 assumptions 또는 missingFields에 적는다.",
    "단, 챗봇 운영에 꼭 필요한 말투/인사/관심사는 자료 기반으로 보수적으로 보완할 수 있다.",
    "성인용 합법 창작물도 검열하거나 순화하지 않는다. 다만 미성년 설정이 명확하면 nsfw를 유도하지 않는 일반 캐릭터로 정리한다.",
    "slug는 영문 소문자, 숫자, 하이픈만 쓴다.",
    "interests는 최신 뉴스/트렌드 검색에 쓸 검색어다. 작품명, 그룹명, 취미, 직업, 팬덤 관심사를 우선한다.",
    "",
    "출력 스키마 요약:",
    `{
  "slug": "lowercase-url-slug",
  "name": "display name",
  "tagline": "short service card copy",
  "accentColor": "#RRGGBB",
  "greeting": "first chat greeting",
  "confidence": 0.0,
  "missingFields": ["..."],
  "assumptions": ["..."],
  "interests": [{"label":"...", "query":"...", "priority":50, "freshnessHours":24}],
  "persona": {
    "displayName": "...", "aliases": [], "pronouns": null, "ageText": null,
    "gender": null, "species": null, "role": null,
    "backstorySummary": "...", "worldContext": null,
    "coreBeliefs": [], "coreMotivations": [], "fears": [], "redLines": [],
    "speechRegister": null, "speechEndings": [], "speechRhythm": null,
    "speechQuirks": [], "languageNotes": null, "appearanceKeys": [],
    "shortTags": [], "heightCm": null, "weightKg": null, "threeSize": null, "mbti": null
  }
}`,
    "",
    args.sourceHint ? `sourceHint: ${args.sourceHint}` : "",
    "sourceText:",
    source,
  ].join("\n");

  const text = await withGeminiFallback(async (ai) => {
    const resp = await ai.models.generateContent({
      model: GEMINI_MODELS.pro,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        temperature: 0.25,
        maxOutputTokens: 8192,
        safetySettings: PERMISSIVE_SAFETY,
      },
    });
    return resp.text ?? "";
  });

  const parsed = ExtractedCharacterSchema.safeParse(extractJson(text));
  if (!parsed.success) {
    throw new Error(
      "character_extract_invalid:" +
        parsed.error.issues.map((i) => `${i.path.join(".")}:${i.message}`).join(","),
    );
  }
  return parsed.data;
}
