# 19 · Persona Rules Engine (Phase B/C)

> **전제**  
> LLM 은 **서술자**이고, 룰 엔진은 **회계사**다.  
> 감정 수치·관계 수치·메모리 감쇠 같은 "숫자가 들어간 판정" 은 전부 룰 엔진이 한다.  
> LLM 은 그 숫자를 읽어 서사로 풀어낼 뿐, 숫자를 바꾸지 않는다.

MVP(Phase A) 범위에선 룰 엔진이 비활성이며 `PersonaState` 도 없다. 본 문서는 **Phase B/C** 에서
활성화되는 구성요소의 명세다. 구현 위치:

- `src/lib/persona/rules.ts` — 키워드·패턴 매칭 + 수치 델타 계산
- `src/lib/persona/state.ts` — PersonaState upsert, 감정 전이 큐 처리
- `src/lib/persona/decay.ts` — KnowledgeChunk 감쇠 스케줄러 (Phase C)

---

## 1. Phase B — 관계 수치와 감정 딜레이

### 1-1. 흐름

```
유저 메시지 도착
      ↓
 [extract]   메시지에서 트리거·감정·주제 추출 (룰 + 옵션 LLM 분석 호출)
      ↓
 [match]    extract 결과를 PersonaCore.redLines / eventTypeTemplates / builtin 규칙과 매칭
      ↓
 [delta]    각 매칭의 stateDelta 를 합산 → trust/affection/tension/... 변화량 계산
      ↓
 [apply]    감수성 계수(PersonaCore.*Sensitivity) 곱한 뒤 PersonaState upsert
      ↓
 [emotion]  감정 큐 업데이트:
              - surfaceMood 즉시 변경
              - innerMood 는 emotionalProcessingSpeed 턴 후 전이 (pendingEmotions 에 enqueue)
      ↓
 [episode]  턴을 요약해 KnowledgeChunk(type='episode', userId, sessionId) 로 저장
      ↓
 [prompt]   composer 가 갱신된 state + relevant episodes 로 시스템 인스트럭션 합성
      ↓
 LLM 응답 스트리밍
      ↓
 [post]     LLM 응답을 다시 extract → delta → apply (피드백 루프)
```

### 1-2. 트리거 추출 규칙

```ts
// src/lib/persona/rules.ts
export type TriggerHit = {
  category: "compliment" | "insult" | "threat" | "disclosure" | "intimacy_request"
          | "redline_probe" | "gift" | "topic_shift" | "neutral";
  weight: number;                 // 0~1
  evidence: string;               // 매칭된 텍스트 부분
};

export function extractTriggers(text: string): TriggerHit[] { ... }
```

기본 구현은 **정규식 + 키워드 사전**(Korean + English). 임계 점수 이상이면 LLM 호출로 대체
검증 가능하지만 MVP 는 정규식만. `PersonaCore.redLines` 의 각 항목도 런타임에 regex 로 컴파일해
`redline_probe` 매칭에 사용한다.

### 1-3. 델타 테이블

내장 규칙(`src/lib/persona/deltas.ts`):

| category | trust | affection | tension | familiarity | 비고 |
|---|---|---|---|---|---|
| compliment | +2 | +3 | 0 | +1 | 반복 시 체감 ↓ (아래 감쇠) |
| insult | -8 | -6 | +10 | -2 | redline 포함 시 두 배 |
| threat | -15 | -10 | +25 | -3 | |
| disclosure | +1 | +4 | -3 | +5 | 개인 이야기 공유 |
| intimacy_request | 0 | 0 | +5~+20 | 0 | stage 에 따라 가변 |
| redline_probe | -12 | -15 | +30 | -5 | |
| gift | +3 | +5 | -2 | +2 | |
| topic_shift | 0 | 0 | 0 | 0 | 추적만 |
| neutral | 0 | 0 | -1 | +1 | 턴 진행 자체로 친밀도 소폭 증가 |

**감쇠**: 같은 category 가 N 턴 내 반복되면 (N=5) 가중치 0.5^(중복횟수) 적용. 칭찬 스팸이
관계 수치를 폭등시키는 것을 막는다.

### 1-4. 감정 딜레이 (pendingEmotions)

```ts
type PendingEmotion = {
  target: "innerMood" | "stage";
  toValue: string;                // "hurt" | "trusting" | "close" | ...
  remainingTurns: number;
  trigger: string;                // 유도 이벤트 요약
};
```

- `surfaceMood` 는 매 턴 즉시 갱신 (겉으로 보이는 반응)
- `innerMood` 는 `emotionalProcessingSpeed` 턴 후 전이 (속 감정은 천천히 변함)
- `stage` 는 `familiarity >= 40 && trust >= 30` 등 조건 만족 후 `remainingTurns` 이 0 이 되면 승격
- 매 턴 `remainingTurns--`, 0 이면 적용 후 큐에서 제거
- `innerMood` 전이 조건이 도중에 깨지면 큐에서 제거 (실현 못한 감정)

이 시스템은 LLM 에게 "표면 감정과 속 감정이 다를 수 있음" 을 명시한다(18 §5 `[페르소나 · 현재 상태]`).
LLM 은 속 감정을 직접 이름 붙이지 않고 행동 단서로만 흘려야 한다.

### 1-5. Episode 생성

매 턴 끝에 턴 요약을 `MODELS.chat` (= `gemini-3-flash-preview`, [07-llm-config §0](07-llm-config.md#0-모델-고정-정책-️-do-not-touch)) 으로 1~2 문장으로 압축 →
`KnowledgeChunk(type='episode', userId=?, sessionId=?)` 로 저장. 요약 전용이라고 해서 하위 모델로 내리지 않는다.

```ts
const ep = {
  id: ulid(),
  characterId, userId, sessionId,
  type: 'episode',
  content: summary,                  // "유저가 생일이라고 말했고 캐릭터가 축하함"
  tokens: tokenCount(summary),
  metadata: {
    importance: 0.6,                 // 0~1, redline/강한 감정은 0.8+
    weight:     0.6,
    tags:       ["birthday","celebration"],
    lastAccessedAt: new Date().toISOString(),
    affectDelta: { trust:+2, affection:+3, tension:-2 },
    decayHalfLifeDays: 14,           // Phase C 감쇠
  },
  embedding: await embed(summary),   // 검색 가능하도록
};
```

---

## 2. Phase C — 메모리 감쇠와 외부 정보

### 2-1. 감쇠 수식

에피소드의 "강도" 는 시간이 지나면서 줄어든다. LAYER 1 검색 시 `weight * currentStrength` 를
유사도 점수에 곱해 순위를 조정한다.

```ts
// src/lib/persona/decay.ts
export function currentStrength(c: KnowledgeChunk, now = new Date()): number {
  const m = c.metadata ?? {};
  const importance = m.importance ?? 0.5;
  const halfLife   = m.decayHalfLifeDays ?? 14;
  const createdAt  = c.createdAt.getTime();
  const days       = (now.getTime() - createdAt) / 86400_000;
  return importance * Math.pow(0.5, days / halfLife);
}
```

배치 작업(일 1회 Vercel Cron):

```ts
// 강도가 0.05 미만이 된 episode 는 archived=true 로 metadata 업데이트 (검색 대상에서 제외)
// relation_summary 는 만료되지 않음
```

**anchor 면제**: `metadata.anchor === true` 인 청크는 감쇠 대상에서 제외한다. PersonaCore 의
불변 지식 중 **절대 잊으면 안 되는 것**(예: 캐릭터의 이름, 부모의 사망 시점 등)은 이 플래그를
Caster 가 설정한다.

### 2-2. Relation Summary 롤업

매 20턴 혹은 세션 종료 시:

```ts
const recentEpisodes = await fetchChunks({
  characterId, userId, type: 'episode',
  order: 'createdAt DESC', limit: 20,
});
const summary = await llmSummarize(recentEpisodes.map(e => e.content).join("\n"));
await upsertRelationSummary({ characterId, userId, content: summary });
```

업데이트되는 `relation_summary` 는 **1개만 유지**한다(덮어쓰기). 오래된 에피소드는 감쇠로
사라져도 요약에 녹아 있어 캐릭터의 "장기 기억" 역할을 한다.

### 2-3. External Info (뉴스 에이전트, 선택)

관심사 태그(`PersonaCore.coreMotivations` + `metadata.tags` 히스토리) 에 맞춰 일 1회 Caster 와
동일한 web_search 파이프라인으로 `type='external_info'` 청크 생성. 유저는 캐릭터가 "최근에
무엇을 알게 되었는지" 자연스럽게 서사에서 느끼게 된다.

---

## 3. 구성 예시 — 파일 트리

```
src/lib/persona/
├─ rules.ts           # extractTriggers() + 정규식 사전
├─ deltas.ts          # category → delta 테이블 + 감쇠
├─ state.ts           # upsertPersonaState(), applyDelta(), tickPendingEmotions()
├─ episode.ts         # summarizeTurn(), saveEpisode()
├─ decay.ts           # currentStrength(), runDecayBatch()
├─ retrieve.ts        # LAYER 0/1 검색 (weight + currentStrength 곱)
└─ summary.ts         # relation summary 롤업
```

---

## 4. 테스트 원칙

- 각 카테고리별 델타가 `PersonaCore.*Sensitivity` 에 곱해지는지 단위 테스트.
- `emotionalProcessingSpeed=2` 일 때 감정이 정확히 2턴 후 전이되는지.
- 동일 감정 스팸 시 5턴 내 감쇠 계수가 0.5^k 로 떨어지는지.
- 감쇠 배치 실행 후 `currentStrength(episode) < 0.05` 인 청크만 archived 되는지.
- LLM 서술에서 "표면 감정 ≠ 속 감정" 이 요청된 경우 속 감정 이름을 직접 출력하지 않는지 (프롬프트 주의사항).

---

## 5. 가드레일

| 항목 | 규칙 |
|---|---|
| 수치 상한 | trust/affection/tension/familiarity 모두 -100~+100 또는 0~100 클램프 |
| LLM 의존 | 룰 엔진은 기본 정규식만 쓴다. LLM 은 `episode summary` 에서만 사용 (비용 통제) |
| 감정 큐 상한 | `pendingEmotions.length <= 3`. 넘치면 oldest 드랍 |
| 감쇠 배치 실패 | 실패해도 런타임 검색은 계속 돈다 (`currentStrength` 를 on-the-fly 계산) |
| 유저 요청 | 유저가 "트러스트를 99로 올려줘" 요청해도 룰 엔진은 무시. 서사적으로만 응답 |

---

## 6. Phase 매트릭스

| 기능 | Phase A | Phase B | Phase C |
|---|---|---|---|
| PersonaState 생성 | ✗ | ✓ | ✓ |
| 정규식 extractTriggers | ✗ | ✓ | ✓ |
| delta 테이블 적용 | ✗ | ✓ | ✓ |
| 감정 딜레이 | ✗ | ✓ | ✓ |
| episode 저장 | ✗ | ✓ | ✓ |
| currentStrength 감쇠 | ✗ | ✗ | ✓ |
| relation_summary 롤업 | ✗ | 선택 | ✓ |
| external_info 뉴스 에이전트 | ✗ | ✗ | ✓ |
