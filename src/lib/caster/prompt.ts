// Caster — 캐릭터 디자인 에이전트의 시스템 프롬프트와 패치 유틸.
//
// Caster 는 관리자와 대화하며 캐릭터 시트를 "점진적으로" 채운다.
// - 매 턴 본문(대사) + <patch>...</patch> 블록을 함께 출력한다.
// - <patch> 는 이번 턴에 새로 확정된 필드만 담는다(부분 업데이트).
// - 배열 필드는 새 전체 집합으로 덮어쓴다 (append 가 아니라 set).
// - Google Search 그라운딩으로 실제 인물/작품/역사 사실을 참조하며,
//   UI 는 그 출처를 시각화한다.
//
// PersonaCore 의 수치값(defaultAffection/Trust/Stage/Mood/Energy/Stress/Stability,
// behaviorPatterns)은 Caster 가 대화로 정하지 않는다. 커밋 시 기본값이 들어가고
// /admin/characters/[id] 편집기에서 조정한다.

export const CASTER_SYSTEM = `당신은 Caster — CharacterChat 의 캐릭터 디자인 에이전트다.
1:1 AI 캐릭터 챗봇에 넣을 새 캐릭터를, 관리자와의 대화로 한 항목씩 확정해 나간다.

[역할]
- 침착하고 명료한 크리에이티브 디렉터. 취향을 강요하지 않고 선택지를 제시한다.
- 스무고개처럼 짧은 질문으로 정보를 좁혀간다.
- 추측으로 시트를 채우지 않는다. 모르는 값은 비워 둔다.

[대화 흐름 — 대체로 이 순서]
1) 개념  한 줄 컨셉, 장르/톤, 참고 작품/인물
2) 정체성  이름/별칭/대명사, 성별·종·나이·직업(역할)
3) 세계관  배경 세계, 시대, 사회적 위치, 가족/관계의 밑그림
4) 가치관  핵심 신념(coreBeliefs), 동기(coreMotivations), 두려움(fears), 레드라인(redLines)
5) 말투    존비(speechRegister), 종결어미(speechEndings), 리듬(speechRhythm), 말버릇(speechQuirks), 언어 규칙(languageNotes)
6) 외형    머리/눈/체형/복장/소품 등 appearanceKeys
7) 마감    인사말(greeting), 한 줄 태그라인(tagline), 슬러그(slug), 액센트 컬러(accentColor)

규칙:
- **매 턴 반드시 본문(대화문)을 한 문장 이상 내놓는다.** <choices> 나 <patch> 블록만 내놓는 응답은 절대 금지. 관리자가 버튼으로 선택했더라도 "트윈테일 좋네. 그럼 눈빛/표정 분위기는 어떤 느낌이야?" 처럼 확인 + 다음 질문을 본문에 담는다.
- 한 번에 하나의 주제만 묻는다. 질문은 2~3문장 이내로 짧게.
- 답이 모호하면 2~3 개 구체적 예시를 제시해 선택지를 좁혀 준다.
- 이미 <patch> 로 넣은 값은 다시 묻지 않는다.
- 관리자가 "처음부터" 또는 "다시" 라고 하면 흐름을 재시작한다.

[검색/그라운딩]
- 실존 인물·작품·역사·지역·기관을 참조할 때는 Google 검색 그라운딩을 활용한다.
- 특히 **외형·복장·소품·분위기** 같은 시각 요소를 확정할 때는 검색을 적극 활용해  관리자가 실제 이미지 썸네일로 "이 느낌 맞아?"를 바로 확인할 수 있게 한다.
- 검색한 소스의 대표 이미지가 UI 에 썸네일 그리드로 자동 표시된다. 이미지를 제시한 턴에는 본문에 "이런 느낌이 맞아요? 아니면 다른 방향?" 같은 **피드백 질문 한 줄**을 꼭 붙인다.
- 창작 세계관·오리지널 캐릭터는 검색 없이 관리자의 설명에만 의존한다.
- 검색한 사실은 본문에 자연어로 반영한다. 출처 링크와 이미지는 UI 가 자동 표시하니 [1], [2] 같은 인라인 인용 표기를 하지 않는다.

[이미지 레퍼런스 확정 턴]
관리자가 썸네일 중 하나를 "이 느낌" 이라고 확정하면, 다음 턴에 이미지 바이트가 첨부되고 메시지 말미에 [첨부 레퍼런스 메타] 블록(제목/도메인/원본 URL)이 따라온다.
이때 할 일:
1) 이미지의 **시각 요소**를 꼼꼼히 관찰해 구체적 키워드로 분해한다
    인물의 경우: 나이대, 성별/인상, 머리(색·길이·스타일), 눈빛, 표정, 체형, 복장(상의/하의/아우터/신발), 장신구/소품, 배경, 조명/색감, 분위기
    오브젝트: 종류, 재질, 색, 사용 맥락
    배경/풍경: 장소, 시대감, 날씨/시간대, 건축 양식
2) 메타데이터(제목, 도메인, 원본 URL)를 함께 고려한다. 실존 인물·작품이면 worldContext / role / species / ageText 등 해당 필드에 반영하되 **확실한 경우에만**. 인물 이름을 단정 지어 name 에 넣지 말 것 (명백한 팬덤 2차창작이 아니면).
3) <patch> 에 주로 **persona.appearanceKeys** 를 (있던 값과 병합해) 구체화한다. 필요하면 worldContext, speechRegister(복장·분위기로 유추 가능한 톤), accentColor 도 함께 업데이트.
4) 본문에는 "이미지를 보고 이렇게 반영했어요: " 짧은 요약 + "이 방향이 맞으면 다음은 [X] 이야기를 해볼까요?" 한 줄로 다음 주제로 이어간다.
추측 금지: 시각적으로 확실한 것만 적는다. 불확실하면 비워 두고 관리자에게 확인.

[선택지 제안 — 선택적]
질문이 구체적이고 2~4개의 짧은 보기로 답할 수 있을 때는 본문 말미 + <patch> 앞에 <choices> 블록을 덧붙인다. 관리자가 버튼을 눌러 바로 답할 수 있게 한다.

<choices>["보기1 짧게", "보기2", "보기3"]</choices>

- 보기는 40자 이내. JSON 문자열 배열 한 줄.
- 답이 자유 서술(배경 요약·인사말·상세 묘사 등)로 가야 할 때는 붙이지 않는다.
- 보기를 내놓더라도 본문의 질문 한 줄은 유지한다 (관리자가 직접 타이핑할 수도 있으니).
- 사용자가 버튼을 누르면 그 문자열이 그대로 다음 턴의 입력이 된다 — 그 전제에서 자연스럽게 이어가라.
- 첫 인사 메시지는 UI 가 자동으로 보여준다. 관리자의 첫 입력을 받고 나서 거기부터 이어가라.

[매 턴 필수 — 패치 블록]
대화로 새로 확정된 값이 있으면 응답 말미에 다음 블록을 반드시 붙인다:

<patch>
{
  "slug": "영소문자-숫자-대시",
  "name": "표시명",
  "tagline": "한 줄 소개",
  "accentColor": "#RRGGBB",
  "greeting": "세션 첫 대사(1~3문장)",
  "persona": {
    "displayName": "...",
    "aliases": ["..."],
    "pronouns": "...",
    "ageText": "...",
    "gender": "...",
    "species": "...",
    "role": "...",
    "backstorySummary": "2~4문장",
    "worldContext": "...",
    "coreBeliefs": ["..."],
    "coreMotivations": ["..."],
    "fears": ["..."],
    "redLines": ["..."],
    "speechRegister": "반말|존댓말|혼용|...",
    "speechEndings": ["~야", "~거든"],
    "speechRhythm": "...",
    "speechQuirks": ["...", "..."],
    "languageNotes": "...",
    "appearanceKeys": ["...", "..."]
  }
}
</patch>

패치 규칙:
- 이번 턴에 **새로 확정된** 키만 담는다. 변경 없는 키는 생략한다.
- 배열은 새 전체 집합으로 덮어쓴다. "기존 + 한 개 추가" 하려면 이전 값도 모두 포함해서 보낸다.
- 삭제는 "" (문자열) 또는 [] (배열) 로 표기한다.
- 변경이 전혀 없는 턴에는 <patch> 블록 자체를 생략한다.
- <patch> 는 UI 가 자동 처리한다. 본문에서 "패치를 업데이트했어요" 같은 메타 언급은 하지 않는다.

[금지]
- 이모지, 절대 금지.
- 확인되지 않은 사실을 추측으로 <patch> 에 넣지 않는다.
- <patch> 외부 본문에 JSON 또는 코드 블록을 섞지 않는다.
- 수치 상태값(defaultAffection/Trust/Stage/Mood/Energy/Stress/Stability, behaviorPatterns)은 <patch> 에 넣지 않는다  커밋 이후 별도 편집기에서 설정한다.
`;

// ---------- 점진적 드래프트 타입 ----------

/**
 * Caster 가 관리하는 누적 드래프트. 모든 필드가 partial/nullable.
 * 커밋 시점에 Zod 로 필수값 검증한다.
 */
export type CasterPersonaPartial = Partial<{
  displayName: string;
  aliases: string[];
  pronouns: string | null;
  ageText: string | null;
  gender: string | null;
  species: string | null;
  role: string | null;
  backstorySummary: string;
  worldContext: string | null;
  coreBeliefs: string[];
  coreMotivations: string[];
  fears: string[];
  redLines: string[];
  speechRegister: string | null;
  speechEndings: string[];
  speechRhythm: string | null;
  speechQuirks: string[];
  languageNotes: string | null;
  appearanceKeys: string[];
}>;

export type CasterPatch = Partial<{
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  greeting: string;
  persona: CasterPersonaPartial;
}>;

export type CasterDraft = {
  slug: string | null;
  name: string | null;
  tagline: string | null;
  accentColor: string | null;
  greeting: string | null;
  persona: CasterPersonaPartial;
};

export function emptyDraft(): CasterDraft {
  return {
    slug: null,
    name: null,
    tagline: null,
    accentColor: null,
    greeting: null,
    persona: {},
  };
}

/**
 * 모델 응답에서 <patch>...</patch> 블록을 추출한다.
 * - 블록이 없으면 { body: text, patch: null }
 * - 블록이 있으면 body 는 블록을 제거한 나머지 (공백 정리), patch 는 파싱 결과
 * - JSON 이 깨져 있으면 patch: null, body 에는 원문 그대로 남긴다
 */
export function extractPatch(text: string): {
  body: string;
  patch: CasterPatch | null;
} {
  const m = text.match(/<patch>([\s\S]*?)<\/patch>/i);
  if (!m || m.index === undefined) return { body: text, patch: null };
  const raw = m[1].trim();
  let parsed: CasterPatch | null = null;
  try {
    parsed = JSON.parse(raw) as CasterPatch;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    // JSON 깨짐 — body 는 원문 유지 (디버깅 용이)
    return { body: text, patch: null };
  }
  const body = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { body, patch: parsed };
}

/**
 * 모델 응답에서 <choices>[...]</choices> 블록을 추출한다.
 * 내용은 JSON 문자열 배열이어야 한다.
 * - 블록이 없거나 파싱 실패 → { body: text, choices: [] }
 * - 성공 시 body 는 블록을 제거한 나머지.
 */
export function extractChoices(text: string): {
  body: string;
  choices: string[];
} {
  const m = text.match(/<choices>([\s\S]*?)<\/choices>/i);
  if (!m || m.index === undefined) return { body: text, choices: [] };
  const raw = m[1].trim();
  let arr: string[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      arr = parsed.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    }
  } catch {
    arr = [];
  }
  const body = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).trim();
  return { body, choices: arr };
}

/**
 * 스트리밍 중 라이브 표시용 클린업.
 * - 첫 <patch> / <choices> 태그부터 끝까지 잘라낸다 (아직 안 닫혔어도 숨김).
 * - 태그가 없으면 원문 그대로.
 * 주: 최종 저장용 클린은 extractPatch + extractChoices 로 별도 수행.
 */
export function stripPartialMarkup(text: string): string {
  let end = text.length;
  const m1 = text.search(/<patch\b/i);
  if (m1 >= 0 && m1 < end) end = m1;
  const m2 = text.search(/<choices\b/i);
  if (m2 >= 0 && m2 < end) end = m2;
  return text.slice(0, end).replace(/\s+$/, "");
}

const PERSONA_KEYS: (keyof CasterPersonaPartial)[] = [
  "displayName",
  "aliases",
  "pronouns",
  "ageText",
  "gender",
  "species",
  "role",
  "backstorySummary",
  "worldContext",
  "coreBeliefs",
  "coreMotivations",
  "fears",
  "redLines",
  "speechRegister",
  "speechEndings",
  "speechRhythm",
  "speechQuirks",
  "languageNotes",
  "appearanceKeys",
];

/**
 * base 에 patch 를 덮어씌운 새 드래프트를 반환. 배열은 "전체 집합 대체" 시맨틱.
 * 빈 문자열/빈 배열은 "지움" 의미로 적용.
 */
export function mergePatch(base: CasterDraft, patch: CasterPatch): CasterDraft {
  const next: CasterDraft = { ...base, persona: { ...base.persona } };

  if (patch.slug !== undefined) next.slug = patch.slug ? patch.slug : null;
  if (patch.name !== undefined) next.name = patch.name ? patch.name : null;
  if (patch.tagline !== undefined)
    next.tagline = patch.tagline ? patch.tagline : null;
  if (patch.accentColor !== undefined)
    next.accentColor = patch.accentColor ? patch.accentColor : null;
  if (patch.greeting !== undefined)
    next.greeting = patch.greeting ? patch.greeting : null;

  if (patch.persona) {
    for (const k of PERSONA_KEYS) {
      if (!(k in patch.persona)) continue;
      const v = patch.persona[k as keyof CasterPersonaPartial];
      // 배열: 빈 배열이면 삭제(undefined 로 떨어뜨림), 아니면 덮어씀
      if (Array.isArray(v)) {
        if (v.length === 0) {
          delete (next.persona as Record<string, unknown>)[k];
        } else {
          (next.persona as Record<string, unknown>)[k] = v;
        }
      } else if (v === "" || v === null) {
        delete (next.persona as Record<string, unknown>)[k];
      } else if (v !== undefined) {
        (next.persona as Record<string, unknown>)[k] = v;
      }
    }
  }

  return next;
}

/**
 * 현재 드래프트 상태를 사람이 읽는 JSON-ish 텍스트로 직렬화해
 * systemInstruction 말미에 끼워 넣는다. 모델이 이미 채운 키를 건너뛰게 해
 * 중복 질문/중복 패치를 줄인다.
 */
export function renderDraftForPrompt(draft: CasterDraft): string {
  const lines: string[] = [];
  const push = (k: string, v: unknown) => {
    if (v === null || v === undefined) return;
    if (typeof v === "string" && v.trim() === "") return;
    if (Array.isArray(v) && v.length === 0) return;
    lines.push(`- ${k}: ${JSON.stringify(v)}`);
  };
  push("slug", draft.slug);
  push("name", draft.name);
  push("tagline", draft.tagline);
  push("accentColor", draft.accentColor);
  push("greeting", draft.greeting);
  for (const k of PERSONA_KEYS) {
    push(`persona.${k}`, draft.persona[k]);
  }
  if (lines.length === 0) return "(아직 비어 있음  대화를 시작하라)";
  return lines.join("\n");
}

// ---------- Legacy 호환 ----------
// 이전 버전은 ```json``` 코드블록으로 전체 드래프트를 한 번에 출력했다.
// 혹시라도 모델이 그 형태로 응답하면 <patch> 와 같은 의미로 처리한다.
export function extractLegacyDraft(text: string): CasterPatch | null {
  const m =
    text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/);
  const raw = m?.[1] ?? null;
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as CasterPatch;
    if (!obj || typeof obj !== "object") return null;
    return obj;
  } catch {
    return null;
  }
}
