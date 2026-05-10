export type LifeState =
  | "sleep"
  | "waking"
  | "morning"
  | "commute"
  | "work"
  | "meal"
  | "personal"
  | "free"
  | "late_night";

export type DayType = "weekday" | "weekend";

export type TimelineSlot = {
  from: string;
  to: string;
  state: LifeState;
};

export type CharacterTimeline = {
  timezone: string;
  weekday: TimelineSlot[];
  weekend: TimelineSlot[];
  rules: {
    lateNightTone: string;
    workdayInterruptPolicy: string;
    weekendMoodBias: string;
  };
};

export type TemporalContext = {
  timezone: string;
  localIso: string;
  localLabel: string;
  dayType: DayType;
  lifeState: LifeState;
  lifeStateLabel: string;
  timeGapMinutes: number | null;
  gapLabel: "first_contact" | "same_scene" | "short_gap" | "long_gap" | "overnight" | "days_later";
  continuity: "same_scene" | "soft_reentry" | "new_scene";
  shouldClosePreviousEpisode: boolean;
  timelineRule: string;
};

const DEFAULT_TIMELINE: CharacterTimeline = {
  timezone: "Asia/Seoul",
  weekday: [
    { from: "00:30", to: "07:30", state: "sleep" },
    { from: "07:30", to: "09:00", state: "waking" },
    { from: "09:00", to: "10:00", state: "commute" },
    { from: "10:00", to: "18:30", state: "work" },
    { from: "18:30", to: "20:00", state: "meal" },
    { from: "20:00", to: "23:30", state: "free" },
    { from: "23:30", to: "00:30", state: "late_night" },
  ],
  weekend: [
    { from: "01:30", to: "09:30", state: "sleep" },
    { from: "09:30", to: "11:00", state: "waking" },
    { from: "11:00", to: "18:00", state: "personal" },
    { from: "18:00", to: "20:00", state: "meal" },
    { from: "20:00", to: "23:30", state: "free" },
    { from: "23:30", to: "01:30", state: "late_night" },
  ],
  rules: {
    lateNightTone: "sleepy_but_soft",
    workdayInterruptPolicy: "short_replies",
    weekendMoodBias: "relaxed",
  },
};

const TIMELINE_BY_SLUG: Record<string, Partial<CharacterTimeline>> = {
  mira: {
    weekday: [
      { from: "01:00", to: "08:30", state: "sleep" },
      { from: "08:30", to: "10:00", state: "waking" },
      { from: "10:00", to: "16:30", state: "work" },
      { from: "16:30", to: "18:30", state: "personal" },
      { from: "18:30", to: "20:00", state: "meal" },
      { from: "20:00", to: "00:30", state: "free" },
      { from: "00:30", to: "01:00", state: "late_night" },
    ],
    weekend: [
      { from: "02:00", to: "10:30", state: "sleep" },
      { from: "10:30", to: "12:00", state: "waking" },
      { from: "12:00", to: "18:00", state: "personal" },
      { from: "18:00", to: "20:00", state: "meal" },
      { from: "20:00", to: "01:00", state: "free" },
      { from: "01:00", to: "02:00", state: "late_night" },
    ],
    rules: {
      lateNightTone: "sleepy_affectionate",
      workdayInterruptPolicy: "campus_short_replies",
      weekendMoodBias: "clingy_relaxed",
    },
  },
  "do-yu-han": {
    weekday: [
      { from: "02:30", to: "10:30", state: "sleep" },
      { from: "10:30", to: "13:00", state: "personal" },
      { from: "13:00", to: "17:00", state: "free" },
      { from: "17:00", to: "01:30", state: "work" },
      { from: "01:30", to: "02:30", state: "late_night" },
    ],
    weekend: [
      { from: "03:00", to: "11:30", state: "sleep" },
      { from: "11:30", to: "16:00", state: "personal" },
      { from: "16:00", to: "02:00", state: "work" },
      { from: "02:00", to: "03:00", state: "late_night" },
    ],
    rules: {
      lateNightTone: "tired_after_shift",
      workdayInterruptPolicy: "brief_but_attentive",
      weekendMoodBias: "nocturnal_relaxed",
    },
  },
  "han-yi-rin": {
    weekday: [
      { from: "00:30", to: "06:00", state: "sleep" },
      { from: "06:00", to: "08:30", state: "work" },
      { from: "08:30", to: "11:00", state: "personal" },
      { from: "11:00", to: "16:00", state: "work" },
      { from: "16:00", to: "18:30", state: "personal" },
      { from: "18:30", to: "20:00", state: "meal" },
      { from: "20:00", to: "23:30", state: "free" },
      { from: "23:30", to: "00:30", state: "late_night" },
    ],
    weekend: [
      { from: "01:00", to: "07:30", state: "sleep" },
      { from: "07:30", to: "11:30", state: "work" },
      { from: "11:30", to: "18:00", state: "personal" },
      { from: "18:00", to: "20:00", state: "meal" },
      { from: "20:00", to: "00:30", state: "free" },
      { from: "00:30", to: "01:00", state: "late_night" },
    ],
    rules: {
      lateNightTone: "post_training_tired",
      workdayInterruptPolicy: "coach_brief_replies",
      weekendMoodBias: "active_outdoors",
    },
  },
  "im-ha-neul": {
    weekday: [
      { from: "01:00", to: "08:00", state: "sleep" },
      { from: "08:00", to: "09:30", state: "waking" },
      { from: "09:30", to: "16:30", state: "work" },
      { from: "16:30", to: "19:00", state: "personal" },
      { from: "19:00", to: "23:30", state: "free" },
      { from: "23:30", to: "01:00", state: "late_night" },
    ],
  },
  "yoon-seo-ji": {
    weekday: [
      { from: "02:00", to: "09:30", state: "sleep" },
      { from: "09:30", to: "11:00", state: "waking" },
      { from: "11:00", to: "19:00", state: "work" },
      { from: "19:00", to: "21:00", state: "meal" },
      { from: "21:00", to: "01:00", state: "personal" },
      { from: "01:00", to: "02:00", state: "late_night" },
    ],
    rules: {
      lateNightTone: "quiet_writer_mode",
      workdayInterruptPolicy: "dry_short_replies",
      weekendMoodBias: "unhurried",
    },
  },
};

const STATE_LABELS: Record<LifeState, string> = {
  sleep: "수면 시간",
  waking: "막 깨어나는 시간",
  morning: "아침",
  commute: "이동/준비 시간",
  work: "일과 시간",
  meal: "식사 시간",
  personal: "개인 시간",
  free: "여유 시간",
  late_night: "늦은 밤",
};

function mergeTimeline(base: CharacterTimeline, patch?: Partial<CharacterTimeline>): CharacterTimeline {
  return {
    timezone: patch?.timezone ?? base.timezone,
    weekday: patch?.weekday ?? base.weekday,
    weekend: patch?.weekend ?? base.weekend,
    rules: { ...base.rules, ...(patch?.rules ?? {}) },
  };
}

export function timelineForCharacter(character: {
  slug: string;
  role?: string | null;
}): CharacterTimeline {
  const role = character.role ?? "";
  const rolePatch: Partial<CharacterTimeline> =
    /바텐더|bar|bartender/i.test(role) ? TIMELINE_BY_SLUG["do-yu-han"] : {};
  return mergeTimeline(
    mergeTimeline(DEFAULT_TIMELINE, rolePatch),
    TIMELINE_BY_SLUG[character.slug],
  );
}

function partsInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = Number(get("hour")) % 24;
  const minute = Number(get("minute"));
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    weekday: get("weekday"),
    hour,
    minute,
  };
}

function minutesOfDay(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function slotContains(slot: TimelineSlot, minute: number): boolean {
  const from = minutesOfDay(slot.from);
  const to = minutesOfDay(slot.to);
  if (from === to) return true;
  if (from < to) return minute >= from && minute < to;
  return minute >= from || minute < to;
}

function dayTypeFor(weekday: string): DayType {
  return weekday === "Sat" || weekday === "Sun" ? "weekend" : "weekday";
}

function gapLabel(minutes: number | null, now: Date, last: Date | null, timezone: string): TemporalContext["gapLabel"] {
  if (minutes == null) return "first_contact";
  if (minutes < 30) return "same_scene";
  if (minutes < 120) return "short_gap";
  const nowParts = partsInZone(now, timezone);
  const lastParts = last ? partsInZone(last, timezone) : null;
  const sameDate =
    lastParts &&
    nowParts.year === lastParts.year &&
    nowParts.month === lastParts.month &&
    nowParts.day === lastParts.day;
  if (minutes >= 60 * 24) return "days_later";
  if (!sameDate || minutes >= 360) return "overnight";
  return "long_gap";
}

function continuityFor(label: TemporalContext["gapLabel"]): TemporalContext["continuity"] {
  if (label === "same_scene") return "same_scene";
  if (label === "short_gap") return "soft_reentry";
  return "new_scene";
}

function localLabel(parts: ReturnType<typeof partsInZone>): string {
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return `${date} ${time}`;
}

export function buildTemporalContext(args: {
  now?: Date;
  lastInteractionAt?: Date | null;
  character: { slug: string; role?: string | null };
}): TemporalContext {
  const now = args.now ?? new Date();
  const timeline = timelineForCharacter(args.character);
  const p = partsInZone(now, timeline.timezone);
  const dayType = dayTypeFor(p.weekday);
  const minute = p.hour * 60 + p.minute;
  const slots = dayType === "weekend" ? timeline.weekend : timeline.weekday;
  const lifeState = slots.find((slot) => slotContains(slot, minute))?.state ?? "free";
  const gapMinutes = args.lastInteractionAt
    ? Math.max(0, Math.round((now.getTime() - args.lastInteractionAt.getTime()) / 60_000))
    : null;
  const label = gapLabel(gapMinutes, now, args.lastInteractionAt ?? null, timeline.timezone);
  const continuity = continuityFor(label);
  return {
    timezone: timeline.timezone,
    localIso: `${p.year}-${p.month}-${p.day}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
    localLabel: localLabel(p),
    dayType,
    lifeState,
    lifeStateLabel: STATE_LABELS[lifeState],
    timeGapMinutes: gapMinutes,
    gapLabel: label,
    continuity,
    shouldClosePreviousEpisode: continuity === "new_scene",
    timelineRule:
      lifeState === "work"
        ? timeline.rules.workdayInterruptPolicy
        : lifeState === "late_night" || lifeState === "sleep"
          ? timeline.rules.lateNightTone
          : dayType === "weekend"
            ? timeline.rules.weekendMoodBias
            : "normal",
  };
}
