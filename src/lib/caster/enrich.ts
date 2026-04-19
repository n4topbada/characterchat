// 검색 소스 URI 에서 OG/Twitter 이미지 한 장을 긁어온다.
// - 세션 중 UI 에만 쓰이는 "비주얼 레퍼런스" 용이다. DB 에 저장하지 않는다.
// - 절대 실패하지 않는다 (실패 시 null 반환).
// - 5초 타임아웃. text/html 아닌 응답은 스킵.
// - 상대/프로토콜 생략 경로를 절대 URL 로 정규화.

const TIMEOUT_MS = 5000;
const MAX_BYTES = 200_000; // HTML head 만 필요하므로 200KB 로 제한
const MAX_IMAGE_BYTES = 4_000_000; // 4MB 제한. Gemini inlineData 크기 방어

const META_REGEXPS: RegExp[] = [
  // property=".." ... content=".."
  /<meta\s+[^>]*?property=["'](og:image(?::secure_url)?|twitter:image(?::src)?)["'][^>]*?content=["']([^"']+)["']/i,
  // content=".." ... property=".."
  /<meta\s+[^>]*?content=["']([^"']+)["'][^>]*?property=["'](og:image(?::secure_url)?|twitter:image(?::src)?)["']/i,
  // name=".." ... content=".." (Twitter cards often use name=)
  /<meta\s+[^>]*?name=["'](twitter:image(?::src)?|og:image)["'][^>]*?content=["']([^"']+)["']/i,
  // content=".." ... name=".."
  /<meta\s+[^>]*?content=["']([^"']+)["'][^>]*?name=["'](twitter:image(?::src)?|og:image)["']/i,
  // <link rel="image_src" href="..">
  /<link\s+[^>]*?rel=["']image_src["'][^>]*?href=["']([^"']+)["']/i,
];

function pickFirstMatch(html: string): string | null {
  for (const re of META_REGEXPS) {
    const m = html.match(re);
    if (!m) continue;
    // 그룹 중 URL 같은 걸 찾는다 (http/https/// 시작 또는 / 경로)
    for (let i = m.length - 1; i >= 1; i--) {
      const g = m[i];
      if (g && /^(https?:)?\/\//i.test(g)) return g;
      if (g && g.startsWith("/")) return g;
    }
  }
  return null;
}

function absolutize(raw: string, base: string): string | null {
  try {
    if (/^https?:\/\//i.test(raw)) return raw;
    if (raw.startsWith("//")) return "https:" + raw;
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/**
 * 주어진 페이지 URL 에서 대표 이미지(og:image / twitter:image / link image_src) 를 추출.
 * 실패/타임아웃은 조용히 null.
 */
export async function fetchOgImage(uri: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(uri, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; CasterBot/1.0; +https://characterchat.local)",
        accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") ?? "";
    if (!ct.toLowerCase().includes("html")) return null;

    // HTML head 만 필요하므로 바이트 수 제한 (대형 페이지 대비)
    const reader = resp.body?.getReader();
    if (!reader) return null;
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let html = "";
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      html += decoder.decode(value, { stream: true });
      if (total >= MAX_BYTES) break;
      if (/<\/head\s*>/i.test(html)) break;
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }

    const raw = pickFirstMatch(html);
    if (!raw) return null;
    const finalUrl = resp.url || uri;
    return absolutize(raw, finalUrl);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 이미지 URL 을 Gemini inlineData 로 쓰기 위해 {mimeType, base64} 형태로 받아온다.
 * - 4MB 초과 시 null (Gemini 요청 크기 방어).
 * - 이미지가 아닌 응답(HTML 등) 은 null.
 * - 실패/타임아웃은 조용히 null.
 */
export async function fetchInlineImage(
  uri: string,
): Promise<{ mimeType: string; data: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const resp = await fetch(uri, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; CasterBot/1.0; +https://characterchat.local)",
        accept: "image/*",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!resp.ok) return null;
    const ctRaw = resp.headers.get("content-type") ?? "";
    const mimeType = ctRaw.split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("image/")) return null;

    // content-length 가 있으면 먼저 체크
    const cl = resp.headers.get("content-length");
    if (cl && Number(cl) > MAX_IMAGE_BYTES) return null;

    const buf = Buffer.from(await resp.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) return null;
    return { mimeType, data: buf.toString("base64") };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
