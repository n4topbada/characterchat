import { GoogleGenAI } from "@google/genai";

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
 * 호출을 감싸서 transient 오류(quota/429/5xx/invalid_api_key) 시 다음 키로 재시도.
 * 스트리밍은 최초 request 수립까지만 재시도하고, 이후 chunk 루프는 그대로 넘어간다.
 */
export async function withGeminiFallback<T>(
  fn: (ai: GoogleGenAI, keyIndex: number) => Promise<T>,
): Promise<T> {
  const keys = readKeys();
  let lastErr: unknown;
  for (let i = 0; i < keys.length; i++) {
    try {
      return await fn(clientFor(keys[i]), i);
    } catch (e) {
      lastErr = e;
      const transient = isTransient(e);
      const hasNext = i < keys.length - 1;
      if (!transient || !hasNext) throw e;
      console.warn(
        `[gemini] key#${i} failed (${describeErr(e)}), falling back to key#${i + 1}`,
      );
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

export const MODELS = {
  chat: "gemini-2.5-flash-lite",
  image: "gemini-3.1-flash-image-preview",
  embed: "text-embedding-004",
} as const;
