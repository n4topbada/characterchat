/**
 * 카드·디테일·히스토리에서 공통으로 쓰는 캐릭터 표시용 헬퍼.
 *
 * - `mergeIntro`  : tagline + backstorySummary 를 `", "` 로 잇는다.
 * - `deriveShortTags` : PersonaCore.shortTags 가 비어 있을 때의 폴백
 *   (role 의 마지막 토큰 + species(≠인간) + MBTI).
 *
 * UI 파일에 흩어지면 일관성이 깨지므로 한 곳에서만 관리.
 */

/**
 * tagline + backstorySummary 를 하나의 intro 문자열로 결합.
 *   - tagline 뒤의 . ! ? 같은 종결부호는 제거 후 ", " 로 이어 붙인다.
 *   - backstorySummary 가 없거나 비어 있으면 tagline 단독.
 */
export function mergeIntro(
  tagline: string,
  backstory?: string | null,
): string {
  const t = tagline.trim().replace(/[.!?。\s]+$/u, "");
  const b = (backstory ?? "").trim();
  if (!b) return t;
  return `${t}, ${b}`;
}

/**
 * PersonaCore.shortTags 가 비어 있는 경우 폴백.
 *   role 의 "마지막 핵심 단어" + (species != 인간) + MBTI 로 구성.
 *   role 문장은 길 수 있으나 카드 1줄 태그에 쓰기엔 대개 마지막 토큰이 직함/역할.
 */
export function deriveShortTags(core: {
  role?: string | null;
  species?: string | null;
  mbti?: string | null;
}): string[] {
  const out: string[] = [];
  if (core.role) {
    const tokens = core.role.split(/[\s·,/]+/).filter(Boolean);
    const last = tokens[tokens.length - 1];
    if (last) out.push(last);
  }
  if (core.species && core.species.trim() && core.species.trim() !== "인간") {
    out.push(core.species.trim());
  }
  if (core.mbti && core.mbti.trim()) out.push(core.mbti.trim().toUpperCase());
  return out;
}
