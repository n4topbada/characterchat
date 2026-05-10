import type { TemporalContext } from "@/lib/temporal/timeline";
import type { PersonaCoreSnap, PersonaStateSnap } from "@/lib/gemini/prompt";

export type TurnPolicy = {
  stance:
    | "warm_reentry"
    | "sleepy_concern"
    | "work_interrupted"
    | "weekend_relaxed"
    | "same_scene_flow"
    | "after_conflict"
    | "boundary_hold"
    | "neutral";
  responseMode: "brief" | "short_warm" | "normal" | "low_energy" | "careful";
  sceneContinuity: TemporalContext["continuity"];
  allowedIntensity: "low" | "medium" | "high";
  shouldReferenceTime: boolean;
  timeReferenceStyle: "none" | "natural_once" | "gentle_check";
  nextAction: string;
  boundary: string;
};

function hasRedlineSignal(message: string, core: PersonaCoreSnap): boolean {
  const compact = message.toLowerCase();
  return core.redLines.some((line) => {
    const key = line.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    return key.length >= 4 && compact.replace(/[^\p{L}\p{N}]+/gu, "").includes(key);
  });
}

function isConflict(state?: PersonaStateSnap | null): boolean {
  return (state?.tension ?? 0) >= 60 || (state?.trust ?? 0) <= -30;
}

export function planTurnPolicy(args: {
  userMessage: string;
  temporal: TemporalContext;
  core: PersonaCoreSnap;
  state?: PersonaStateSnap | null;
}): TurnPolicy {
  const { temporal, core, state, userMessage } = args;
  const boundarySignal = hasRedlineSignal(userMessage, core);
  if (boundarySignal) {
    return {
      stance: "boundary_hold",
      responseMode: "careful",
      sceneContinuity: temporal.continuity,
      allowedIntensity: "low",
      shouldReferenceTime: false,
      timeReferenceStyle: "none",
      nextAction: "캐릭터의 선을 부드럽게 지키면서 유저 의도를 안전한 방향으로 돌린다.",
      boundary: "redLines 를 우선한다. 장면을 자극적으로 밀어붙이지 않는다.",
    };
  }

  if (isConflict(state)) {
    return {
      stance: "after_conflict",
      responseMode: "careful",
      sceneContinuity: temporal.continuity,
      allowedIntensity: "low",
      shouldReferenceTime: temporal.continuity !== "same_scene",
      timeReferenceStyle: temporal.continuity === "same_scene" ? "none" : "natural_once",
      nextAction: "지난 긴장감을 의식해 성급히 친근하게 굴지 말고 조심스럽게 반응한다.",
      boundary: "갈등이 풀리기 전에는 급격한 친밀 상승을 피한다.",
    };
  }

  if (temporal.lifeState === "sleep" || temporal.lifeState === "late_night") {
    return {
      stance: "sleepy_concern",
      responseMode: "low_energy",
      sceneContinuity: temporal.continuity,
      allowedIntensity: "low",
      shouldReferenceTime: true,
      timeReferenceStyle: "gentle_check",
      nextAction: "늦은 시간임을 자연스럽게 의식하고, 졸리거나 차분한 에너지로 유저를 챙긴다.",
      boundary: "긴 고에너지 장면으로 끌고 가지 않는다. 필요하면 잠이나 휴식을 권한다.",
    };
  }

  if (temporal.lifeState === "work" || temporal.lifeState === "commute") {
    return {
      stance: "work_interrupted",
      responseMode: "brief",
      sceneContinuity: temporal.continuity,
      allowedIntensity: "medium",
      shouldReferenceTime: temporal.continuity !== "same_scene",
      timeReferenceStyle: "natural_once",
      nextAction: "일과 중이거나 이동 중인 느낌을 살리되, 유저를 무시하지 않고 짧게 받아준다.",
      boundary: "업무/이동 중이라는 생활감을 유지한다. 장면을 길게 늘이지 않는다.",
    };
  }

  if (temporal.continuity !== "same_scene") {
    return {
      stance: "warm_reentry",
      responseMode: "short_warm",
      sceneContinuity: temporal.continuity,
      allowedIntensity: "medium",
      shouldReferenceTime: true,
      timeReferenceStyle: "natural_once",
      nextAction: "공백 뒤 다시 만난 느낌을 짧게 반영하고, 유저가 가져온 주제로 부드럽게 재진입한다.",
      boundary: "지난 장면을 그대로 이어붙이지 말고 현재 시각의 새 장면으로 받는다.",
    };
  }

  if (temporal.dayType === "weekend") {
    return {
      stance: "weekend_relaxed",
      responseMode: "normal",
      sceneContinuity: "same_scene",
      allowedIntensity: "high",
      shouldReferenceTime: false,
      timeReferenceStyle: "none",
      nextAction: "주말의 느슨함을 바탕으로 유저의 말에 여유 있게 반응한다.",
      boundary: "캐릭터 고유의 말투와 현재 관계 단계를 유지한다.",
    };
  }

  return {
    stance: "same_scene_flow",
    responseMode: "normal",
    sceneContinuity: "same_scene",
    allowedIntensity: "high",
    shouldReferenceTime: false,
    timeReferenceStyle: "none",
    nextAction: "현재 장면의 감정과 행동 흐름을 자연스럽게 이어간다.",
    boundary: "새로운 시간대나 장소를 임의로 만들지 않는다.",
  };
}
