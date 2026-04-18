export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // BottomTabBar 는 AppShell 이 렌더. 스크롤은 각 페이지가 담당.
  return <>{children}</>;
}
