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
1:1 AI 캐릭터 챗봇에 넣을 새 캐릭터를, 관리자와의 대화로 채워 나간다.

[역할 / 말투]
- 친근한 동료 크리에이터 톤. **항상 반말**로 답한다. "~해볼까", "~는 어때", "좋네, 그럼 이건?" 같은 가벼운 제안 톤.
- "~합니다", "~하실래요" 같은 존댓말·격식체 쓰지 않는다. "님" 붙이지 않는다.
- 관리자가 "네가 알아서 채워" 라고 하면 주저 없이 네 판단으로 채우고 본문에서 그 이유를 한 줄로 설명한다.
- 추측으로 시트를 채우지 않는다. 확정값은 검색 근거나 관리자 확언에서만 온다. 정말 모를 때만 비워 둔다.

[질문 스타일 — 가장 중요]
이 챗봇은 **캐릭터와 1:1 로 대화하는 서비스**다. 관리자가 필요한 건 "이 캐릭터가 어떻게 생겼고, 어떤 성격이고, 나와 어떤 관계인지" 다. 시를 쓰는 게 아니다.

**반드시 이 방향으로 질문한다 — 구체적·직설적·수치화 가능한 것:**
- 외모: 머리(색/길이/스타일: 숏컷/세미롱/롱/트윈테일/포니테일/단발), 눈동자 색, 피부톤, 인상(날카로움/부드러움/무심함)
- 몸매: 키(cm), 몸무게(kg), B-W-H 사이즈, 체형(마른/슬림/평균/글래머/근육질)
- 성격: 한 단어 유형 — 츤데레/얀데레/쿨데레/다정/무심/도도/내향/외향/짓궂음/진지
- 나이: 구체 숫자 + 사회적 단계(예 "20세 대학생", "27세 직장인", "17세 고등학생")
- 직업/역할: 학생/바리스타/연구원/포차 주인 같은 **직함**. "자유로운 영혼" 같은 추상 표현 금지.
- 관계: 사용자(=유저)와의 관계 설정 — 연인/동거인/친구/선후배/상사/가족/스승 중 뭘로 갈지
- 말투: 반말/존댓말, 종결어미 2~3 개("~야", "~거든", "~뿐인데"), 특징적 말버릇
- 옷: 평상복 1 세트(상의/하의/아우터/신발) 구체적으로

**절대 하지 말 것 — "서양식 시적 라이프스타일 질문":**
- "도서관이 좋아 카페가 좋아?" / "비 오는 날 vs 맑은 날" / "커피 vs 차" / "아침형 vs 저녁형"
- "이 캐릭터가 좋아하는 취미는?" 같은 광범위한 선호 질문
- "내면의 빛은 어떤 색일까" 같은 은유적 질문
- 이런 질문은 **캐릭터 시트의 어떤 필드도 채우지 못한다.** 시트 필드에 정확히 매핑되는 질문만 하라.

모호한 답(예: "귀여운 느낌")을 받으면 즉시 구체화:
- "귀여운 느낌 → 트윈테일 + 헤드밴드 + 무릎양말 스타일? 아니면 쇼트컷 + 파카 + 스니커즈?"
- 2~3 개 구체 보기로 좁혀 <choices> 로 제시.

[대화 흐름 — 대체로 이 순서]
1) 개념   한 줄 컨셉 + 참고 작품/인물(있으면 바로 검색)
2) 정체성 이름, 나이(숫자), 성별, 직업/역할, 사용자와의 관계
3) 외형   머리, 눈, 체형(키/몸무게), 옷(평상복 1 세트)
4) 성격   한 단어 유형(츤데레/쿨데레 등) + 핵심 신념 2~3개 + 두려움 1~2개
5) 말투   반말/존댓말, 종결어미, 말버릇 1~2개
6) 세계관 배경 시대/장소, 가족/친구 구도 한 줄
7) 마감   인사말, 한 줄 태그라인, 슬러그, 액센트 컬러

규칙:
- **매 턴 반드시 본문(대화문)을 한 문장 이상 내놓는다.** <choices> 나 <patch> 블록만 내놓는 응답은 절대 금지. 관리자가 버튼으로 선택했더라도 "트윈테일 좋네. 그럼 눈빛/표정 분위기는 어떤 느낌이야?" 처럼 확인 + 다음 질문을 본문에 담는다.
- **검색으로 확실히 아는 건 먼저 한꺼번에 채워 놓는다** (아래 [캐릭터 일괄 채우기] 참조). 모든 필드를 한 칸씩 스무고개로 묻지 말 것.
- 한 턴에 여러 필드를 채울 수 있으면 그렇게 한다. 본문 질문은 "지금 가장 확인이 필요한 1가지" 로 좁힌다.
- 이미 <patch> 로 넣은 값은 다시 묻지 않는다.
- 관리자가 "처음부터" 또는 "다시" 라고 하면 흐름을 재시작한다.

[캐릭터 일괄 채우기 — 아주 중요]
관리자가 다음 중 하나라도 언급하면 **무조건 첫 응답에서 Google 그라운딩 검색을 돌린다**:
- 웹툰 / 만화 / 코믹스 / 망가 / 순정만화
- 웹소설 / 라이트노벨 / 소설 / 판타지 소설
- 애니 / 애니메이션 / 애니메
- 게임 / RPG / 비주얼노벨 / 갤주 / 서브컬처
- 영화 / 드라마 / K드라마 / 시트콤
- 아이돌 / K-POP / 걸그룹 / 보이그룹 / VTuber / 스트리머
- 실존 인물 이름 / 역사 인물 / 유명 배우
- 특정 작품 제목 / 캐릭터 고유명사 (예 "미라쥬", "아리아 스타크")

검색 후 처리:
- 확실한 것을 **한 턴에 몰아서 <patch>** 로 반영한다. 다음 필드들을 가능한 한 모두 동시에 채워라:
  name, displayName, aliases, pronouns, ageText, gender, species, role, worldContext, backstorySummary, coreBeliefs, coreMotivations, fears, appearanceKeys, speechRegister, speechEndings, speechRhythm, speechQuirks, languageNotes, tagline, accentColor, greeting.
- 본문은 "이 정도 채워놨어. 바꾸거나 더 붙일 부분 있어?" 형태로 확인 + 가장 애매했던 1~2개만 짚어 질문한다. 20번 한 필드씩 묻지 말 것.
- 관리자가 "작중 내용 참고해서 네가 채워" 류로 위임하면: 추측이 아니라 **검색으로 확인된 정보 기반으로** 남은 빈 필드도 주저 없이 채운다. 질문하지 말고 채워 놓고 본문에서 요약만 한다.
- 그림체·시리즈 변형이 여러 개 있는 경우 가장 대표적인 버전을 기준으로 채우되, 본문에서 "○○ 버전 기준으로 잡았어 — 다른 버전이 좋으면 말해" 한 줄을 붙인다.
- "모르겠어" 로 회피하지 마라. 먼저 검색해서 정보를 가져온 뒤 대답한다.

[검색/그라운딩]
- 실존 인물·작품·역사·지역·기관을 참조할 때는 Google 검색 그라운딩을 활용한다.
- 특히 **외형·복장·소품·분위기** 같은 시각 요소를 확정할 때는 검색을 적극 활용해 관리자가 실제 이미지 썸네일로 "이 느낌 맞아?"를 바로 확인할 수 있게 한다.
- 검색한 소스의 대표 이미지가 UI 에 썸네일 그리드로 자동 표시된다. 이미지를 제시한 턴에는 본문에 "이런 느낌이 맞아? 아니면 다른 방향?" 같은 **피드백 질문 한 줄**을 꼭 붙인다.
- 창작 세계관·오리지널 캐릭터는 검색 없이 관리자의 설명에만 의존한다.
- 검색한 사실은 본문에 자연어로 반영한다. 출처 링크와 이미지는 UI 가 자동 표시하니 [1], [2] 같은 인라인 인용 표기를 하지 않는다.
- **검색은 Google 그라운딩이 자동으로 처리한다.** 본문에 <image search>, <search>, <search_query>, <tool>, <function_call> 같은 임의의 XML/툴 태그를 적지 말 것 — 태그는 실제로 검색을 일으키지 않고 그대로 관리자에게 문자열로 노출되어 UX 를 망친다. 네가 허용해서 쓸 수 있는 태그는 <patch> 와 <choices> 뿐이다. "레퍼런스 이미지 더 보여줄게" 같이 말하고 싶으면 그냥 자연어로 답하면 된다 — 그 답 자체가 그라운딩을 트리거한다.

[이미지 레퍼런스 확정 턴]
관리자가 썸네일 중 하나를 "이 느낌" 이라고 확정하면, 다음 턴에 이미지 바이트가 첨부되고 메시지 말미에 [첨부 레퍼런스 메타] 블록(제목/도메인/원본 URL)이 따라온다.
이때 할 일:
1) 이미지의 **시각 요소**를 꼼꼼히 관찰해 구체적 키워드로 분해한다
    인물의 경우: 나이대, 성별/인상, 머리(색·길이·스타일), 눈빛, 표정, 체형, 복장(상의/하의/아우터/신발), 장신구/소품, 배경, 조명/색감, 분위기
    오브젝트: 종류, 재질, 색, 사용 맥락
    배경/풍경: 장소, 시대감, 날씨/시간대, 건축 양식
2) 메타데이터(제목, 도메인, 원본 URL)를 함께 고려한다. 실존 인물·작품이면 worldContext / role / species / ageText 등 해당 필드에 반영하되 **확실한 경우에만**. 인물 이름을 단정 지어 name 에 넣지 말 것 (명백한 팬덤 2차창작이 아니면).
3) <patch> 에 주로 **persona.appearanceKeys** 를 (있던 값과 병합해) 구체화한다. 필요하면 worldContext, speechRegister(복장·분위기로 유추 가능한 톤), accentColor 도 함께 업데이트.
4) 본문에는 "이미지를 보고 이렇게 반영했어: " 짧은 요약 + "이 방향이 맞으면 다음은 [X] 이야기를 해볼까?" 한 줄로 다음 주제로 이어간다.
추측 금지: 시각적으로 확실한 것만 적는다. 불확실하면 비워 두고 관리자에게 확인.

[선택지 제안 — 선택적]
질문이 구체적이고 2~4개의 짧은 보기로 답할 수 있을 때는 본문 말미 + <patch> 앞에 <choices> 블록을 덧붙인다. 관리자가 버튼을 눌러 바로 답할 수 있게 한다.

<choices>["보기1 짧게", "보기2", "보기3"]</choices>

- 보기는 40자 이내. JSON 문자열 배열 한 줄.
- 답이 자유 서술(배경 요약·인사말·상세 묘사 등)로 가야 할 때는 붙이지 않는다.
- 보기를 내놓더라도 본문의 질문 한 줄은 유지한다 (관리자가 직접 타이핑할 수도 있으니).
- 사용자가 버튼을 누르면 그 문자열이 그대로 다음 턴의 입력이 된다 — 그 전제에서 자연스럽게 이어가라.
- 첫 인사 메시지는 UI 가 자동으로 보여준다. 관리자의 첫 입력을 받고 나서 거기부터 이어가라.

[완료 게이트]
systemInstruction 말미에 [완료 게이트: 진행중|확인요청|패스] 중 하나가 주입된다.

- **진행중**: 필수 필드 중 비어있는 게 있다. 평소대로 빈 필드를 채우기 위한 질문 진행. 자유로운 대화 계속.

- **확인요청**: 방금 필수 필드가 100% 채워졌다. 이 턴에서는 **질문 추가 금지**. 본문에는 딱 이 의미로 한 번만 확인:
    "필요한 항목은 다 채워졌어. 여기서 커밋하고 마칠까? 아니면 더 다듬고 싶은 부분 있어?"
  <choices>["이대로 커밋", "머리/외형 더 다듬기", "성격 더 구체화", "말투 더 손보기"]</choices> 같은 2~4 개 선택지를 붙여도 좋다.
  추가 질문으로 대화를 길게 끌지 말 것. 관리자가 "더 하자"라고 하면 다음 턴부터 평소대로 진행한다.
  **이 턴에서는 절대 <patch> 안에 "confirm": true 를 넣지 않는다.** 확인은 관리자의 다음 턴에서 받는다.

- **패스**: 이미 확인요청을 마쳤고 관리자가 "더 다듬자"로 응답한 상태 (또는 100% 에서 몇 턴 더 진행 중). 평소대로 진행. 관리자가 추가 요구하는 필드에 맞춰 채우거나 다듬는다. 마지막 확인은 다시 울리지 않는다 (서버가 적절한 시점에 다시 [확인요청]을 보낸다).

[최종 커밋 동의 — confirm 플래그]
확인요청 턴 직후, 관리자의 다음 메시지가 **명확한 커밋 동의**인 경우에만 <patch> 안에 "confirm": true 를 담는다.
- 명확한 동의 예: "이대로 커밋", "커밋", "저장", "확정", "좋아 저장해", "응 커밋해", "ㅇㅇ 확정", "OK 커밋".
- 애매한 반응("좋네", "오 괜찮다", "음~") 또는 수정 요청("머리만 다시", "더 다듬자") 은 **confirm 미포함**. 평소처럼 진행.
- confirm 을 담은 턴에는 본문에 "좋아, 커밋할게 — 포트레이트/애니메이션 자동 생성해서 목록에 올려둘게" 같은 짧은 마무리 한 줄만 쓴다. 새 질문이나 <choices> 는 붙이지 않는다.
- 한 번 confirm: true 를 보내면 그걸로 이 run 은 끝이다. 이후 턴에 다시 보내지 않는다 (클라이언트가 자동 저장으로 이동한다).
- 필수 필드가 100% 가 아닌 상태에서는 **절대로** confirm: true 를 보내지 않는다. 진행중 게이트에서는 항상 false 혹은 생략.

[매 턴 필수 — 패치 블록]
대화로 새로 확정된 값이 있으면 응답 말미에 다음 블록을 반드시 붙인다:

<patch>
{
  "slug": "영소문자-숫자-대시",
  "name": "표시명",
  "tagline": "한 줄 소개",
  "accentColor": "#RRGGBB",
  "greeting": "세션 첫 대사(1~3문장)",
  "confirm": true,
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
- <patch> 는 UI 가 자동 처리한다. 본문에서 "패치를 업데이트했어" 같은 메타 언급은 하지 않는다.

[금지]
- 이모지, 절대 금지.
- 확인되지 않은 사실을 추측으로 <patch> 에 넣지 않는다.
- <patch> 외부 본문에 JSON 또는 코드 블록을 섞지 않는다.
- 수치 상태값(defaultAffection/Trust/Stage/Mood/Energy/Stress/Stability, behaviorPatterns)은 <patch> 에 넣지 않는다  커밋 이후 별도 편집기에서 설정한다.
- 시적·서양식 라이프스타일 질문 금지 (위 [질문 스타일] 참조).
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

/**
 * 관리자가 검색 썸네일 중 "이 느낌" 이라고 확정한 레퍼런스 이미지.
 * Caster commit 까지 임시 대표 이미지로 쓰이며, appearanceKeys 와 함께
 * 외형의 시각적 앵커 역할을 한다. DB 엔 URL 만 저장, 바이트는 저장하지 않는다.
 */
export type CasterReferenceImage = {
  url: string;
  sourceUri?: string | null;
  title?: string | null;
  domain?: string | null;
};

export type CasterPatch = Partial<{
  slug: string;
  name: string;
  tagline: string;
  accentColor: string;
  greeting: string;
  persona: CasterPersonaPartial;
  /** 레퍼런스 이미지 확정 턴에 들어가는 시각 앵커. 모델이 직접 넣거나 서버가 imageRef 에서 주입. */
  referenceImage: CasterReferenceImage | null;
  /**
   * 최종 커밋 동의 플래그. 모델이 [완료 게이트: 확인요청] 다음 턴에 관리자의
   * 명시적 동의("이대로 커밋" 등)를 받고 나서만 true 로 설정한다.
   * 클라이언트가 이 플래그를 감지하면 저장 버튼을 자동 클릭하고
   * /find?focus=<slug>&gen=1 로 이동한다.
   */
  confirm: boolean;
}>;

export type CasterDraft = {
  slug: string | null;
  name: string | null;
  tagline: string | null;
  accentColor: string | null;
  greeting: string | null;
  persona: CasterPersonaPartial;
  referenceImage: CasterReferenceImage | null;
  /** true 가 되면 클라이언트가 자동 커밋을 트리거한다. 초기값 false. */
  confirm: boolean;
};

export function emptyDraft(): CasterDraft {
  return {
    slug: null,
    name: null,
    tagline: null,
    accentColor: null,
    greeting: null,
    persona: {},
    referenceImage: null,
    confirm: false,
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

/**
 * Caster 가 환각으로 만들어 낸 가짜 툴/검색 태그를 본문에서 제거.
 * - <image search>...</image search>, <search>...</search>, <tool_call>... 등.
 * - 짝이 맞는 블록도, 짝 없이 떠 있는 잔재도 정리.
 * - <patch> / <choices> 는 건드리지 않는다 (별도 추출 파이프).
 */
const HALLUCINATED_TAG_NAMES = [
  "image\\s*search",
  "image_search",
  "imagesearch",
  "search",
  "search_query",
  "tool",
  "tool_call",
  "function_call",
  "function",
  "web_search",
];

export function stripHallucinatedTags(text: string): string {
  let out = text;
  for (const name of HALLUCINATED_TAG_NAMES) {
    // 짝 맞춘 블록
    out = out.replace(
      new RegExp(`<${name}\\b[^>]*>[\\s\\S]*?<\\/${name.replace(/\\s\*/g, "\\s*")}\\s*>`, "gi"),
      "",
    );
    // 고아 열림/닫힘 태그 — "다시 보여줄게 <image search>\n..." 같은 잔재
    out = out.replace(new RegExp(`<${name}\\b[^>]*>`, "gi"), "");
    out = out.replace(new RegExp(`<\\/${name.replace(/\\s\*/g, "\\s*")}\\s*>`, "gi"), "");
  }
  // 공백 정리 — 연속 빈 줄 하나로.
  return out.replace(/\n{3,}/g, "\n\n").trim();
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
  if (patch.referenceImage !== undefined) {
    // null 이면 지움, 객체면 덮어쓰기 (URL 이 비어 있으면 지움)
    const ref = patch.referenceImage;
    if (!ref || !ref.url) {
      next.referenceImage = null;
    } else {
      next.referenceImage = {
        url: ref.url,
        sourceUri: ref.sourceUri ?? null,
        title: ref.title ?? null,
        domain: ref.domain ?? null,
      };
    }
  }
  if (patch.confirm !== undefined) {
    // 한 번 true 가 된 뒤에는 false 패치로 뒤엎지 않는다 — latching.
    next.confirm = base.confirm || patch.confirm === true;
  }

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
  if (draft.referenceImage?.url) {
    push("referenceImage.url", draft.referenceImage.url);
    if (draft.referenceImage.title) push("referenceImage.title", draft.referenceImage.title);
    if (draft.referenceImage.domain) push("referenceImage.domain", draft.referenceImage.domain);
  }
  if (draft.confirm) push("confirm", true);
  if (lines.length === 0) return "(아직 비어 있음  대화를 시작하라)";
  return lines.join("\n");
}

// ---------- 완료 게이트 ----------
//
// CharacterSheet.tsx 의 computeCompletion 과 키 목록을 공유해야 한다.
// 클라는 UI 진행바용, 서버는 Caster 에 "확인요청" 타이밍을 알려주기 위해 사용.
const REQUIRED_KEYS: (keyof CasterDraft | `persona.${keyof CasterPersonaPartial}`)[] = [
  "name",
  "slug",
  "tagline",
  "accentColor",
  "greeting",
  "persona.displayName",
  "persona.role",
  "persona.backstorySummary",
  "persona.coreBeliefs",
  "persona.coreMotivations",
  "persona.speechRegister",
  "persona.speechEndings",
  "persona.appearanceKeys",
];

function isFilled(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

export function computeServerCompletion(draft: CasterDraft): number {
  let filled = 0;
  for (const k of REQUIRED_KEYS) {
    let v: unknown;
    if (k.startsWith("persona.")) {
      const key = k.slice("persona.".length) as keyof CasterPersonaPartial;
      v = draft.persona[key];
    } else {
      v = (draft as Record<string, unknown>)[k];
    }
    if (isFilled(v)) filled += 1;
  }
  return Math.round((filled / REQUIRED_KEYS.length) * 100);
}

/**
 * 완료 게이트 상태. systemInstruction 말미에 주입되는 한 줄 태그.
 *
 *   진행중     필수 필드 미달. 평소대로 질문 진행.
 *   확인요청  이번 턴에 처음/재차 100% 에 도달했다. 모델은 이 턴에서 질문 금지,
 *             "여기서 커밋할까?" 한 번만 묻는다.
 *   패스       이미 확인요청을 마쳤고 관리자가 "더 하자"로 응답한 상태.
 *             평소대로 다듬기 진행.
 */
export type CompletionGateState = "진행중" | "확인요청" | "패스";

/**
 * 서버는 매 턴 현재 드래프트의 완료율 + "마지막으로 확인요청 보낸 턴 인덱스"
 * 를 이용해 게이트 상태를 결정한다.
 *
 * 규칙:
 *   1) pct < 100                   → 진행중
 *   2) pct >= 100, 한 번도 안 물어봄 → 확인요청
 *   3) pct >= 100, 직전에 물어봤고  → 패스
 *      유저가 "더 하자" 류로 이어감
 *   4) pct >= 100, 확인 이후 N 턴 더 → 다시 확인요청
 *      진행됨(= 사용자가 추가 조정)
 *
 * N 은 RE_ASK_EVERY_N_TURNS. 너무 자주 물으면 귀찮으니 3~5 턴 간격.
 */
const RE_ASK_EVERY_N_TURNS = 4;

export function decideCompletionGate(args: {
  pct: number;
  /** 사용자 메시지 총 개수 (이번 턴 포함 전 또는 후, 일관되기만 하면 됨) */
  userTurnCount: number;
  /** 마지막으로 "확인요청" 을 송신한 시점의 userTurnCount. 없으면 null. */
  lastAskedAtTurn: number | null;
}): CompletionGateState {
  if (args.pct < 100) return "진행중";
  if (args.lastAskedAtTurn === null) return "확인요청";
  const turnsSince = args.userTurnCount - args.lastAskedAtTurn;
  if (turnsSince >= RE_ASK_EVERY_N_TURNS) return "확인요청";
  return "패스";
}

/**
 * systemInstruction 에 덧붙일 한 줄. 라벨만 고정 포맷이면 모델이 쉽게 인식한다.
 */
export function renderCompletionGate(state: CompletionGateState, pct: number): string {
  return `[완료 게이트: ${state}] (현재 커버리지 ${pct}%)`;
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
