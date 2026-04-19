/**
 * Gemini 모델 카탈로그.
 *
 * ⚠️ 프로젝트 전역에서 쓰는 **모든** 모델 ID 의 유일한 출처.
 * 코드 어디에서도 모델 ID 문자열을 하드코딩하지 않는다 — 반드시 여기서
 * `MODELS.<key>` 로 꺼내 쓴다. 하드코딩 때문에 오타/철자 실수가 DB 와
 * 소스 양쪽에 퍼져서 사고가 반복됐기 때문에 이 파일을 단일 소스로 고정.
 *
 * 이 프로젝트에서 **실제로 쓰는** 4개 계열 + 임베딩 1개만 등록한다.
 * 하위 버전(gemini-2.x / gemini-1.x) 은 어디에도 쓰지 않는다.
 *
 * | key          | 용도                                                              |
 * |--------------|-------------------------------------------------------------------|
 * | chat         | 기본 채팅 — 캐릭터 응답, Caster 대화.                             |
 * | chatFallback | chat 모델이 503/과부하로 재시도 실패 시 강등 경로.                |
 * | pro          | 고난이도 추론/계획/롱폼 — Caster research·knowledge 합성 등.       |
 * |              | thinkingConfig.thinkingLevel = MEDIUM 권장.                        |
 * | image        | 포트레이트/갤러리 이미지 생성 ("나노바나나").                      |
 * |              | responseModalities: ['IMAGE','TEXT'] + imageConfig 필요.           |
 * | embed        | KnowledgeChunk 벡터 임베딩 (768차원).                              |
 *
 * 정책 전문: docs/07-llm-config.md §0.
 */
export const GEMINI_MODELS = {
  chat:         "gemini-3-flash-preview",
  chatFallback: "gemini-3.1-flash-lite-preview",
  pro:          "gemini-3.1-pro-preview",
  image:        "gemini-3.1-flash-image-preview",
  embed:        "text-embedding-004",
} as const;

export type GeminiModelKey = keyof typeof GEMINI_MODELS;
export type GeminiModelId = (typeof GEMINI_MODELS)[GeminiModelKey];

/** 카탈로그에 등록된 ID 인지 검사. */
export function isKnownModel(id: string): id is GeminiModelId {
  return (Object.values(GEMINI_MODELS) as string[]).includes(id);
}

/**
 * 기존 코드 호환용 별칭. 신규 코드는 `GEMINI_MODELS` 를 직접 쓴다.
 * (chat/image/embed 3개 키는 기존 레이아웃을 유지.)
 */
export const MODELS = {
  chat:  GEMINI_MODELS.chat,
  image: GEMINI_MODELS.image,
  embed: GEMINI_MODELS.embed,
} as const;
