import { Cake, Ruler, Weight, Ratio, Brain } from "lucide-react";

export type PhysicalStatsInput = {
  ageText?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

/**
 * 카드/랜딩의 프로필 스탯 박스 — 초슬림 1줄 버전.
 *
 * 유저 요청: "스테이터스 박스 세로폭 축소. 나이도 스테이터스 박스로 이전."
 *   → 기존 2×2 그리드 (각 셀 세로로 라벨+값 스택) 대신, 값이 있는 것만
 *     가로 flex 로 흘리고, 각 셀은 아이콘 + 값만(라벨 text 생략) 컴팩트하게.
 *
 * 라벨은 aria-label 로만 남겨 접근성을 유지. 시각적으론 "아이콘 + 값" 2요소로만
 * 1~2 줄 안에 수렴한다.
 */
export function PhysicalStats({ stats }: { stats: PhysicalStatsInput }) {
  const items: Array<{
    key: string;
    label: string;
    value: string;
    Icon: React.ComponentType<{
      size?: number;
      strokeWidth?: number;
      className?: string;
    }>;
  }> = [];
  if (stats.ageText && stats.ageText.trim().length > 0) {
    items.push({ key: "a", label: "AGE", value: stats.ageText.trim(), Icon: Cake });
  }
  if (stats.heightCm != null) {
    items.push({ key: "h", label: "HEIGHT", value: `${stats.heightCm}cm`, Icon: Ruler });
  }
  if (stats.weightKg != null) {
    items.push({ key: "w", label: "WEIGHT", value: `${stats.weightKg}kg`, Icon: Weight });
  }
  if (stats.threeSize && stats.threeSize.trim().length > 0) {
    items.push({ key: "3s", label: "B-W-H", value: stats.threeSize, Icon: Ratio });
  }
  if (stats.mbti && stats.mbti.trim().length > 0) {
    items.push({ key: "m", label: "MBTI", value: stats.mbti.toUpperCase(), Icon: Brain });
  }
  if (items.length === 0) return null;

  return (
    <ul
      aria-label="캐릭터 스탯"
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border-l-2 border-primary/40 pl-2 py-1"
    >
      {items.map(({ key, label, value, Icon }, i) => (
        <li
          key={key}
          aria-label={`${label} ${value}`}
          className="flex items-center gap-1 text-on-surface"
        >
          <Icon size={11} strokeWidth={2} className="text-primary/70 shrink-0" />
          <span className="text-[11px] font-bold tracking-tight leading-none whitespace-nowrap">
            {value}
          </span>
          {i < items.length - 1 && (
            <span
              aria-hidden
              className="text-outline/60 text-[10px] leading-none ml-1"
            >
              ·
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
