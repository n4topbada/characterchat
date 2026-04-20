import { TabPager } from "@/components/layout/TabPager";

export default function TabsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // BottomTabBar 는 AppShell 이 렌더. 스크롤은 각 페이지가 담당.
  // TabPager 가 좌우 플릭 제스처를 인접 탭 경로로 치환한다.
  return <TabPager>{children}</TabPager>;
}
