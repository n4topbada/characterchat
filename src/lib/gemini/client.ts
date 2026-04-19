import { GoogleGenAI } from "@google/genai";

export { GEMINI_MODELS, MODELS, isKnownModel } from "./models";
export type { GeminiModelKey, GeminiModelId } from "./models";

function readKeys(): string[] {
  const raw = [
    process.env.GOOGLE_GENAI_API_KEY,
    process.env.GOOGLE_GENAI_API_KEY_FALLBACK,
  ];
  const keys = raw.filter(
    (k): k is string => !!k && k !== "placeholder" && k.trim().length > 0,
  );
  if (keys.length === 0) {
    throw new Error(
      "GOOGLE_GENAI_API_KEY (or GOOGLE_GENAI_API_KEY_FALLBACK) is not set",
    );
  }
  return keys;
}

const _clients = new Map<string, GoogleGenAI>();

function clientFor(key: string): GoogleGenAI {
  let c = _clients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    _clients.set(key, c);
  }
  return c;
}

/** 기본 클라이언트 (첫 번째 키). 단발 호출용 back-compat. */
export function gemini(): GoogleGenAI {
  return clientFor(readKeys()[0]);
}

/**
 * 호출을 감싸서 transient 오류(quota/429/5xx/invalid_api_key) 시 재시도 + 키 폴백.
 *
 * 재시도 전략:
 *   - 각 키 내부에서 PER_KEY_RETRIES 만큼 exponential backoff 로 재시도
 *     (503 Service Unavailable 처럼 "잠깐 혼잡" 상태는 몇 백 ms 뒤면 풀리는 경우가 많다)
 *   - 키 내부 재시도 소진 후에도 transient 면 다음 키로 폴백
 *   - 영구 오류(400/401 중 권한 문제가 아닌 것)는 즉시 throw
 *
 * 스트리밍은 최초 request 수립까지만 이 레이어가 감싼다. 스트림 chunk 루프
 * 중간에 터지는 에러는 라우트 쪽 runAttempt 재시도로 처리.
 */
const PER_KEY_RETRIES = 2; // 초기 시도 + 2회 재시도 = 키당 최대 3회
const BACKOFF_MS = [400, 1200]; // attempt 0 실패 후 400ms, attempt 1 실패 후 1200ms

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function withGeminiFallback<T>(
  fn: (ai: GoogleGenAI, keyIndex: number) => Promise<T>,
): Promise<T> {
  const keys = readKeys();
  let lastErr: unknown;
  for (let i = 0; i < keys.length; i++) {
    for (let attempt = 0; attempt <= PER_KEY_RETRIES; attempt++) {
      try {
        return await fn(clientFor(keys[i]), i);
      } catch (e) {
        lastErr = e;
        const transient = isTransient(e);
        if (!transient) throw e;

        const hasMoreAttempts = attempt < PER_KEY_RETRIES;
        const hasNextKey = i < keys.length - 1;
        if (!hasMoreAttempts && !hasNextKey) throw e;

        if (hasMoreAttempts) {
          const wait = BACKOFF_MS[attempt] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
          console.warn(
            `[gemini] key#${i} attempt${attempt + 1} failed (${describeErr(e)}), retrying in ${wait}ms`,
          );
          await sleep(wait);
        } else {
          // 키 내부 재시도 소진 → 다음 키로 폴백
          console.warn(
            `[gemini] key#${i} exhausted (${describeErr(e)}), falling back to key#${i + 1}`,
          );
          break; // attempt 루프 탈출 → 다음 키로
        }
      }
    }
  }
  throw lastErr;
}

function isTransient(e: unknown): boolean {
  const anyE = e as {
    status?: number;
    code?: number;
    message?: string;
    cause?: { code?: string; message?: string };
    name?: string;
  };
  const status = anyE?.status ?? anyE?.code;
  if (status === 429 || (typeof status === "number" && status >= 500))
    return true;
  const causeCode = anyE?.cause?.code ?? "";
  if (/UND_ERR|TIMEOUT|ECONN|ENOTFOUND|EAI_AGAIN/i.test(causeCode)) return true;
  const msg = String(anyE?.message ?? e);
  const causeMsg = String(anyE?.cause?.message ?? "");
  return /429|quota|rate.?limit|5\d\d|invalid.?api.?key|unauthor|permission|timeout|fetch failed|ECONN|headers timeout|socket hang up/i.test(
    msg + " " + causeMsg,
  );
}

function describeErr(e: unknown): string {
  const anyE = e as { status?: number; message?: string };
  if (anyE?.status) return `status=${anyE.status}`;
  return String(anyE?.message ?? e).slice(0, 160);
}

// 모델 ID 는 ./models.ts 의 GEMINI_MODELS 카탈로그에서 관리. 여기서는
// 위에서 re-export 만 수행한다. docs/07-llm-config.md §0 참고.
