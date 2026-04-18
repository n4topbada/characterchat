# 07 · LLM Config

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
| model | string | O | `gemini-3.0-flash` | Gemini 모델 ID | 채팅 생성에 사용할 모델. |
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
- 모델 ID 는 Gemini API 가 주기적으로 deprecate 된다. 관리자가 `/admin/settings` 에서 갱신하도록.
- 페르소나를 갱신하려면 `PersonaCore` 를 편집(admin UI)하거나 **Caster 재-commit** — 더이상 systemPrompt 를 건드리지 않는다.
