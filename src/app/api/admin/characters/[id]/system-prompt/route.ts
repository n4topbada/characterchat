// 관리자용 System Instruction 프리뷰.
// GET  /api/admin/characters/:id/system-prompt?query=...
//   - 주어진 캐릭터의 PersonaCore + 기본 상태 + (옵션) RAG 청크로 실제 Gemini 에 주입되는
//     systemInstruction 텍스트를 합성해 반환한다.
//   - query 가 비어 있으면 RAG 검색은 생략하고 Core/State/형식 블록만 보여준다.
//   - 이 엔드포인트는 "그냥 렌더"일 뿐 DB 를 수정하지 않는다.
//
// 시스템 프롬프트는 자유서술 저장값이 아니라 PersonaCore + 상태 + 청크에서 매 요청마다
// 재합성되는 구조다. 따라서 편집 포인트는 /api/admin/characters/:id/persona (PATCH) 와
// 지식 편집기이며, 이 프리뷰는 "composer 결과가 어떻게 찍히는지" 확인하는 용도다.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, errorJson } from "@/lib/api-utils";
import { buildSystemInstruction } from "@/lib/gemini/prompt";
import { retrieveForPrompt } from "@/lib/rag/retrieve";

export const runtime = "nodejs";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const character = await prisma.character.findUnique({
    where: { id },
    include: { config: true, personaCore: true },
  });
  if (!character) return errorJson("not_found", 404);
  if (!character.personaCore) return errorJson("persona_missing", 400);

  const url = new URL(req.url);
  const query = (url.searchParams.get("query") ?? "").trim();

  const core = character.personaCore;

  // RAG 는 query 가 있을 때만 실행. 없으면 빈 배열.
  const retrieved = query
    ? await retrieveForPrompt({
        query,
        characterId: id,
        userId: gate.userId,
      }).catch((e) => {
        console.warn("[admin system-prompt] retrieve failed", e);
        return {
          knowledge: [],
          styleAnchors: [],
          episodes: [],
          relationSummary: null as null,
        };
      })
    : {
        knowledge: [] as never[],
        styleAnchors: [] as never[],
        episodes: [] as never[],
        relationSummary: null as null,
      };

  const systemInstruction = buildSystemInstruction({
    core: {
      displayName: core.displayName,
      aliases: core.aliases,
      pronouns: core.pronouns,
      ageText: core.ageText,
      gender: core.gender,
      species: core.species,
      role: core.role,
      backstorySummary: core.backstorySummary,
      worldContext: core.worldContext,
      coreBeliefs: core.coreBeliefs,
      coreMotivations: core.coreMotivations,
      fears: core.fears,
      redLines: core.redLines,
      speechRegister: core.speechRegister,
      speechEndings: core.speechEndings,
      speechRhythm: core.speechRhythm,
      speechQuirks: core.speechQuirks,
      languageNotes: core.languageNotes,
      appearanceKeys: core.appearanceKeys,
      defaultAffection: core.defaultAffection,
      defaultTrust: core.defaultTrust,
      defaultStage: core.defaultStage,
      defaultMood: core.defaultMood,
      defaultEnergy: core.defaultEnergy,
      defaultStress: core.defaultStress,
      defaultStability: core.defaultStability,
      behaviorPatterns: (core.behaviorPatterns ?? null) as never,
    },
    state: null, // 프리뷰에서는 유저별 상태를 합치지 않음 — 디폴트로 찍힌다
    chunks: {
      knowledge: retrieved.knowledge,
      styleAnchors: retrieved.styleAnchors,
      episodes: retrieved.episodes,
      relationSummary: retrieved.relationSummary,
    },
    statusPanelSchema: character.config?.statusPanelSchema ?? null,
    sessionSummary: null,
    hasImageAssets: false,
  });

  return NextResponse.json({
    systemInstruction,
    meta: {
      model: character.config?.model ?? null,
      temperature: character.config?.temperature ?? null,
      maxOutputTokens: character.config?.maxOutputTokens ?? null,
      characterName: character.name,
      characterSlug: character.slug,
      query,
      chunkCounts: {
        knowledge: retrieved.knowledge.length,
        styleAnchors: retrieved.styleAnchors.length,
        episodes: retrieved.episodes.length,
        relationSummary: retrieved.relationSummary ? 1 : 0,
      },
    },
  });
}
