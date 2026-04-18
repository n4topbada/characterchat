/**
 * ScrollPage — 프레임 내부에서 페이지가 스스로 스크롤 컨테이너가 되게 한다.
 *   - AppShell 은 overflow-hidden, 내부 h-full 만 넘긴다.
 *   - 각 페이지가 이 래퍼로 감싸면 본인 스크롤이 되고 sticky TopAppBar 가 정상 동작.
 *   - 캐러셀처럼 자체 스크롤이 있는 페이지는 이 래퍼 대신 main 에 h-full 만 주면 된다.
 */
export function ScrollPage({ children }: { children: React.ReactNode }) {
  return <div className="h-full overflow-y-auto">{children}</div>;
}
