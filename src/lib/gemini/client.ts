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

/**
 * 업스트림(Gemini) 실패를 사용자에게 보여 줄 한글 메시지 + 원인 태그로 분류한다.
 *
 * 목적:
 *   - 라우트마다 "5\d\d|overload|unavailable|..." 정규식을 복붙하던 걸 한 곳에.
 *   - 실제 상태 코드를 사용자에게도 노출해서 "자주 나오는데 정말 503 맞아?"
 *     같은 의문에 답할 수 있게 한다 ("모델 서버가 잠시 혼잡해요 (503). ...").
 *   - 503/429/네트워크 실패를 구분해서 "혼잡" vs "레이트리밋" vs "네트워크"
 *     각각 다른 안내를 낼 수 있게 한다.
 *
 * 반환:
 *   - message: 사용자 UI 에 그대로 렌더할 한글 문장
 *   - kind: 로그/텔레메트리용 분류 태그
 *   - status: 원인이 된 HTTP 상태 (없으면 null) — 디버그 콘솔에 찍을 때 씀
 */
export function classifyUpstreamError(err: unknown): {
  message: string;
  kind: "upstream_busy" | "rate_limit" | "network" | "auth" | "unknown";
  status: number | null;
} {
  const anyE = err as {
    status?: number;
    code?: number;
    message?: string;
    cause?: { code?: string; message?: string };
  };
  const status =
    typeof anyE?.status === "number"
      ? anyE.status
      : typeof anyE?.code === "number"
        ? anyE.code
        : null;
  const msg = String(anyE?.message ?? err);
  const causeCode = String(anyE?.cause?.code ?? "");
  const causeMsg = String(anyE?.cause?.message ?? "");
  const all = `${msg} ${causeCode} ${causeMsg}`;

  // 429 - Gemini 분단위/분당 레이트리밋. 재시도해도 잠깐은 계속 막힌다.
  if (status === 429 || /\b429\b|quota|rate.?limit/i.test(all)) {
    return {
      message: `요청이 너무 빨라 모델이 잠시 쉬는 중입니다 (429). 잠시 후 다시 시도해 주세요.`,
      kind: "rate_limit",
      status: status ?? 429,
    };
  }

  // 5xx - 업스트림 서버 혼잡. 보통 몇 초 뒤면 풀림.
  if ((typeof status === "number" && status >= 500 && status < 600) ||
      /overload|unavailable|\b5\d\d\b/i.test(msg)) {
    const code = status ?? 503;
    return {
      message: `모델 서버가 잠시 혼잡해요 (${code}). 잠깐 뒤에 다시 시도해 주세요.`,
      kind: "upstream_busy",
      status: code,
    };
  }

  // 네트워크 계열 - DNS/TLS/소켓. 우리 쪽 네트워크 문제일 수도 있고, 업스트림 엣지 문제일 수도.
  if (
    /UND_ERR|TIMEOUT|ECONN|ENOTFOUND|EAI_AGAIN|fetch failed|headers timeout|socket hang up/i.test(
      all,
    )
  ) {
    return {
      message: `모델 서버까지 연결하지 못했어요. 네트워크 문제일 수 있으니 잠깐 뒤에 다시 시도해 주세요.`,
      kind: "network",
      status: status,
    };
  }

  // 인증 - API 키 잘못됨/만료. 재시도로는 풀리지 않음.
  if (status === 401 || status === 403 || /invalid.?api.?key|unauthor|permission/i.test(all)) {
    return {
      message: `모델 서버 인증에 실패했어요. 관리자에게 알려 주세요.`,
      kind: "auth",
      status: status,
    };
  }

  return {
    message: msg || "모델 응답을 받지 못했어요.",
    kind: "unknown",
    status: status,
  };
}

// 모델 ID 는 ./models.ts 의 GEMINI_MODELS 카탈로그에서 관리. 여기서는
// 위에서 re-export 만 수행한다. docs/07-llm-config.md §0 참고.
