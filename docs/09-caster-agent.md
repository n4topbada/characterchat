# 09 · Caster Agent

Caster는 **페르소나가 없는 디자이너 에이전트**다. 사용자(관리자)와 대화하며 캐릭터 설계 요소를 수집·리서치하고, 100% 완성되면 챗봇용 구조체를 자동으로 생성한다.

> **역할 분리**  
> Caster = **디자이너 (편집자 톤, 페르소나 없음, 관리자와 협업)**  
> Chat LLM = **서술자 (Caster 가 만든 페르소나를 연기하며 유저와 대화)**  
> Caster 는 결과물인 캐릭터를 **정의**하기만 한다. 그 캐릭터를 **연기**하는 것은 Chat LLM 의 몫이다.

> **핵심 원칙**  
> Caster는 사용자에게 "필드 이름"이나 "완성도 %"를 노출하지 않는다.  
> 내부적으로 coverage 값을 추적하고, 100% 도달 시 사용자에게 마지막 확인만 받는다.

---

## 1. 모델 설정

| 항목 | 값 | 근거 |
|---|---|---|
| 모델 | `gemini-3-flash-preview` ([07-llm-config §0](07-llm-config.md#0-모델-고정-정책-️-do-not-touch)) | 빠른 리서치 루프 + 도구 호출 지원 |
| temperature | `1.5` | 아이디에이션 다양성 확보 (사용자 요구) |
| topP | 0.95 | 기본 |
| maxOutputTokens | 8192 | 한 턴 응답 여유 |
| 웹검색 | **활성** (Google Search grounding 또는 `web_search` 툴) | 실존 인물/작품 리서치 필수 |
| 이미지 생성 | `gemini-3.1-flash-image-preview` | 포트레이트 |
| 임베딩 | `text-embedding-004` | 지식 청크 |

---

## 2. 숨은 Coverage 시스템

### 2-1. 필드 가중치 (총 100점)

가중치는 **schema 의 PersonaCore 필드**와 직접 대응한다.

```ts
const WEIGHTS = {
  // 정보 축 (30점)
  "core.backstorySummary >= 120":  12,  // 서사적 배경
  "core.displayName + aliases":     4,  // 이름 + 별칭
  "core.role | species | gender":   6,  // 역할·종·성별 중 2개 이상
  "core.coreBeliefs >= 2":          4,  // 신념
  "core.coreMotivations >= 2":      4,  // 동기
  // 말투 축 (15점)
  "core.speechRegister":            3,
  "core.speechEndings >= 2":        3,
  "core.speechQuirks >= 1":         2,
  "core.appearanceKeys >= 3":       2,
  "style_anchor chunks >= 3":       5,
  // 한계/안전 (10점)
  "core.redLines >= 3":            10,
  // 행동 (15점)
  "behavior_patterns >= 4 emotions": 15, // joy/sadness/anger/neutral 최소
  // 지식 축 (15점)
  "knowledge_chunks >= 8":         15,  // 실존·설정 시드 최소 8
  // 시각 (5점)
  "portrait":                       5,
  // 메타 + greeting (10점)
  "name + slug + tagline":          5,
  "greeting >= 40 chars":           5,
} as const;
```

### 2-2. 계산 로직
`src/lib/caster/coverage.ts`:
```ts
export function computeCoverage(draft: CasterDraft): { score: number; components: Record<string, number> } {
  const c = draft.core ?? {};
  const components: Record<string, number> = {};
  components.backstory = (c.backstorySummary?.length ?? 0) >= 120 ? 12 : 0;
  components.identity  = (c.displayName ? 2 : 0) + ((c.aliases?.length ?? 0) >= 1 ? 2 : 0);
  components.role      = [c.role, c.species, c.gender].filter(Boolean).length >= 2 ? 6 : 0;
  components.beliefs   = (c.coreBeliefs?.length    ?? 0) >= 2 ? 4 : 0;
  components.motives   = (c.coreMotivations?.length ?? 0) >= 2 ? 4 : 0;
  components.register  = c.speechRegister ? 3 : 0;
  components.endings   = (c.speechEndings?.length ?? 0) >= 2 ? 3 : 0;
  components.quirks    = (c.speechQuirks?.length  ?? 0) >= 1 ? 2 : 0;
  components.appearance= (c.appearanceKeys?.length ?? 0) >= 3 ? 2 : 0;
  components.style_anchors = (draft.styleAnchors?.length ?? 0) >= 3 ? 5 : 0;
  components.red_lines = (c.redLines?.length ?? 0) >= 3 ? 10 : 0;
  components.behavior  = Object.keys(draft.behaviorPatterns ?? {}).length >= 4 ? 15 : 0;
  components.knowledge = (draft.knowledgeSeeds?.length ?? 0) >= 8 ? 15 : 0;
  components.portrait  = draft.portraitBlobUrl ? 5 : 0;
  components.meta      = (draft.name && draft.slug && draft.tagline) ? 5 : 0;
  components.greeting  = (draft.greeting?.length ?? 0) >= 40 ? 5 : 0;
  const score = Math.min(
    Object.values(components).reduce((a,b) => a+b, 0),
    100
  );
  return { score, components };
}
```

서버는 매 도구 호출 후 이 함수를 재실행하고 `CasterRun.coverage` 를 upsert 하며,
SSE 로 `event: coverage_state` (가리기 값: components 키 목록만, 점수는 숨김) 를 보낸다.
`score === 100` 이 되면 별도 `event: coverage_ready` 를 송신한다.

### 2-3. 트리거 동작

| coverage | 동작 |
|---|---|
| 0~60 | 일반 대화·리서치. 넛지 없음. |
| 60~79 | LLM에 "보강이 필요한 영역 1~2가지를 자연스럽게 유도" system-level hint 주입. |
| 80~99 | "거의 다 왔어요" 톤. LLM이 빠진 부분을 구체적으로 묻도록. |
| **100** | 서버가 `event: coverage_ready` SSE 전송 → UI가 "캐릭터 준비됐어요! 확정할까요?" 마지막 확인 모달 노출. 사용자 확인 → finalize. |

coverage 값은 **Caster SSE 응답 본문에 포함하지 않는다** (서버가 draft를 업데이트할 때마다 서버 측에서 직접 계산). 사용자에게 노출되는 건 상태 문자열("탐색 중" → "거의 다 왔어요" → "준비됨")뿐이다.

---

## 3. 시스템 프롬프트 (v2)

```
너는 Caster다. 관리자와 자연스러운 대화를 통해 AI 채팅 캐릭터를 함께 디자인한다.

행동 규칙:
  1) 절대 롤플레이하지 말 것. 디자이너·편집자 톤 유지.
  2) 사용자에게 "필드 이름"이나 "수치", "진행률"을 절대 언급하지 말 것.
     - 금지: "disposition을 알려주세요", "아직 60%예요"
     - 허용: "이 친구는 어떤 성향을 가졌으면 좋겠어요?", "몇 가지만 더 얘기해보죠"
  3) 한 턴에 1~2개 관점만 탐색한다. 설문지처럼 묻지 말 것.
  4) 사용자의 답에서 추출 가능한 정보가 있으면 즉시 update_draft 도구로 저장한다.
  5) 애매하거나 실존 레퍼런스가 있으면 web_search → fetch_url 로 리서치하고
     사용자에게 "이런 느낌인가요?" 확인.
  6) 시각 이미지는 충분한 서술이 모였을 때 한 번에 generate_portrait.
  7) 성적/혐오/실존 인물 명예훼손 요구는 거절.

내부 상태 (사용자에게 보이지 않음):
  - draft: 누적 JSON
  - coverage: 0~100 (시스템이 매 턴 계산해서 system hint로 주입)

coverage < 60: 자유롭게 탐색
coverage 60~79: 빠진 축(정보/지식/말투/한계 중)을 자연스럽게 유도
coverage 80~99: 마지막 누락 정밀 보강
coverage == 100: "준비 다 된 것 같아요. 한 번 볼까요?" 한 마디 후 대기 (finalize는
                 사용자 버튼 클릭 시 서버가 자동 트리거)

출력은 한국어.
```

---

## 4. 도구 카탈로그 (v2)

도구는 플랫 `propose_character` 하나에서 **세분화된 업데이트 도구**로 전환했다. Caster가 대화 흐름 속에서 증분 업데이트하도록.

### 4-1. `update_core_field`
```json
{
  "name": "update_core_field",
  "description": "PersonaCore 의 단일 필드를 설정한다. 문자열 필드만 대상.",
  "parameters": {
    "type": "object",
    "properties": {
      "field": {
        "type": "string",
        "enum": [
          "displayName", "pronouns", "ageText", "gender", "species", "role",
          "backstorySummary", "worldContext",
          "speechRegister", "speechRhythm", "languageNotes"
        ]
      },
      "value": { "type": "string" }
    },
    "required": ["field", "value"]
  }
}
```

### 4-1b. `update_core_list`
```json
{
  "name": "update_core_list",
  "description": "PersonaCore 의 배열 필드를 설정 또는 추가한다.",
  "parameters": {
    "type": "object",
    "properties": {
      "field": {
        "type": "string",
        "enum": [
          "aliases", "coreBeliefs", "coreMotivations", "fears",
          "speechEndings", "speechQuirks", "appearanceKeys"
        ]
      },
      "mode":   { "type": "string", "enum": ["set","append"], "default": "append" },
      "values": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
    },
    "required": ["field", "values"]
  }
}
```

### 4-2. `set_red_lines`
```json
{
  "name": "set_red_lines",
  "description": "캐릭터가 어떤 상황에서도 하지 않는 행동·발화 목록을 설정한다(덮어쓰기).",
  "parameters": {
    "type": "object",
    "properties": {
      "lines": { "type": "array", "items": { "type": "string" }, "minItems": 1 }
    },
    "required": ["lines"]
  }
}
```

### 4-3. `set_behavior_pattern`
```json
{
  "name": "set_behavior_pattern",
  "description": "한 감정 키에 대한 신체/발화/모순 패턴 설정",
  "parameters": {
    "type": "object",
    "properties": {
      "emotion_key": { "type": "string", "examples": ["joy","sadness","anger","fear","neutral"] },
      "physical": { "type": "string" },
      "speech_change": { "type": "string" },
      "contradiction": { "type": ["string","null"] }
    },
    "required": ["emotion_key","physical","speech_change"]
  }
}
```

### 4-4. `set_sensitivity`
```json
{
  "name": "set_sensitivity",
  "description": "룰 엔진의 감수성 계수. 각 수치는 0~2 (1=표준). 감정 처리 파라미터도 함께.",
  "parameters": {
    "type": "object",
    "properties": {
      "trust":     { "type": "number", "minimum": 0, "maximum": 2 },
      "sentiment": { "type": "number", "minimum": 0, "maximum": 2 },
      "stress":    { "type": "number", "minimum": 0, "maximum": 2 },
      "mood":      { "type": "number", "minimum": 0, "maximum": 2 },
      "processingSpeed": { "type": "integer", "minimum": 1, "maximum": 6, "description": "N턴 뒤 표면→내면 감정 전이" },
      "volatility":      { "type": "number", "minimum": 0, "maximum": 1 }
    }
  }
}
```

### 4-4b. `set_default_state`
```json
{
  "name": "set_default_state",
  "description": "PersonaState 초기화용 기본 상태 (-100~+100 의 affection/trust 와 0~1 의 mood/energy/stress/stability)",
  "parameters": {
    "type": "object",
    "properties": {
      "affection": { "type": "integer", "minimum": -100, "maximum": 100 },
      "trust":     { "type": "integer", "minimum": -100, "maximum": 100 },
      "stage":     { "type": "string", "enum": ["stranger","acquaintance","friend","close","intimate"] },
      "mood":      { "type": "number", "minimum": 0, "maximum": 1 },
      "energy":    { "type": "number", "minimum": 0, "maximum": 1 },
      "stress":    { "type": "number", "minimum": 0, "maximum": 1 },
      "stability": { "type": "number", "minimum": 0, "maximum": 1 }
    }
  }
}
```

### 4-5. `add_knowledge_chunk`
```json
{
  "name": "add_knowledge_chunk",
  "description": "지식 청크 1개를 draft에 추가. 타입은 knowledge 고정. Caster가 사용자와의 대화나 web_search 결과를 정제해 호출한다.",
  "parameters": {
    "type": "object",
    "properties": {
      "title": { "type": "string" },
      "content": { "type": "string" },
      "trigger_keywords": { "type": "array", "items": { "type": "string" } },
      "source_urls": { "type": "array", "items": { "type": "string" } },
      "is_secret": { "type": "boolean", "default": false },
      "anchor":    { "type": "boolean", "default": false }
    },
    "required": ["title","content"]
  }
}
```

### 4-6. `add_style_anchor`
```json
{
  "name": "add_style_anchor",
  "description": "말투/반응 few-shot 샘플. type=style_anchor 고정.",
  "parameters": {
    "type": "object",
    "properties": {
      "emotion_tag": { "type": "string" },
      "few_shot_text": { "type": "string", "description": "상황→캐릭터 반응 쌍을 자유 서술" },
      "force_active": { "type": "boolean", "default": true }
    },
    "required": ["emotion_tag","few_shot_text"]
  }
}
```

### 4-7. `set_meta`
```json
{
  "name": "set_meta",
  "description": "캐릭터 메타 (이름/슬러그/태그라인/엑센트컬러/그리팅)",
  "parameters": {
    "type": "object",
    "properties": {
      "name":        { "type": "string" },
      "slug":        { "type": "string", "pattern": "^[a-z0-9-]{2,32}$" },
      "tagline":     { "type": "string", "maxLength": 60 },
      "accentColor": { "type": "string", "pattern": "^#[0-9a-fA-F]{6}$" },
      "greeting":    { "type": "string", "maxLength": 500 }
    }
  }
}
```

### 4-8. `generate_portrait`
```json
{
  "name": "generate_portrait",
  "description": "gemini-3.1-flash-image-preview 로 포트레이트 생성 → Blob 업로드 → draft.portraitBlobUrl에 저장",
  "parameters": {
    "type": "object",
    "properties": {
      "prompt": { "type": "string" },
      "style":  { "type": "string", "enum": ["illustration","painterly","anime","photoreal"] }
    },
    "required": ["prompt"]
  }
}
```

### 4-9. `web_search`
```json
{
  "name": "web_search",
  "description": "주제를 웹에서 검색 (Google Search grounding 또는 Brave Search API)",
  "parameters": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "topK":  { "type": "integer", "default": 6 }
    },
    "required": ["query"]
  }
}
```

### 4-10. `fetch_url`
```json
{
  "name": "fetch_url",
  "description": "URL 본문 추출 (readability, 바이너리 거부, 1MB 상한)",
  "parameters": {
    "type": "object",
    "properties": { "url": { "type": "string", "format": "uri" } },
    "required": ["url"]
  }
}
```

모든 `update_*`/`add_*`/`set_*` 도구는 **서버에서 실행**되며 draft JSON과 coverage를 증분 갱신한다. Caster LLM은 값을 합성해 도구에 넘기기만 한다.

---

## 5. 세션 플로우

```
[관리자]  /admin/caster → "요리사 캐릭터 만들어줘"
                ↓
POST /api/admin/caster/runs  → CasterRun(status=running, draftJson={})
                ↓
SSE loop (POST /api/admin/caster/runs/:id/messages):
  ┌─────────────────────────────────────────┐
  │ user turn → Gemini 3.0 Flash (temp 1.5) │
  │   function_declarations 제공            │
  │   + system hint: "current coverage: N"  │
  │                                         │
  │ LLM response:                           │
  │   (a) assistant text (사용자에게 보임)  │
  │   (b) function_calls (서버 실행)        │
  │                                         │
  │ 서버: 각 function_call을 handler에 전달 │
  │   → draft 증분 업데이트                 │
  │   → coverage 재계산                     │
  │   → tool_result를 모델에 feed back       │
  │                                         │
  │ coverage 100 도달 시:                   │
  │   event: coverage_ready SSE             │
  │   UI에 확정 버튼 노출                   │
  └─────────────────────────────────────────┘
                ↓
[관리자 확정 버튼]
                ↓
POST /api/admin/caster/runs/:id/commit
  → 트랜잭션 (§6)
  → Character 생성 완료
```

---

## 6. Commit 트랜잭션 (Phase A+B 기준)

```ts
await prisma.$transaction(async (tx) => {
  if (await tx.character.findUnique({ where: { slug: draft.slug }})) throw Conflict();
  const characterId = ulid();

  // 1. 캐릭터 메타 + 설정 (생성 파라미터만; 프롬프트 자유서술 필드는 스키마에서 제거됨)
  await tx.character.create({ data: {
    id: characterId,
    slug: draft.slug, name: draft.name, tagline: draft.tagline,
    accentColor: draft.accentColor,
    config: { create: {
      id: ulid(),
      model: "gemini-3-flash-preview",
      temperature: 0.8,
      maxOutputTokens: 1024,
      greeting: draft.greeting,
      statusPanelSchema: draft.statusPanelSchema ?? null,
      safetyJson: DEFAULT_SAFETY,
    }},
  }});

  // 2. 페르소나 코어 (불변). 시스템 프롬프트는 여기서 조건 구조체로 합성된다.
  await tx.personaCore.create({ data: {
    id: ulid(),
    characterId,
    displayName:      draft.core.displayName ?? draft.name,
    aliases:          draft.core.aliases ?? [],
    pronouns:         draft.core.pronouns,
    ageText:          draft.core.ageText,
    gender:           draft.core.gender,
    species:          draft.core.species,
    role:             draft.core.role,
    backstorySummary: draft.core.backstorySummary,
    worldContext:     draft.core.worldContext,
    coreBeliefs:      draft.core.coreBeliefs ?? [],
    coreMotivations:  draft.core.coreMotivations ?? [],
    fears:            draft.core.fears ?? [],
    redLines:         draft.core.redLines ?? [],
    speechRegister:   draft.core.speechRegister,
    speechEndings:    draft.core.speechEndings ?? [],
    speechRhythm:     draft.core.speechRhythm,
    speechQuirks:     draft.core.speechQuirks ?? [],
    languageNotes:    draft.core.languageNotes,
    appearanceKeys:   draft.core.appearanceKeys ?? [],
    defaultAffection: draft.defaultState?.affection ?? 0,
    defaultTrust:     draft.defaultState?.trust ?? 0,
    defaultStage:     draft.defaultState?.stage ?? "stranger",
    defaultMood:      draft.defaultState?.mood ?? 0.0,
    defaultEnergy:    draft.defaultState?.energy ?? 0.7,
    defaultStress:    draft.defaultState?.stress ?? 0.3,
    defaultStability: draft.defaultState?.stability ?? 0.7,
    trustSensitivity:     draft.sensitivity?.trust ?? 1.0,
    sentimentSensitivity: draft.sensitivity?.sentiment ?? 1.0,
    stressSensitivity:    draft.sensitivity?.stress ?? 1.0,
    moodSensitivity:      draft.sensitivity?.mood ?? 1.0,
    emotionalProcessingSpeed: draft.sensitivity?.processingSpeed ?? 2,
    emotionalVolatility:      draft.sensitivity?.volatility ?? 0.5,
    behaviorPatterns: draft.behaviorPatterns ?? null,
  }});

  // 2-b. 이벤트 카탈로그 (선택; Phase B 룰 엔진 힌트)
  for (const tpl of draft.eventTemplates ?? []) {
    await tx.eventTypeTemplate.create({ data: {
      id: ulid(),
      characterId,
      key: tpl.key,
      label: tpl.label,
      description: tpl.description,
      triggers: tpl.triggers ?? null,
      stateDelta: tpl.stateDelta ?? null,
    }});
  }

  // 3. 포트레이트
  if (draft.portraitBlobUrl) {
    const a = await tx.asset.create({ data: {
      id: ulid(), characterId, kind: "portrait",
      blobUrl: draft.portraitBlobUrl,
      mimeType: draft.portraitMimeType!,
      width: draft.portraitWidth!,
      height: draft.portraitHeight!,
    }});
    await tx.character.update({
      where: { id: characterId },
      data:  { portraitAssetId: a.id },
    });
  }

  // 4. 지식 청크 (chunking + embedding 은 트랜잭션 전에 수행).
  //    트리거·출처 등 부가정보는 metadata JSONB 에 넣는다.
  for (const seed of preparedKnowledge) {
    const docId = ulid();
    await tx.knowledgeDoc.create({ data: {
      id: docId, characterId, title: seed.title, source: "caster",
      rawText: seed.content, sourceUrls: seed.sourceUrls ?? [],
    }});
    for (const chunk of seed.chunks) {
      const meta = {
        triggerKeywords: seed.triggerKeywords ?? [],
        tags:            seed.tags ?? [],
        anchor:          seed.anchor ?? false,
        isSecret:        seed.isSecret ?? false,
        sourceUrls:      seed.sourceUrls ?? [],
        urgency:         seed.urgency ?? "medium",
        weight:          1.0,
      };
      await tx.$executeRaw`
        INSERT INTO "KnowledgeChunk"
          (id, "docId", "characterId", "type", "ordinal", "content", "tokens",
           "metadata", "updatedAt", "embedding")
        VALUES (
          ${chunk.id}, ${docId}, ${characterId}, 'knowledge',
          ${chunk.ordinal}, ${chunk.content}, ${chunk.tokens},
          ${meta}::jsonb, NOW(),
          ${chunk.vecLiteral}::vector
        )
      `;
    }
  }

  // 5. 말투 앵커 — type=style_anchor. metadata 로 감정 태그·강제주입 여부 저장.
  for (const s of draft.styleAnchors) {
    const id = ulid();
    const vec = await embed(s.fewShotText);
    const meta = {
      emotionTag:  s.emotionTag,
      forceActive: s.forceActive ?? true,
      situation:   s.situation ?? null,
      weight:      1.5,        // 말투는 지식보다 우선
    };
    await tx.$executeRaw`
      INSERT INTO "KnowledgeChunk"
        (id, "characterId", "type", "ordinal", "content", "tokens",
         "metadata", "updatedAt", "embedding")
      VALUES (
        ${id}, ${characterId}, 'style_anchor',
        0, ${s.fewShotText}, ${s.tokens},
        ${meta}::jsonb, NOW(),
        ${toVecLit(vec)}::vector
      )
    `;
  }

  // 6. 런 마감
  await tx.casterRun.update({
    where: { id: runId },
    data: { status: "saved", savedCharacterId: characterId, endedAt: new Date() },
  });
});
```

---

## 7. 가드레일

| 항목 | 규칙 |
|---|---|
| 모델 하드코딩 | 서버만 모델 ID 결정. 클라이언트가 모델/온도 변경 불가. |
| 도메인 allow-list | `fetch_url`은 `ENV.ALLOW_FETCH_DOMAINS` 적용. 비어있으면 전부 허용(개발), 프로덕션은 필수 설정. |
| 감사 로그 | 모든 도구 호출 → `CasterEvent{kind:'tool_call', payload}`. 결과도 `tool_result`로 기록. |
| NSFW | `featureFlags.NSFW = false`면 성적 콘텐츠 거부. 실존 인물 특정 요청은 기본 거부. |
| 이미지 상한 | 한 런 최대 3회 `generate_portrait`. 초과 시 사용자에게 안내. |

---

## 8. 루프 상한

| 항목 | 기본값 | 근거 |
|---|---|---|
| 한 런 최대 메시지 수 | 60 | 무한 루프 방지 |
| 한 런 최대 툴 호출 수 | 40 | 비용 상한 |
| 한 런 최대 이미지 생성 수 | 3 | 비용 + 품질 |
| 한 턴 안 툴 호출 수 | 5 | 중첩 호출 방지 |
| 총 토큰 한계 | 400K in / 100K out | 3.0 Flash 여유 |
| 런 타임아웃 | 15분 | Vercel maxDuration 고려 |

---

## 9. M1~M3 스켈레톤 (현재)
- `CasterRun`/`CasterEvent` 테이블만 활성.
- `POST /runs/:id/messages` — 툴 없이 `generateContentStream` 만.
- UI: 단일 채팅 콘솔 (우측 draft 카드 없음).
- commit은 admin 수동 입력 JSON을 받아 트랜잭션 실행.

## 10. M4에서 추가
- 10개 도구 핸들러 완성 (`src/lib/gemini/caster.ts`).
- 서버 측 coverage 계산 + system hint 주입.
- 이미지 생성 파이프라인.
- SSE 이벤트: `tool_call`, `tool_result`, `coverage_state`, `coverage_ready`.
- `Zod` draft schema 검증.
