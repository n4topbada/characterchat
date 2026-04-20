import { Ruler, Weight, Ratio, Brain } from "lucide-react";

export type PhysicalStatsInput = {
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

/**
 * 카드/랜딩의 프로필 스탯 박스.
 * 키·몸무게·쓰리사이즈·MBTI 중 값이 있는 것만 2×2 그리드로 노출. 전부 비어 있으면 null.
 * Archive 스타일에 맞춰 얇은 바이올릭 라인 + mono 캡션.
 */
export function PhysicalStats({ stats }: { stats: PhysicalStatsInput }) {
  const items: Array<{
    key: string;
    label: string;
    value: string;
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  }> = [];
  if (stats.heightCm != null) {
    items.push({ key: "h", label: "HEIGHT", value: `${stats.heightCm} cm`, Icon: Ruler });
  }
  if (stats.weightKg != null) {
    items.push({ key: "w", label: "WEIGHT", value: `${stats.weightKg} kg`, Icon: Weight });
  }
  if (stats.threeSize && stats.threeSize.trim().length > 0) {
    items.push({ key: "3s", label: "B-W-H", value: stats.threeSize, Icon: Ratio });
  }
  if (stats.mbti && stats.mbti.trim().length > 0) {
    items.push({ key: "m", label: "MBTI", value: stats.mbti.toUpperCase(), Icon: Brain });
  }
  if (items.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {items.map(({ key, label, value, Icon }) => (
        <div
          key={key}
          className="flex items-center gap-2 p-2.5 bg-surface-container-low border-l-2 border-primary/40"
        >
          <Icon size={14} strokeWidth={2} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="label-mono text-outline text-[9px] leading-tight">{label}</p>
            <p className="text-on-surface text-xs font-bold tracking-tight truncate">
              {value}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
