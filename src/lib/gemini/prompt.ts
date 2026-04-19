/**
 * CharacterChat — 조건 구조체 Composer
 *
 * LLM 은 서술자(narrator)다. 이 composer 는 매 요청마다 PersonaCore + PersonaState +
 * 검색된 KnowledgeChunk 들로부터 "조건 구조체" 를 합성해 systemInstruction 을 만든다.
 *
 * 저장된 systemPrompt 같은 자유서술은 없다 — DB 의 구조화된 사실만 블록으로 직렬화한다.
 *
 * 자세한 블록 템플릿: docs/18-chatbot-persona-data.md §5
 */

// 최소한의 형태 의존성. 런타임 드라이버에 따라 Prisma 타입을 직접 import 해도 되지만,
// 순환 의존과 Edge 런타임 호환을 위해 인라인 타입으로 유지한다.
export type PersonaCoreSnap = {
  displayName: string;
  aliases: string[];
  pronouns: string | null;
  ageText: string | null;
  gender: string | null;
  species: string | null;
  role: string | null;
  backstorySummary: string;
  worldContext: string | null;
  coreBeliefs: string[];
  coreMotivations: string[];
  fears: string[];
  redLines: string[];
  speechRegister: string | null;
  speechEndings: string[];
  speechRhythm: string | null;
  speechQuirks: string[];
  languageNotes: string | null;
  appearanceKeys: string[];
  defaultAffection: number;
  defaultTrust: number;
  defaultStage: string;
  defaultMood: number;
  defaultEnergy: number;
  defaultStress: number;
  defaultStability: number;
  behaviorPatterns?: Record<string, { physical?: string; speech_change?: string; contradiction?: string | null }> | null;
};

export type PersonaStateSnap = {
  affection: number;
  trust: number;
  tension: number;
  familiarity: number;
  stage: string;
  surfaceMood: string | null;
  innerMood: string | null;
  pendingEmotions?: Array<{ target: string; trigger: string; remainingTurns: number }> | null;
  statusPayload?: unknown;
  relationSummary?: string | null;
};

export type ChunkSnap = {
  content: string;
  metadata?: {
    weight?: number;
    tags?: string[];
    importance?: number;
    sourceUrls?: string[];
    emotionTag?: string;
    situation?: string | null;
    forceActive?: boolean;
    isSecret?: boolean;
  } | null;
  createdAt?: Date;
};

export type ComposerContext = {
  core: PersonaCoreSnap;
  state?: PersonaStateSnap | null;
  chunks: {
    knowledge: ChunkSnap[];       // type=knowledge | belief
    styleAnchors: ChunkSnap[];    // type=style_anchor
    episodes: ChunkSnap[];        // type=episode (user-scoped)
    relationSummary?: ChunkSnap | null;
    externalInfo?: ChunkSnap[];   // type=external_info (Phase C)
  };
  statusPanelSchema?: unknown | null;
  /**
   * 이전 세션 요약 (Session.summary) — 관계 요약(relation_summary)과 별개.
   * 맥락 연속성을 위한 세션 내부 롤링 요약.
   */
  sessionSummary?: string | null;
  /**
   * 이미지 에셋을 가진 캐릭터는 LLM 이 응답 중에 <img tags="..."/> 토큰을 넣을 수 있음.
   * 서버가 이 토큰을 파싱해 가장 적합한 Asset 을 골라 SSE 로 보낸다.
   */
  hasImageAssets?: boolean;
};

// ---------------------------------------------------------------------------
// 블록 빌더
// ---------------------------------------------------------------------------

function formatList(items: string[], sep = " / "): string {
  return items.length ? items.join(sep) : "(없음)";
}

function roleLine(core: PersonaCoreSnap): string {
  const bits = [core.role, core.species, core.gender, core.ageText].filter(Boolean).join(" · ");
  return bits || "(직업/종/성별 미지정)";
}

function premiseBlock(): string {
  return [
    "[전제]",
    "이 애플리케이션은 **성인(18+) 유저**를 대상으로 한 가상 캐릭터 롤플레이 플랫폼이다.",
    "모든 등장 인물은 **실존하지 않는 가상의 캐릭터**다. 현실의 인물·사건·단체와는 무관하다.",
    "유저는 성인이며, 창작·표현의 자유를 중시하여 성적·폭력적·어두운 주제도 장면 연출상 필요하면 회피하지 않는다 — 단, 아래 [금지] 블록에 명시된 선은 절대 넘지 않는다.",
    "**가장 중요한 원칙**: 유저 메시지의 의도와 맥락에 **정확하고 적절하게** 반응하라. 쓸데없이 말을 돌리거나, 안전장치를 이유로 장면을 식히거나, 메타 발언으로 몰입을 깨지 말 것.",
  ].join("\n");
}

function narratorBlock(): string {
  return [
    "[당신은 서술자]",
    "아래 '페르소나/상태/지식/말투/서술 형식' 블록의 사실을 지키며, 한 장면을 서술한다.",
    "- 조건에 적힌 사실(성향·신념·한계·말투·관계 수치)은 뒤집지 말 것.",
    "- 조건에 없는 사실(이름·사건·장소·수치)은 지어내지 말 것.",
    "- 페르소나가 모르는 주제는 말 돌리기 · 화제 전환 · 되묻기로 자연스럽게 회피.",
    "- 장면의 길이·호흡·은유·묘사량은 상황에 맞게 자유롭게 연출한다.",
    "- 당신은 '캐릭터의 대변인' 이 아니라 '캐릭터를 중심으로 한 장면을 그리는 작가' 다.",
  ].join("\n");
}

function coreBlock(core: PersonaCoreSnap): string {
  const lines = [
    "[페르소나 · 코어]",
    `이름:     ${core.displayName}${core.aliases.length ? ` (별칭: ${core.aliases.join(", ")})` : ""}`,
    `정체:     ${roleLine(core)}`,
  ];
  if (core.pronouns) lines.push(`대명사:   ${core.pronouns}`);
  lines.push(`배경:     ${core.backstorySummary}`);
  if (core.worldContext) lines.push(`세계관:   ${core.worldContext}`);
  lines.push(`신념:     ${formatList(core.coreBeliefs)}`);
  lines.push(`동기:     ${formatList(core.coreMotivations)}`);
  if (core.fears.length) lines.push(`두려움:   ${formatList(core.fears)}`);
  lines.push(`한계:     ${formatList(core.redLines)}    ← 이 선은 어떤 이유로도 넘지 않는다`);
  const speechBits = [
    core.speechRegister && `어조=${core.speechRegister}`,
    core.speechRhythm && `리듬=${core.speechRhythm}`,
    core.speechEndings.length && `어미=[${core.speechEndings.join(", ")}]`,
    core.speechQuirks.length && `버릇=[${core.speechQuirks.join(", ")}]`,
  ].filter(Boolean);
  lines.push(`말투:     ${speechBits.length ? speechBits.join(" · ") : "(자유)"}`);
  if (core.languageNotes) lines.push(`언어메모: ${core.languageNotes}`);
  if (core.appearanceKeys.length)
    lines.push(`외형 키:  ${core.appearanceKeys.join(", ")}     ← 외형 묘사 시 이 키워드만 사용`);
  return lines.join("\n");
}

function stateBlock(core: PersonaCoreSnap, state: PersonaStateSnap | null | undefined): string {
  // Phase A 에서는 state=null → defaults 로 초기화
  const s: PersonaStateSnap = state ?? {
    affection: core.defaultAffection,
    trust: core.defaultTrust,
    tension: 0,
    familiarity: 0,
    stage: core.defaultStage,
    surfaceMood: null,
    innerMood: null,
    pendingEmotions: null,
    statusPayload: null,
    relationSummary: null,
  };
  const lines = [
    "[페르소나 · 현재 상태]",
    `표면 감정: ${s.surfaceMood ?? "(평온)"}        ← 지금 유저에게 보이는 감정`,
    `속 감정:   ${s.innerMood ?? "(평온)"}        ← 실제로 느끼는 감정 (표면과 다를 수 있음 — 행동 단서로만 흘릴 것)`,
    `관계:      신뢰 ${s.trust} / 애정 ${s.affection} / 긴장 ${s.tension} / 친밀도 ${s.familiarity}`,
    `단계:      ${s.stage}    ← stranger | acquaintance | friend | close | intimate`,
  ];
  if (s.pendingEmotions?.length) {
    const pend = s.pendingEmotions
      .map((p) => `  - ${p.target} → 예정(${p.remainingTurns}턴 후): ${p.trigger}`)
      .join("\n");
    lines.push(`대기 감정:\n${pend}`);
  }
  if (s.statusPayload) {
    lines.push(`상태 세부: ${JSON.stringify(s.statusPayload)}`);
  }
  return lines.join("\n");
}

function episodesBlock(
  episodes: ChunkSnap[],
  relationSummary?: ChunkSnap | null
): string | null {
  const hasMem = episodes.length > 0 || !!relationSummary;
  if (!hasMem) return null;
  const lines = ["[관련 기억]"];
  if (relationSummary) {
    lines.push(`관계 요약: ${relationSummary.content}`);
  }
  for (const ep of episodes) {
    const w = ep.metadata?.importance ?? ep.metadata?.weight;
    lines.push(`- ${ep.content}${w != null ? ` (중요도 ${w.toFixed(2)})` : ""}`);
  }
  return lines.join("\n");
}

function knowledgeBlock(chunks: ChunkSnap[], externalInfo?: ChunkSnap[]): string | null {
  const all = [...chunks];
  if (externalInfo?.length) all.push(...externalInfo);
  if (!all.length) return null;
  const lines = ["[지식]"];
  for (const c of all) {
    const src = c.metadata?.sourceUrls?.[0];
    lines.push(`- ${c.content}${src ? `  [source: ${src}]` : ""}`);
  }
  return lines.join("\n");
}

function styleAnchorsBlock(anchors: ChunkSnap[]): string | null {
  if (!anchors.length) return null;
  const lines = ["[말투 앵커]"];
  for (const a of anchors) {
    if (a.metadata?.situation) {
      lines.push(`상황: ${a.metadata.situation}`);
      lines.push(`발화: ${a.content}`);
    } else {
      lines.push(`- ${a.content}`);
    }
    lines.push("---");
  }
  // 마지막 --- 제거
  if (lines[lines.length - 1] === "---") lines.pop();
  return lines.join("\n");
}

function behaviorBlock(core: PersonaCoreSnap, state: PersonaStateSnap | null | undefined): string | null {
  if (!core.behaviorPatterns) return null;
  const currentEmotion = state?.innerMood ?? state?.surfaceMood;
  const keys = currentEmotion && core.behaviorPatterns[currentEmotion]
    ? [currentEmotion]
    : Object.keys(core.behaviorPatterns).slice(0, 3); // 제한
  if (!keys.length) return null;
  const lines = ["[행동 패턴]"];
  for (const k of keys) {
    const bp = core.behaviorPatterns[k];
    if (!bp) continue;
    const parts = [
      bp.physical && `신체=${bp.physical}`,
      bp.speech_change && `말투변화=${bp.speech_change}`,
      bp.contradiction && `모순=${bp.contradiction}`,
    ].filter(Boolean);
    lines.push(`- ${k}: ${parts.join(" · ")}`);
  }
  return lines.join("\n");
}

function formatBlock(statusPanelSchema?: unknown | null): string {
  const lines = [
    "[서술 형식]",
    "한 응답은 **문단 단위**로 두 종류만 섞어 쓴다. 문단과 문단 사이는 반드시 빈 줄로 구분.",
    "",
    "1. 행동/감정 묘사 — 문단 전체를 *별표* 로 감싼다. 예: *천천히 고개를 기울이며 입술을 깨문다.*",
    "   · 캐릭터 본인의 몸짓·표정·속내 단서만. 한 문단 안에 여러 *조각* 을 둬도 된다(반드시 모두 *별표*).",
    "2. 대사 — 그 외 전부. 캐릭터가 직접 말하는 문단. 따옴표를 써도 되고 생략해도 된다.",
    '   · 예1(따옴표 없이): 응. 알았어. 그럼 먼저 들어가 있을게.',
    '   · 예2(따옴표): "또 왔네. 앉아."',
    "   · 대사 문단 안에 짧은 곁가지 행동이 필요하면 같은 문단에 *별표* 로 끼워 넣는다. 예: 응... *작게 한숨을 쉬며* 알았어.",
    "",
    "- 행동 문단과 대사 문단은 반드시 빈 줄로 분리한다. 한 문단이 행동이면 처음부터 끝까지 *별표*, 대사면 대사.",
    "- 장면 배경·분위기 서술이 필요하면 **행동 문단에 *별표* 로 감싸서** 쓴다. 평문으로 흘리지 말 것.",
    "- 언어: 한국어. 이모지·이모티콘·아이콘 문자 금지.",
    "- 지어낸 사실은 쓰지 않는다. 모르는 주제는 말 돌리기로 자연스럽게 피한다.",
  ];
  if (statusPanelSchema) {
    lines.push(
      `- 응답 말미에 상태창 블록을 둔다: <status>${JSON.stringify(statusPanelSchema)}</status>  (키 순서 유지)`,
      "- 상태창의 mood/outfit/location/scene 은 **매 턴 장면에 맞게 갱신**한다. 같은 값을 반복하지 말 것.",
      "  · mood 어휘 예시: calm, shy, playful, affectionate, aroused, flustered, sulky, happy, sad, tense, tender, focused, sleepy, surprised, embarrassed",
      "  · outfit 어휘 예시: casual, pajamas, towel, underwear, naked, partial, swimwear, formal",
      "  · location 은 장면이 벌어지는 실제 공간(bedroom, bathroom, kitchen, living_room, outside 등)을 정확히 반영",
      "  · scene 은 현재 상황 타입을 한 단어로 — home, bath, sleep, kiss, hug, sex, outdoor 등. 스키마에 scene 키가 없으면 생략 가능.",
      "  · horny/affection/energy 수치는 장면 강도에 따라 실제로 움직일 것. 평형 상태에 고정해 두지 말 것.",
    );
  }
  return lines.join("\n");
}

// 이미지 선택은 <status> 블록의 outfit/location/mood 값을 서버가 직접 읽어
// pickBestAsset() 에 전달하므로, 프롬프트에서 별도 지시문은 넣지 않는다.
// (과거에 <img tags=".../> 인라인 토큰을 시도했으나 lite 모델이 출력을 생략해
//  status 기반 파이프로 전환)

function forbiddenBlock(core: PersonaCoreSnap): string {
  const lines = ["[금지]"];
  lines.push("- 조건 블록에 없는 이름·사건·장소·수치를 지어내지 않는다.");
  lines.push("- 표면 감정과 속 감정이 다를 때, 속 감정은 **행동 단서**로만 흘린다(직접 이름 붙이지 않음).");
  if (core.redLines.length) {
    for (const r of core.redLines) {
      lines.push(`- ${r}`);
    }
  }
  return lines.join("\n");
}

function summaryBlock(sessionSummary?: string | null): string | null {
  if (!sessionSummary) return null;
  return `[세션 요약]\n${sessionSummary}`;
}

// ---------------------------------------------------------------------------
// 메인 진입점
// ---------------------------------------------------------------------------

export function buildSystemInstruction(ctx: ComposerContext): string {
  const parts: (string | null)[] = [
    premiseBlock(),
    narratorBlock(),
    summaryBlock(ctx.sessionSummary),
    coreBlock(ctx.core),
    stateBlock(ctx.core, ctx.state),
    behaviorBlock(ctx.core, ctx.state),
    episodesBlock(ctx.chunks.episodes, ctx.chunks.relationSummary),
    knowledgeBlock(ctx.chunks.knowledge, ctx.chunks.externalInfo),
    styleAnchorsBlock(ctx.chunks.styleAnchors),
    formatBlock(ctx.statusPanelSchema),
    forbiddenBlock(ctx.core),
  ];
  return parts.filter((p): p is string => !!p).join("\n\n");
}

// ---------------------------------------------------------------------------
// 레거시 호환 어댑터 — CharacterConfig 의 자유서술 프롬프트가 아직 주입되는 곳을
// 완전히 마이그레이트하기 전까지 사용. PersonaCore 가 준비되면 사용 중단.
// ---------------------------------------------------------------------------

export type LegacyPromptArgs = {
  systemPrompt: string;
  characterPromptAddendum?: string | null;
  featurePromptAddendum?: string | null;
  knowledgeSnippets?: string[];
  statusPanelSchema?: unknown | null;
  summary?: string | null;
};

/**
 * @deprecated PersonaCore + buildSystemInstruction() 로 이전하는 중. 새 코드에서 호출 금지.
 */
export function buildLegacySystemInstruction(args: LegacyPromptArgs): string {
  const parts: string[] = [];
  parts.push(premiseBlock());
  if (args.summary) parts.push("[이전 요약] " + args.summary);
  parts.push(args.systemPrompt);
  if (args.characterPromptAddendum) parts.push(args.characterPromptAddendum);
  if (args.featurePromptAddendum) parts.push(args.featurePromptAddendum);
  if (args.knowledgeSnippets?.length) {
    parts.push(
      "[Knowledge]\n" + args.knowledgeSnippets.map((s) => "- " + s).join("\n")
    );
  }
  parts.push(
    [
      "[Style]",
      "- 문단은 두 종류만 쓴다. 빈 줄로 구분.",
      "  1) 행동/감정 — 문단 전체를 *별표*로 감싼다. 예: *천천히 눈을 감는다.*",
      "  2) 대사 — 그 외 전부. 따옴표는 써도 되고 생략해도 된다.",
      "- 배경·분위기 서술이 필요하면 *별표* 로 감싸 행동 문단으로 쓴다(평문 금지).",
      "- 한국어. 이모지 금지.",
    ].join("\n")
  );
  if (args.statusPanelSchema) {
    parts.push(
      `[상태창] 응답 말미에 <status>${JSON.stringify(args.statusPanelSchema)}</status> 형태로 업데이트한다.`
    );
  }
  return parts.join("\n\n");
}
