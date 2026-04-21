/**
 * Next/Image 최적화 우회 판정.
 *
 * dev 환경의 `/_next/image` 옵티마이저는 cold-start 가 수백 ms 걸리기도 하고,
 * 일부 모바일 브라우저(특히 iOS Safari) 는 지연되거나 실패한 응답을 "broken
 * image" 상태로 캐시해 버려 사용자가 'picture-emoji' 만 보고 리로드 해도
 * 그대로 고착되는 증상이 재현된다.
 *
 * 아래 경로들은 옵티마이저가 해줄 일이 거의 없으므로 `unoptimized` 로 직송한다:
 *   - animated webp (`/portraits/ani/*`) : 최적화 시 정지 프레임으로 바뀜
 *   - 로컬 public 으로 이미 적정 크기로 서빙되는 캐릭터 에셋
 *     (`/characters/*`, `/portraits/*`, `/brand/*`)
 *   - Vercel Blob 상의 에셋 (`*.public.blob.vercel-storage.com/*`)
 *     — 우리는 업로드 시 sharp 로 이미 적절한 해상도/webp 로 변환해 저장하므로
 *       `/_next/image` 경유로 얻을 이득이 작고, 반대로 옵티마이저 실패 시
 *       "그림이모지" 고착이 훨씬 큰 UX 손해. 원격 호스팅 특유의 cold-start
 *       지연이 모바일 Safari 에서 broken-image 로 잡히는 사례가 보고됨.
 */
const LOCAL_PUBLIC_RE =
  /^\/(characters|portraits|brand)\//;
const ANIMATED_PORTRAIT_RE = /\/portraits\/ani\//;
const VERCEL_BLOB_RE = /^https?:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//;

export function shouldBypassImageOptimizer(url: string | null | undefined): boolean {
  if (!url) return false;
  if (ANIMATED_PORTRAIT_RE.test(url)) return true;
  if (LOCAL_PUBLIC_RE.test(url)) return true;
  if (VERCEL_BLOB_RE.test(url)) return true;
  return false;
}
