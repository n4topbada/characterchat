# 07 · LLM Config

## 0. 모델 카탈로그 ⚠️ DO NOT TOUCH

프로젝트에서 쓰는 **모든** Gemini 모델 ID 는 단 한 곳, [`src/lib/gemini/models.ts`](../src/lib/gemini/models.ts) 의 `GEMINI_MODELS` 상수에서만 선언된다. 코드 어디에서도 모델 문자열을 하드코딩하지 않는다.

```ts
export const GEMINI_MODELS = {
  chat:         "gemini-flash-latest",
  chatFallback: "gemini-3-flash-preview",
  pro:          "gemini-3.1-pro-preview",
  image:        "gemini-3.1-flash-image-preview",
  embed:        "text-embedding-004",
} as const;
```

| key | 실제 ID | 용도 |
|---|---|---|
| `chat` | `gemini-flash-latest` | 기본 채팅 (캐릭터 응답, Caster 대화) |
| `chatFallback` | `gemini-3-flash-preview` | `chat` 모델이 503/과부하로 재시도 소진 시 **한 번만** 강등되는 경로 |
| `pro` | `gemini-3.1-pro-preview` | 고난이도 추론·계획·롱폼 (`thinkingConfig.thinkingLevel = MEDIUM` 권장). Caster research/knowledge 합성 등에 사용 |
| `image` | `gemini-3.1-flash-image-preview` | 포트레이트/갤러리 이미지 생성. `responseModalities: ['IMAGE','TEXT']` + `imageConfig` 필요 |
| `embed` | `text-embedding-004` | KnowledgeChunk 벡터 임베딩 (768d) |

**이 다섯 개만 쓴다.** `gemini-2.x-*` / `gemini-1.x-*` 등 하위 버전은 쓰지 않으며, 등록되지 않은 3.x 문자열(예: 존재하지 않는 ID 를 실수로 입력) 도 런타임 `normalizeModel()` 이 `GEMINI_MODELS.chat` 으로 교정한다.

### 503 Fallback 체인
1. 클라이언트 레이어 (`withGeminiFallback`, `src/lib/gemini/client.ts`): **키당** `PER_KEY_RETRIES=2` 의 exponential backoff + 키 N개 폴백.
2. 모델 레이어 (`streamChat`, `src/lib/gemini/chat.ts`): 1번이 모두 실패하고 오류가 `isOverloadedError` 에 걸리면 **한 번만** `chat → chatFallback` 으로 강등. 그 후 같은 키 재시도 체인을 `chatFallback` 모델로 다시 한 바퀴 돈다.
3. `chatFallback` 마저 실패하면 호출자에게 그대로 throw.

즉 과부하가 진짜로 장기화된 경우에만 강등이 일어나고, 일시적 503 은 클라이언트 재시도 선에서 흡수된다.

### 승격 방침
`gemini-3-flash` GA (프리뷰 꼬리가 빠진 것), `gemini-3.5-*`, `gemini-4.x` 등이 나오면 **카탈로그 한 줄만** 바꾼다. 그 외 파일은 전부 `GEMINI_MODELS.<key>` 또는 `MODELS.<key>` 로 참조하므로 자동 전파된다. 새 모델을 붙일 때는:

1. `GEMINI_MODELS` 에 키 추가
2. 본 섹션의 카탈로그 표에 행 추가
3. 실제 `ai.models.generateContentStream` / `generateContent` 호출이 성공하는 snippet 을 PR 설명에 붙인다 (카탈로그는 실존 ID 만 담는다 — 등록 전 검증 필수)

### 금지 사례
- ❌ 코드·스크립트·seed 어디에서도 모델 ID 문자열을 **하드코딩** 하지 않는다 → 반드시 `GEMINI_MODELS.<key>` import
- ❌ 카탈로그에 등록되지 않은 모델 ID 를 DB `CharacterConfig.model` 에 직접 넣기 (넣어도 `normalizeModel()` 이 교정하지만 혼란의 원천)
- ❌ `gemini-2.x` / `gemini-1.x` 하위 모델로 내려가기 — 비용/지연이 매력적으로 보여도 캐릭터 발화 품질·한국어 뉘앙스·장문 기억 유지 차이가 체감으로 크다
- ❌ "이 한 명만 싸게 돌리자" 같은 캐릭터별 최적화로 다른 모델 꽂기 — 일관성 붕괴의 시작점

---

`CharacterConfig` 테이블은 **생성 파라미터만** 담는다. 페르소나 서술은 분리된 세 저장소에서 합성된다:

- **`PersonaCore`** — 캐릭터의 불변 사실(정체성·신념·말투·한계·외형 키·감수성)
- **`PersonaState`** — (user × character) 동적 상태(관계 수치·감정·pendingEmotions)
- **`KnowledgeChunk`** — 타입별 메모리·지식·말투 앵커(`knowledge` / `style_anchor` / `episode` / `belief` / `relation_summary` / `external_info`)

즉 "시스템 프롬프트"는 저장되지 않는다. 매 요청마다 [`src/lib/gemini/prompt.ts`](../src/lib/gemini/prompt.ts)
의 composer 가 위 세 저장소로부터 **조건 구조체**를 합성한다. 자세한 합성 템플릿은 [18 · Chatbot Persona Data §5](18-chatbot-persona-data.md#5-조건-구조체-합성--chat-pipeline-통합) 참고.

---

## 1. CharacterConfig 필드 명세 (현재)

| 필드 | 타입 | 필수 | 기본값 | 범위/예시 | 설명 |
|---|---|---|---|---|---|
| model | string | O | `gemini-3-flash-preview` (= `GEMINI_MODELS.chat`) | 카탈로그 등록 ID | 채팅 생성에 사용할 모델. §0 카탈로그. |
| temperature | float | O | `0.8` | 0.0 ~ 2.0 | 낮을수록 결정적. 캐릭터 개성을 살릴 때 0.7~1.0. 서사가 단조로우면 1.0~1.2 까지. |
| topP | float | X | null | 0.0 ~ 1.0 | nucleus sampling. null 이면 모델 기본값. |
| topK | int | X | null | 1 ~ 40 | 토큰 후보 상한. |
| maxOutputTokens | int | O | `1024` | 128 ~ 8192 | 한 응답 최대 길이. 상태창 포함 시 ≥ 768 권장. |
| greeting | text | O | — | ≤ 500자 | 세션 생성 직후 자동 system 메시지로 삽입(캐릭터의 첫 대사). |
| statusPanelSchema | json | X | null | `{ mood:'string', ... }` | 상태창 필드 정의. null 이면 상태창 비활성. |
| safetyJson | json | X | null | Gemini SafetySetting[] | 기본: 4카테고리 BLOCK_MEDIUM. |

### 제거된 필드 (0003_persona 마이그레이션에서 DROP)
- ~~`systemPrompt`~~ — `PersonaCore` + composer 가 대체
- ~~`characterPromptAddendum`~~ — `PersonaCore.backstorySummary`, `appearanceKeys`, `worldContext`
- ~~`featurePromptAddendum`~~ — `PersonaCore.redLines`, `speechRegister`, composer 의 `[서술 형식]` 블록

이유: 세 개의 자유서술 필드가 있으면 Caster·관리자·runtime 이 같은 내용을 중복·모순되게 편집할
위험이 크다. 구조화된 필드 하나 하나가 조건 구조체의 한 줄이 되도록 설계했다.

---

## 2. 시스템 인스트럭션 합성 규칙 (현행)

`src/lib/gemini/prompt.ts` 의 `buildSystemInstruction` 시그니처:

```ts
type Context = {
  cfg:     CharacterConfig;
  core:    PersonaCore;
  state?:  PersonaState;         // Phase A 에서는 undefined, Phase B 부터 채워짐
  chunks: {
    knowledge:     KnowledgeChunk[]; // top-5, type=knowledge+belief
    styleAnchors:  KnowledgeChunk[]; // top-3, forceActive=true 우선
    episodes:      KnowledgeChunk[]; // Phase B, top-3 type=episode, userId 일치
    relationSummary?: KnowledgeChunk | null;  // Phase B/C
  };
  userLastMessage: string;
  statusPanelSchema?: any;
};

export function buildSystemInstruction(ctx: Context): string;
```

출력 구조는 [18 §5](18-chatbot-persona-data.md#5-조건-구조체-합성--chat-pipeline-통합) 의 블록 순서를 그대로 따른다:

1. `[당신은 서술자]` — LLM 의 역할 선언
2. `[페르소나 · 코어]` — `PersonaCore` 직렬화
3. `[페르소나 · 현재 상태]` — `PersonaState` 직렬화 (없으면 `core.default*` 로)
4. `[관련 기억]` — episodes + relationSummary
5. `[지식]` — knowledge chunks (출처 있으면 `[source: url]`)
6. `[말투 앵커]` — styleAnchors few-shot
7. `[서술 형식]` — 마크업 규칙 + `statusPanelSchema`
8. `[금지]` — redLines + 지어내기 금지

---

## 3. Gemini 호출 세부

`src/lib/gemini/chat.ts` 의사코드:

```ts
const stream = genai.models.generateContentStream({
  model: cfg.model,
  config: {
    systemInstruction: buildSystemInstruction(ctx),
    temperature:  cfg.temperature,
    topP:         cfg.topP ?? undefined,
    topK:         cfg.topK ?? undefined,
    maxOutputTokens: cfg.maxOutputTokens,
    safetySettings:  cfg.safetyJson ?? DEFAULT_SAFETY,
  },
  contents,  // history: role='user' | 'model'
});
```

### DEFAULT_SAFETY
```ts
export const DEFAULT_SAFETY = [
  { category: "HARM_CATEGORY_HARASSMENT",        threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_HATE_SPEECH",       threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" },
];
```

---

## 4. 글로벌 디폴트와 오버라이드
- `src/lib/gemini/defaults.ts` 에 모델·파라미터 기본값 export.
- `CharacterConfig` 가 생성될 때 빈 값은 디폴트를 사용.
- 추후 `/admin/settings` 에서 전역 디폴트를 `AppSettings` 테이블로 관리(M5).

## 5. 검증
- Zod 스키마 `configUpdateSchema` 가 범위를 강제한다.
- UI(Config 탭)도 slider/number input 에 min/max 를 부여.
- 서버는 항상 재검증 후 persist.

## 6. 주의
- `maxOutputTokens` 가 너무 작으면 상태창이 잘린다. 권장 ≥ 512 (상태창 ON 이면 ≥ 768).
- `safetySettings` 를 낮추면 유해 응답 가능성 증가. 감사(audit) 기능은 M5.
- 모델 ID 는 **§0 카탈로그** 만 쓴다. 하위 버전(2.x/1.x) 금지. 상향은 카탈로그 한 줄 변경으로 일괄 반영한다. 개별 `CharacterConfig.model` 이 카탈로그 밖 값으로 남아 있어도 `normalizeModel()` 이 `GEMINI_MODELS.chat` 으로 교정한다.
- 페르소나를 갱신하려면 `PersonaCore` 를 편집(admin UI)하거나 **Caster 재-commit** — 더이상 systemPrompt 를 건드리지 않는다.
