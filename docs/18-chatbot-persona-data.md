# 18 · Chatbot Persona Data — 4축 × DB 매핑

> **전제**  
> 이 프로젝트의 챗봇은 **LLM이 페르소나를 "발명"하지 않는다**.  
> DB가 캐릭터의 상태·지식·말투·관계를 **사실로** 공급하고,  
> **LLM은 서술자(narrator)로서** 그 사실을 풍부한 서사적 문장으로 풀어낸다.  
> LLM 은 번역기가 아니다 — 연출·묘사·리듬·장면 전환을 맡는 "작가"다.  
> 전체 철학은 [persona_vectordb_architecture.md](../persona_vectordb_architecture.md) 참고.

---

## 1. 설계 원칙 요약

| 원칙 | 내용 |
|---|---|
| 역할 분리 | DB = 사실·상태의 원천 / 룰 엔진 = 수치 변화·전이 판정 / **LLM = 서술자**(사실을 서사로 변환하는 작가) |
| 서술 자유 vs 사실 준수 | LLM 은 **묘사·감정 표현·문장 리듬·장면 구성**을 자유롭게 연출한다. 단, DB 가 준 사실(설정·상태·관계 수치·말투 앵커)은 뒤집지 않는다. |
| 불변 vs 가변 | 코어(성향·화법·한계)는 불변, 관계·감정·기억은 실시간 upsert |
| 모름 명시 | DB에 없는 정보는 조건 구조체에 "페르소나는 이 정보를 알지 못함"으로 명시 → LLM 은 지어내지 않고 서사적으로 회피한다(말 돌리기·화제 전환·질문되돌리기) |
| 소형 LLM 없음 | 수치 판단은 룰 엔진, 서사는 총괄 LLM |

---

## 2. 4축과 DB 매핑

사용자 요구(정보 / 지식 / 말투 / 기분·상태)를 페르소나 아키텍처의 저장소에 다음과 같이 매핑한다.

| 축 | 의미 | 불변/가변 | 저장 위치 | 주 사용 |
|---|---|---|---|---|
| **정보** | 캐릭터 자신에 대한 사실(이름·배경·직업·외모·관계망) | 불변 | `PersonaCore` + `KnowledgeChunk(type=knowledge, anchor=true)` | LAYER 0 Force-Active |
| **지식** | 캐릭터가 알고 있는 세계·주제 (RAG) | 반불변 (관리자 수정 O) | `KnowledgeChunk(type=knowledge)` | LAYER 1 복합 검색 |
| **말투** | 화법 원칙 + 감정별 발화 샘플 | 불변 | `PersonaCore.speechPattern` + `KnowledgeChunk(type=style_anchor)` | LAYER 0 Force-Active (few-shot) |
| **기분·상태** | 현재 감정·에너지·스트레스·사용자와의 관계 수치 | 완전 가변 | `PersonaState` (user × character 쌍) | LAYER 0 Force-Active |

### 4축 간 상호작용
- **정보**는 응답의 정확성 보장 (지어내기 차단).
- **지식**은 대화 주제를 따라 동적으로 주입.
- **말투**는 모든 턴에 강제 주입 (few-shot).
- **기분·상태**는 같은 사용자와의 1:1 관계에 누적, 다른 사용자에게는 독립 상태.

---

## 3. Phase 로드맵

페르소나 아키텍처 전체(룰 엔진·감정지연·기억감쇠·뉴스 에이전트)는 MVP 단계에 모두 담지 않는다.

### Phase A — M1.5 (Caster 가능 + 기본 Chat 품질)
필수 데이터 축: **정보 / 지식 / 말투**. 기분은 "기본값 고정"으로만 주입.
- `PersonaCore` 테이블 신설 (1:1 Character)
- `KnowledgeChunk.type`: `knowledge`, `style_anchor`
- Chat pipeline에 "조건 구조체 합성" 도입
- Caster가 coverage % 계산용 필드를 모두 채움

### Phase B — M3 (가변 상태 + 관계)
추가 축: **기분·상태**.
- `PersonaState` 신설 (`userId × characterId` unique)
- `KnowledgeChunk.type`: `episode`, `belief`, `relation_summary`
- 룰 엔진 (이벤트 키워드 매칭) → [docs/19-persona-rules-engine.md](19-persona-rules-engine.md) 예정
- 감정 지연 (surface_state)

### Phase C — M5 (장기 서사)
- 기억 감쇠(`current_strength` + `decay_rate`) 배치
- 관계 요약본 자동 생성
- `external_info` + 뉴스 에이전트 (관심사 태그)
- Cascading query (LAYER 2)

---

## 4. Prisma 스키마 확장 (Phase A 기준)

기존 `Character`, `CharacterConfig`, `KnowledgeDoc`, `KnowledgeChunk`는 유지하고 다음을 추가/변경한다.

### 4-1. `PersonaCore` 신설
```prisma
model PersonaCore {
  characterId              String   @id
  // --- 정보 축 (기본 서술) ---
  disposition              String   @db.Text    // 근본 성향
  selfPerception           String   @db.Text    // 자기인식 (실제와 불일치 가능)
  bio                      String   @db.Text    // 공개 프로필 (이름/직업/배경)
  // --- 한계 ---
  hardLimits               String[]             // 절대 하지 않는 행동
  // --- 말투 축 ---
  speechPattern            String   @db.Text    // 화법 서술
  // --- 감수성 (룰 엔진용, Phase B에서 본격 사용) ---
  trustSensitivity         Float    @default(1.0)
  sentimentSensitivity     Float    @default(1.0)
  stressSensitivity        Float    @default(1.0)
  moodSensitivity          Float    @default(1.0)
  // --- 감정 처리 ---
  emotionalProcessingSpeed Int      @default(2) // 씬 단위
  emotionalVolatility      Float    @default(0.5)
  // --- 기본 상태 (PersonaState 초기화 시 사용) ---
  defaultMood              Float    @default(0.0)
  defaultEnergy            Float    @default(0.7)
  defaultStress            Float    @default(0.3)
  defaultStability         Float    @default(0.7)
  // --- 행동 패턴 (감정별) ---
  // { "joy": {physical, speech_change, contradiction}, "anger": {...}, ... }
  behaviorPatterns         Json
  // --- 관심사 태그 (Phase C) ---
  interests                Json?

  character                Character @relation(fields:[characterId], references:[id], onDelete: Cascade)
  updatedAt                DateTime  @updatedAt
}
```

### 4-2. `KnowledgeChunk` 확장
기존 스키마에 `type` + `metadata` + (Phase B) 감쇠·비밀 필드를 추가한다.

```prisma
enum ChunkType {
  knowledge         // 페르소나 고유 지식 (정보 + 지식 축)
  style_anchor      // 말투 축: 상황-반응 few-shot
  episode           // Phase B: 사건 기억 (user-scoped)
  belief            // Phase B: 대상 인식
  relation_summary  // Phase B: 관계 요약본
  external_info     // Phase C: 뉴스 에이전트 공급
}

model KnowledgeChunk {
  id              String     @id
  docId           String?    // knowledge/external_info에서 연결, 나머지는 null
  characterId     String
  userId          String?    // Phase B: episode/belief/relation_summary은 user 스코프
  type            ChunkType  @default(knowledge)
  ordinal         Int
  content         String     @db.Text
  tokens          Int

  // 공통 메타데이터
  tags            String[]
  anchor          Boolean    @default(false)   // true면 감쇠 면제
  isSecret        Boolean    @default(false)   // Caster 시드용 여부와 별개, 캐릭터가 숨기는 지식
  shareableWith   String[]                     // 빈 배열 = 모두 공유 가능

  // type별 메타
  triggerKeywords String[]                     // knowledge: 발화 점수 계산용
  urgency         String?                      // knowledge: high|medium|low
  emotionTag      String?                      // style_anchor: joy/anger/…
  forceActive     Boolean    @default(false)   // style_anchor: LAYER 0 강제 주입 여부

  // Phase B (감쇠 + affect)
  importance      Float?                       // episode 생성 시 부여 (0~1)
  currentStrength Float?                       // importance에서 감쇠로 내려감
  decayRate       Float?
  affectDelta     Json?                        // episode가 관계에 미친 영향 {trust, sentiment, mood, stress}

  timestamp       DateTime   @default(now())

  doc             KnowledgeDoc? @relation(fields:[docId], references:[id], onDelete: SetNull)
  character       Character     @relation(fields:[characterId], references:[id], onDelete: Cascade)

  @@index([characterId, type])
  @@index([characterId, userId, type])
  @@index([docId, ordinal])
}
```

`embedding vector(768)`은 여전히 raw SQL 마이그레이션으로 추가 (기존 0002 유지).

### 4-3. `PersonaState` 신설 (Phase B, 선행 예약)
```prisma
model PersonaState {
  id                    String   @id
  userId                String
  characterId           String
  // --- 내부 상태 ---
  mood                  Float    @default(0.0)
  energy                Float    @default(0.7)
  stress                Float    @default(0.3)
  stability             Float    @default(0.7)
  arousal               Float    @default(0.4)
  motivation            Float    @default(0.5)
  confidence            Float    @default(0.5)
  // --- 감정 현재 ---
  emotionCurrent        String   @default("neutral")
  emotionIntensity      Float    @default(0.0)
  emotionPending        String?
  emotionDelayRemaining Int      @default(0)
  surfaceState          String   @default("normal")  // normal|processing|suppressed
  // --- 인지 ---
  curiosity             Float    @default(0.5)
  suspicionGeneral      Float    @default(0.2)
  // --- 관계 수치 (user 한 명과의) ---
  trust                 Float    @default(0.5)
  sentiment             Float    @default(0.0)
  familiarity           Float    @default(0.0)
  powerDynamic          Float    @default(0.0)
  dependency            Float    @default(0.0)
  rivalry               Float    @default(0.0)
  suspicion             Float    @default(0.0)
  // --- 메타 ---
  lastInteractionAt     DateTime @default(now())
  updatedAt             DateTime @updatedAt

  user                  User      @relation(fields:[userId], references:[id], onDelete: Cascade)
  character             Character @relation(fields:[characterId], references:[id], onDelete: Cascade)

  @@unique([userId, characterId])
  @@index([userId, characterId])
}
```

### 4-4. `CharacterConfig`의 재정의
페르소나가 `PersonaCore` + `PersonaState` + `KnowledgeChunk` 로 완전히 구조화되므로,
**`CharacterConfig` 의 자유서술 프롬프트 필드는 제거**되었다.

- **제거됨**: `systemPrompt`, `characterPromptAddendum`, `featurePromptAddendum`
  → 모든 페르소나·말투·한계·지식은 구조화된 필드에서 합성된다.
  → 자유서술이 남아 있으면 Caster/관리자/룬타임 세 주체가 같은 내용을 중복 편집할 위험이 크다.
- **유지됨**: `model`, `temperature`, `topP`, `topK`, `maxOutputTokens`, `greeting`, `statusPanelSchema`, `safetyJson`
  → 이들은 "어떤 LLM 을 어떻게 호출할지"에 대한 생성 파라미터이므로 페르소나와 분리된 채 남긴다.
- **대체**: 시스템 프롬프트는 매 요청마다 [`src/lib/gemini/prompt.ts`](../src/lib/gemini/prompt.ts) 의 composer 가
  `PersonaCore` + `PersonaState` + 검색된 `KnowledgeChunk` 로부터 **조건 구조체** 형태로 동적 합성한다(§5).

---

## 5. 조건 구조체 합성 — Chat Pipeline 통합

`src/lib/gemini/prompt.ts` 의 composer 가 매 턴마다 아래 구조로 **조건**만 공급한다.
조건을 어떻게 **서사**로 풀어낼지는 LLM(서술자) 의 몫이다 — 묘사·행동·대사·장면의 호흡은
여기서 지시하지 않는다. DB 가 준 사실을 뒤집지만 않으면 된다.

```
[당신은 서술자]
아래 '조건' 블록의 사실을 지키며, {persona.name} 의 행동·대사·상황을 한 장면으로 서술한다.
- 조건에 적힌 사실은 뒤집지 말 것(성향·한계·말투·관계 수치).
- 조건에 없는 사실은 지어내지 말 것. 페르소나가 모르는 주제는 말 돌리기·화제 전환·되묻기로 자연스럽게 회피.
- 장면의 길이·호흡·은유·묘사량은 상황에 맞게 자유롭게 연출한다.

[페르소나 · 코어]
이름:   {core.displayName}  ({core.aliases 나열})
성향:   {core.disposition}
자기인식: {core.selfPerception}
신념:    {core.coreBeliefs.join(" / ")}
한계:    {core.redLines.join(" / ")}          ← 이 선을 넘는 행동·발화 금지
말투:    {core.speechRegister} | 리듬={core.speechRhythm} | 어미=[{core.speechEndings}] | 버릇=[{core.speechQuirks}]
외형 키: {core.appearanceKeys.join(", ")}      ← 외형 묘사 시 이 키워드만 사용

[페르소나 · 현재 상태]     ← Phase B 부터 채워진다. Phase A 에서는 core.default* 로 고정.
표면 감정: {state.surfaceMood}                 ← 방금 보이는 것
속 감정:   {state.innerMood}                   ← 실제로 느끼는 것 (표면과 다를 수 있음)
관계:     신뢰 {trust} / 애정 {affection} / 긴장 {tension} / 친밀도 {familiarity}
단계:     {state.stage}                        ← stranger | acquaintance | friend | close | intimate
상태 세부:{state.statusPayload}                ← statusPanelSchema 에 맞춰 직렬화

[관련 기억]                                    ← LAYER 1 (Phase B 부터 의미 있음)
- {episode1.content}  (중요도 {importance}, 최근성 {lastAccessedAt})
- {episode2.content}
- {relation_summary.content}

[지식]                                         ← LAYER 1 (RAG top-k, knowledge + belief)
- {chunk1.content}                             ← 출처가 있으면 [source: url] 주석
- {chunk2.content}

[말투 앵커]                                    ← LAYER 0, style_anchor few-shot
상황: {anchor1.situation}
발화: {anchor1.content}
---
상황: {anchor2.situation}
발화: {anchor2.content}

[서술 형식]
- 행동·상태 묘사는 *별표 사이*에 둔다 (예: *그녀가 고개를 기울였다*).
- 대사는 일반 텍스트로 따옴표 없이.
- 언어: 한국어. 이모지 금지. 아이콘 문자 금지.
- 상태창이 활성화된 경우 응답 말미에 <status>{…statusPanelSchema…}</status> 블록 1개를 남긴다.

[금지]
- 조건 블록에 없는 이름·사건·장소·수치를 지어내지 않는다.
- red_lines 항목은 어떤 이유로도 수행하지 않는다.
- 표면 감정과 속 감정이 다를 때, 속 감정은 **행동 단서**로만 흘린다(직접 이름 붙이지 않음).
```

Phase A 에서는 `PersonaState` 가 없으므로 "페르소나 · 현재 상태" 섹션은 `PersonaCore.default*` 로 대체
주입(즉 관계는 "처음 만나는 사람 · stranger")한다. 이 경우에도 블록 구조 자체는 같다 — LLM 이
"상태가 비어 있음"을 느끼지 않도록 항상 같은 템플릿으로 채운다.

---

## 6. 벡터 검색 전략

### Phase A — 단순 2-레이어
- **LAYER 0 (Force-Active, 매 턴 고정)**: `PersonaCore` 전체 + `style_anchor where forceActive=true` 최상위 3개.
- **LAYER 1 (질의 기반)**: 사용자 마지막 메시지를 embedding → `KnowledgeChunk where type=knowledge and characterId=?` top-5.

### Phase B — 복합 조건 추가
- LAYER 1에 `episode/belief where userId=? and characterId=?` 병합.
- 키워드 + 대상 조합 필터.

### Phase C — Cascading
- LAYER 1 결과 텍스트로 2차 쿼리 (연상).
- 능동 발화 점수 계산 → 임계값 이상이면 `is_secret` 고려하며 자발적 언급 허용.

---

## 7. 저장 플로우 (Caster → 챗봇)

Caster가 최종 커밋 시 다음 데이터가 한 트랜잭션으로 생성된다:

```
Character
  ├ CharacterConfig  (모델·온도·greeting·safety)
  ├ PersonaCore       (불변 코어 + 행동 패턴)
  ├ Asset (portrait)
  └ KnowledgeDoc (×N)
      └ KnowledgeChunk (type=knowledge | style_anchor, embedding vector(768))
```

Phase B에서는 사용자가 캐릭터를 처음 열 때 `PersonaState`가 `PersonaCore.default*` 값으로 자동 생성된다 (`@@unique([userId, characterId])`).

---

## 8. 검증 지표

문서가 구현되었을 때 다음이 만족되면 Phase A 완료:

- [ ] 관리자가 Caster로 캐릭터 1명 등록 시 `PersonaCore` + ≥8개 `knowledge` 청크 + ≥3개 `style_anchor` 청크가 생성된다.
- [ ] 채팅 시 system instruction에 `PersonaCore` 전체 + top-5 knowledge + top-3 style_anchor가 포함된다.
- [ ] DB에 없는 주제(캐릭터가 모르는 것)를 물으면 페르소나가 "모른다"고 응답한다.
- [ ] 같은 캐릭터라도 `style_anchor`의 emotionTag가 "joy"인 것과 "anger"인 것을 시스템 프롬프트에 나눠 주입했을 때 말투 차이가 관찰된다.

Phase B는 `PersonaState`가 쌓이며 같은 사용자가 재방문할 때 이전 대화의 `sentiment`/`trust`/`mood`가 응답 톤에 반영되는 것으로 검증한다.
