/**
 * Next/Image 최적화 우회 판정.
 *
 * dev 환경의 `/_next/image` 옵티마이저는 cold-start 가 수백 ms 걸리기도 하고,
 * 일부 모바일 브라우저(특히 iOS Safari) 는 지연되거나 실패한 응답을 "broken
 * image" 상태로 캐시해 버려 사용자가 'picture-emoji' 만 보고 리로드 해도
 * 그대로 고착되는 증상이 재현된다.
 *
 * 다음 두 부류는 옵티마이저가 해줄 일이 없으므로 `unoptimized` 로 직송한다:
 *   - animated webp (`/portraits/ani/*`) : 최적화 시 정지 프레임으로 바뀜
 *   - 로컬 public 으로 이미 적정 크기로 서빙되는 캐릭터 에셋
 *     (`/characters/*`, `/portraits/*`, `/brand/*`)
 *
 * Vercel Blob 등 원격 URL 은 그대로 옵티마이저 경유 (리사이즈 이득이 큼).
 */
const LOCAL_PUBLIC_RE =
  /^\/(characters|portraits|brand)\//;
const ANIMATED_PORTRAIT_RE = /\/portraits\/ani\//;

export function shouldBypassImageOptimizer(url: string | null | undefined): boolean {
  if (!url) return false;
  if (ANIMATED_PORTRAIT_RE.test(url)) return true;
  if (LOCAL_PUBLIC_RE.test(url)) return true;
  return false;
}
