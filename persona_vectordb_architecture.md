# 페르소나 벡터 DB 에이전트 아키텍처 설계서

> **목표**  
> LLM 없이 캐릭터성을 저장·발현할 수 있는 페르소나 시스템.  
> 다중 사용자 및 다중 에이전트와의 관계성을 영속 관리하며,  
> 단일 총괄 LLM이 서사/대화를 최종 생성하는 구조.

---

## 1. 핵심 원칙

### 1-1. 역할 분리

| 레이어 | 담당 | 역할 |
|--------|------|------|
| 페르소나 DB | 무엇을 알고, 느끼고, 기억하는가 | 정보의 유일한 원천 |
| 룰 엔진 | 수치 변화량 계산, 이벤트 등급 결정 | 판단 로직 |
| 총괄 LLM | 그것을 어떻게 말하고 서술하는가 | 표현 도구 (번역기) |

**페르소나의 지식·판단·기억은 반드시 페르소나 DB에서 출발해야 한다.**  
총괄 LLM은 DB 출력을 자연어로 변환하는 번역기이며, 정보를 자체 생성해서는 안 된다.  
LLM이 DB에 없는 정보로 페르소나를 서술하는 순간 페르소나가 아니라 LLM이 말하는 것이다.  
소형 LLM은 이 시스템에 존재하지 않는다. 판단은 룰 엔진이, 서술은 총괄 LLM이 담당한다.

### 1-2. 불변 코어 vs 가변 상태

| 구분 | 내용 | 변경 가능성 |
|------|------|------------|
| 불변 코어 | 근본 성향, 가치관, 화법, 행동 범위, 감수성 계수, 자기인식 | 없음 |
| 가변 상태 | 관계 수치, 감정 상태, mood, 에피소드 기억 디테일 | 실시간 upsert |

페르소나는 나이를 먹지 않는다. 근본 성향은 변하지 않는다.  
관계는 변하고, 기억은 흐려지고, 감정은 흔들리지만 코어는 불변이다.

### 1-3. 지식 출처 3분류

| 분류 | 출처 | 처리 방식 |
|------|------|----------|
| 인류 공통 상식 | LLM 기본 지식 | 모든 페르소나 공유, DB 불필요 |
| 페르소나 고유 지식 | 페르소나 DB | 명시적 저장 필수 |
| 실시간·시사 정보 | 뉴스 에이전트 | 관심도 필터 + 인지 딜레이 후 upsert |

---

## 2. DB 구성

페르소나 1개 = 문서 DB 1개 + 벡터 DB 1개.

### 2-1. 문서 DB (수치·상태 관리)

수치 연산, 상태 비교, 관계 수치 업데이트를 담당한다.  
시맨틱 검색에 적합하지 않은 수치형 데이터를 처리한다.

```json
{
  "persona_id": "string",

  "core": {
    "disposition":                "string (근본 성향 서술)",
    "hard_limits":                ["절대 하지 않는 행동 목록"],
    "speech_pattern":             "string (화법 서술)",
    "self_perception":            "string (자기 자신을 어떻게 보는가 - 실제와 불일치 가능)",
    "emotional_processing_speed": 0,
    "emotional_volatility":       0.0,

    "sensitivity": {
      "trust_sensitivity":      0.0,
      "sentiment_sensitivity":  0.0,
      "stress_sensitivity":     0.0,
      "mood_sensitivity":       0.0
    },

    "state_defaults": {
      "trust":       0.0,
      "sentiment":   0.0,
      "familiarity": 0.0,
      "mood":        0.0,
      "energy":      0.0,
      "stress":      0.0,
      "stability":   0.0
    }
  },

  "behavior_patterns": {
    "[emotion_key]": {
      "physical":      "string (신체 습관, 표정)",
      "speech_change": "string (발화 변화)",
      "contradiction": "string (말과 행동의 불일치 - 없으면 null)"
    }
  },

  "internal_state": {
    "mood":                    0.0,
    "energy":                  0.0,
    "stress":                  0.0,
    "stability":               0.0,
    "arousal":                 0.0,
    "motivation":              0.0,
    "confidence":              0.0,
    "emotion_current":         "string",
    "emotion_intensity":       0.0,
    "emotion_pending":         "string (지연 중인 감정 - 없으면 null)",
    "emotion_delay_remaining": 0,
    "surface_state":           "normal | processing | suppressed"
  },

  "cognitive_state": {
    "curiosity":         0.0,
    "suspicion_general": 0.0,
    "last_updated":      "datetime"
  },

  "relations": {
    "[target_id]": {
      "trust":            0.0,
      "sentiment":        0.0,
      "familiarity":      0.0,
      "power_dynamic":    0.0,
      "dependency":       0.0,
      "rivalry":          0.0,
      "suspicion":        0.0,
      "last_interaction": "datetime",
      "last_updated":     "datetime"
    }
  }
}
```

### 2-2. 벡터 DB (기억·지식·표현 패턴)

시맨틱 검색이 필요한 모든 텍스트 정보를 저장한다.  
모든 청크는 `type` 메타데이터로 분류되어 쿼리 필터링에 사용된다.

#### 타입 분류

| type | 내용 | 감쇠 |
|------|------|------|
| episode | 사건·대화 기억 | 있음 |
| belief | 대상에 대한 인식·해석 | 있음 (느림) |
| knowledge | 페르소나 고유 지식 | 없음 |
| style_anchor | 발화·행동 패턴 few-shot | 없음 |
| relation_summary | 관계 요약본 | 없음 |
| external_info | 뉴스 에이전트 공급 정보 | 있음 (빠름) |

#### 에피소드 청크 스키마
```json
{
  "text": "string (압축 요약된 사건 서술)",
  "metadata": {
    "type":             "episode",
    "persona":          "string",
    "target":           "string (없으면 null)",
    "affect_delta": {
      "trust":     0.0,
      "sentiment": 0.0,
      "mood":      0.0,
      "stress":    0.0
    },
    "importance":       0.0,
    "initial_strength": 0.0,
    "current_strength": 0.0,
    "decay_rate":       0.0,
    "anchor":           false,
    "timestamp":        "datetime",
    "tags":             ["string"]
  }
}
```

#### 고유 지식 청크 스키마
```json
{
  "text": "string",
  "metadata": {
    "type":               "knowledge",
    "persona":            "string",
    "trigger_keywords":   ["string"],
    "trigger_conditions": ["string"],
    "urgency":            "high | medium | low",
    "is_secret":          false,
    "shareable_with":     ["target_id"]
  }
}
```

#### 발화·행동 패턴 청크 스키마 (style_anchor)
```json
{
  "text": "string (상황-반응 few-shot 예시 묶음)",
  "metadata": {
    "type":         "style_anchor",
    "persona":      "string",
    "emotion_tag":  "string",
    "force_active": true
  }
}
```

#### 관계 요약본 스키마
```json
{
  "text": "string (관계 전체를 자연어로 압축 서술)",
  "metadata": {
    "type":         "relation_summary",
    "persona":      "string",
    "target":       "string",
    "generated_at": "datetime"
  }
}
```

---

## 3. 공통 수치 척도

모든 페르소나에 동일하게 적용되는 객관적 해석 기준이다.  
수치 해석은 공통 고정이며, 해당 상태에서의 행동·발화 표현은 페르소나 DB에 저장된다.

### 3-1. 관계 수치

#### trust (신뢰도)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.2 | 적대적, 정보 차단 |
| 0.2 ~ 0.4 | 경계, 최소한의 교류 |
| 0.4 ~ 0.6 | 중립, 조건부 협력 |
| 0.6 ~ 0.8 | 우호적, 자발적 협력 |
| 0.8 ~ 1.0 | 신뢰, 정보 공유 |

#### sentiment (감정색)
| 범위 | 해석 |
|------|------|
| -1.0 ~ -0.6 | 혐오 |
| -0.6 ~ -0.2 | 불쾌, 거부감 |
| -0.2 ~ +0.2 | 무감정, 중립 |
| +0.2 ~ +0.6 | 호감 |
| +0.6 ~ +1.0 | 애정, 강한 유대 |

#### familiarity (친밀도)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.2 | 완전히 낯섦 |
| 0.2 ~ 0.4 | 아는 사람 |
| 0.4 ~ 0.6 | 어느 정도 아는 사이 |
| 0.6 ~ 0.8 | 친숙한 사이 |
| 0.8 ~ 1.0 | 매우 친밀 |

#### power_dynamic (권력 관계)
| 범위 | 해석 |
|------|------|
| -1.0 ~ -0.5 | 강한 종속, 복종 |
| -0.5 ~ -0.1 | 약간 아래 |
| -0.1 ~ +0.1 | 대등 |
| +0.1 ~ +0.5 | 약간 우위 |
| +0.5 ~ +1.0 | 강한 우위, 지배 |

#### dependency (의존도)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 독립적 |
| 0.3 ~ 0.6 | 부분적 의존 |
| 0.6 ~ 1.0 | 강한 의존 |

#### rivalry (경쟁심)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 없음 |
| 0.3 ~ 0.6 | 의식함 |
| 0.6 ~ 1.0 | 강한 경쟁의식 |

#### suspicion (의심도, 대상별)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 없음 |
| 0.3 ~ 0.6 | 주의 |
| 0.6 ~ 1.0 | 강한 의심, 경계 |

### 3-2. 내부 상태 수치

#### mood (기분 - 중기 기저 상태, 일 단위 변화)
| 범위 | 해석 |
|------|------|
| -1.0 ~ -0.6 | 매우 우울, 무기력 |
| -0.6 ~ -0.2 | 가라앉음, 부정적 |
| -0.2 ~ +0.2 | 보통 |
| +0.2 ~ +0.6 | 긍정적 |
| +0.6 ~ +1.0 | 매우 고조, 들뜸 |

> mood는 emotion의 기저를 형성한다.  
> mood 우울 + emotion 기쁜 일 발생 → 기쁘지만 어딘가 공허한 반응.

#### emotion (현재 감정 - 단기, 씬 단위 변화)

`emotion_current`: 텍스트 레이블  
`emotion_intensity` (0.0~1.0): 강도  
`emotion_pending`: CRITICAL 이벤트 후 지연 중인 감정  
`emotion_delay_remaining` (정수, 씬 카운터): 표출까지 남은 씬 수  
`surface_state`:
- `normal`: emotion_current 그대로 서술
- `processing`: CRITICAL 직후, 멍함·정지·무표정으로 서술
- `suppressed`: 코어 억압 성향으로 감정 은폐, contradiction 패턴으로 서술

#### energy (체력·피로도)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 고갈, 판단력 저하 |
| 0.3 ~ 0.6 | 저하, 여유 없음 |
| 0.6 ~ 0.8 | 보통 |
| 0.8 ~ 1.0 | 충분 |

#### stress (스트레스 누적)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 낮음 |
| 0.3 ~ 0.6 | 누적 중 |
| 0.6 ~ 0.8 | 높음, 반응 날카로워짐 |
| 0.8 ~ 1.0 | 임계, 폭발 가능 |

#### stability (감정 안정도)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 불안정, 감정 기복 큼 |
| 0.3 ~ 0.6 | 보통 |
| 0.6 ~ 1.0 | 안정적 |

#### arousal (각성 수준)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 이완, 졸림 |
| 0.3 ~ 0.6 | 보통 |
| 0.6 ~ 1.0 | 각성, 긴장 |

#### motivation (동기 수준)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 의욕 없음 |
| 0.3 ~ 0.6 | 보통 |
| 0.6 ~ 1.0 | 강한 동기 |

### 3-3. 인지 수치

#### confidence (자기 확신도)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 불확실, 자기 의심 |
| 0.3 ~ 0.6 | 보통 |
| 0.6 ~ 1.0 | 강한 확신 |

#### curiosity (호기심)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 무관심 |
| 0.3 ~ 0.6 | 약간 흥미 |
| 0.6 ~ 1.0 | 강한 호기심 |

#### suspicion_general (전반적 의심 수준)
| 범위 | 해석 |
|------|------|
| 0.0 ~ 0.3 | 낮음, 개방적 |
| 0.3 ~ 0.6 | 보통 |
| 0.6 ~ 1.0 | 높음, 경계적 |

---

## 4. 수치 변화량 계산 (룰 엔진)

소형 LLM 없이 순수 규칙으로만 처리한다.  
수치 변화량은 세 레이어의 곱으로 결정된다.

### 4-1. 이벤트 타입 테이블 (시스템 공통)

```
배신 확인       → trust: -0.40, sentiment: -0.20
거짓말 발각     → trust: -0.15, sentiment: -0.10
비밀 폭로       → trust: -0.30, stress: +0.20
고백 (긍정)     → sentiment: +0.25, familiarity: +0.10
위험 감수       → trust: +0.20, sentiment: +0.15
약속 이행       → trust: +0.10
약속 파기       → trust: -0.20
반복적 무시     → sentiment: -0.05, familiarity: -0.03
칭찬            → sentiment: +0.05, mood: +0.03
모욕            → sentiment: -0.15, stress: +0.10
일상 대화       → familiarity: +0.01
```

이벤트 타입 테이블은 시스템 초기화 시 정의되며 운영 중 추가 가능하다.

### 4-2. 감수성 계수 (코어에 저장, 불변)

같은 이벤트라도 캐릭터마다 받아들이는 강도가 다르다.

```
최종 delta = base_delta × 해당 수치의 sensitivity
```

### 4-3. 현재 수치 기반 delta_modifier

```
delta_modifier = 1.0 + (current_value - 0.5)

trust 0.9 → modifier 1.4  (높은 신뢰에서의 배신은 낙차가 큼)
trust 0.2 → modifier 0.7  (이미 낮아서 덜 떨어짐)
trust 0.5 → modifier 1.0  (중립)
```

### 4-4. 최종 delta 계산

```
최종 delta = base_delta × sensitivity × delta_modifier

경계값 처리: 모든 수치는 정의된 min/max 내로 클램핑
  trust, familiarity, dependency, rivalry, suspicion: 0.0 ~ 1.0
  sentiment, power_dynamic: -1.0 ~ 1.0
  mood: -1.0 ~ 1.0
  energy, stress, stability, arousal, motivation, confidence, curiosity: 0.0 ~ 1.0
```

### 4-5. 이벤트 감지

```
1단계: 키워드 패턴 매칭
  대화·서사 텍스트에서 이벤트 타입 테이블 키워드 탐색
  매칭 성공 → 이벤트 타입 및 등급 결정

2단계: 매칭 실패 시
  MINOR 처리 (안전한 기본값, 수치 변화 없음)
```

애매한 케이스는 MINOR로 처리한다. 잘못 분류되는 것보다 놓치는 것이 안전하다.

### 4-6. 이벤트 등급

| 등급 | 조건 | 처리 |
|------|------|------|
| CRITICAL | trust 또는 sentiment 절대값 delta ≥ 0.2 | 즉시 upsert + 감정 지연 처리 |
| MODERATE | delta < 0.2, 수치 변화 있음 | 씬 종료 시 일괄 upsert |
| MINOR | 수치 변화 없음 | 배치 처리 또는 무시 |

---

## 5. 감정 지연 처리

### 5-1. 원리

CRITICAL 이벤트 발생 시 감정은 즉각 표출되지 않는다.  
DB의 상태값이 LLM에게 "지금 이 캐릭터는 어떤 상태인가"를 전달한다.  
LLM은 그 상태를 서술할 뿐이다. 지연 제어는 DB 상태값이 담당한다.

### 5-2. 처리 흐름

```
CRITICAL 이벤트 발생
  ↓
DB 즉시 upsert:
  emotion_pending:         "배신감, 분노"  (발생한 감정)
  emotion_delay_remaining: core.emotional_processing_speed 값
  surface_state:           "processing"
  (emotion_current는 아직 변경하지 않음)
  ↓
조건 구조체 합성:
  surface_state = "processing"
  → LLM은 멍함·정지·무표정을 서술
  ↓
씬 종료마다:
  emotion_delay_remaining -= 1
  ↓
emotion_delay_remaining = 0:
  emotion_current ← emotion_pending 값으로 교체
  emotion_pending ← null
  surface_state ← "normal" 또는 "suppressed" (코어 억압 성향 여부)
  ↓
이후 씬부터 실제 감정이 서술에 반영됨
```

### 5-3. surface_state별 서술 지침

`normal`: emotion_current 그대로 서술  
`processing`: 감정 표출 없음, 신체 반응과 정지만 서술  
`suppressed`: behavior_patterns의 contradiction 필드 참조, 겉으로는 다른 상태 서술

`core.emotional_processing_speed`: 불변 설정값 (씬 단위 정수).  
빠른 캐릭터 1~2씬, 느린 캐릭터 3~5씬.

---

## 6. 기억 감쇠 시스템

### 6-1. 원칙

- 불변 코어: 감쇠 없음
- 에피소드 기억: 시간과 중요도에 따라 감쇠
- 관계 수치: 기억이 흐려져도 수치 영향은 잔류
- anchor = true: 감쇠 없음 (결정적 사건)

기억이 소실되어도 수치가 잔류한다는 것의 의미:  
배신당한 기억이 소실되어도 trust 수치는 여전히 낮다.  
페르소나는 왜인지 모르지만 본능적으로 경계한다.

### 6-2. 감쇠 함수

```
current_strength = importance × e^(-decay_rate × days)
```

#### decay_rate 설정 기준

| importance | 사건 성격 | decay_rate |
|------------|----------|------------|
| 0.9 ~ 1.0 | 인생 결정적 사건 | anchor = true |
| 0.7 ~ 0.9 | 강한 감정 사건 | 0.001 ~ 0.003 |
| 0.5 ~ 0.7 | 기억할 만한 사건 | 0.005 ~ 0.01 |
| 0.3 ~ 0.5 | 일반 상호작용 | 0.02 ~ 0.05 |
| 0.0 ~ 0.3 | 일상 대화 | 0.05 ~ 0.1 |

### 6-3. 강도별 기억 품질

| current_strength | 조건 구조체 주입 내용 |
|-----------------|----------------------|
| 0.8 이상 | 원본 텍스트 그대로 |
| 0.5 ~ 0.8 | 원본 + "날짜와 장소가 불확실합니다" 플래그 |
| 0.2 ~ 0.5 | 원본 + "디테일이 흐릿하고 오기억이 포함될 수 있습니다" 플래그 + strength 값 |
| 0.2 미만 | 포함하지 않음 (관계 수치에만 잔류) |

원본은 항상 원본 그대로 보존한다.  
오기억 텍스트를 별도 저장하지 않는다.  
strength 플래그를 받은 총괄 LLM이 서술 시 흐릿하게 표현한다.

### 6-4. 기억 재활성화

트리거: 관련 사건 재발생, 관련 인물 재등장, 유사한 강한 감정 상태  
처리: current_strength 부분 회복 (importance 초과 불가), 재활성화 자체를 에피소드로 기록

---

## 7. 컨텍스트 주입 레이어 구조

### 7-1. 레이어 구조

```
LAYER 0 (Force-Active, 최상단 - 매 씬 고정)
  코어 성향 전체
  surface_state + emotion_current
  mood, energy, stress
  해당 씬 대상과의 관계 수치 해석값
  style_anchor (발화·행동 패턴 few-shot)

LAYER 1 (복합 조건 트리거)
  씬 컨텍스트 키워드 AND 등장 인물 조합으로 검색
  관련 에피소드 (current_strength 높은 순, 플래그 포함)
  대상에 대한 belief

LAYER 2 (캐스케이딩 쿼리)
  LAYER 1 결과 텍스트로 2차 쿼리
  연상되는 깊은 기억 활성화

LAYER 3 (하단 - 낮은 가중치)
  원거리 기억 (strength 낮음, 플래그 포함)
  일반 지식
  관계 요약본
```

### 7-2. 조건 구조체 합성 형식

```
[{persona_id}의 현재 상태]
성향:      {core.disposition}
절대 한계:  {core.hard_limits}
화법:      {core.speech_pattern}
자기인식:   {core.self_perception}

표면 상태: {surface_state}
  normal     → 현재 감정: {emotion_current} (강도: {emotion_intensity})
  processing → 감정 처리 중. 멍함·정지·무표정으로 서술할 것.
  suppressed → 억압 중. behavior_patterns contradiction 패턴으로 서술할 것.

기저 기분: {mood 해석값}
에너지:   {energy 해석값}
스트레스: {stress 해석값}

[{target}과의 관계]
신뢰:   {trust 해석값}
감정색: {sentiment 해석값}
친밀도: {familiarity 해석값}
권력:   {power_dynamic 해석값}

[관련 기억]
{LAYER 1, 2 검색 결과 - strength 플래그 포함}

[발화·행동 패턴]
{style_anchor few-shot}

[주의]
위에 제공된 정보 외의 내용을 페르소나가 알고 있는 것으로 서술하지 말 것.
DB에 없는 정보: "페르소나는 이 정보를 알지 못합니다"로 처리할 것.
```

---

## 8. 능동적 정보 표출

### 8-1. 발화 점수 계산

```
발화 점수 = 유사도 × urgency_weight × disposition_weight × trust_factor × sentiment_factor

disposition_weight:
  자기보호 성향  → 생존 관련 urgency 가중치 높음
  공감 성향     → 감정 관련 urgency 가중치 높음
  정보 독점 성향 → 전반적 하향

trust_factor:
  trust ≥ 0.6  → 1.0 이상
  trust < 0.4  → 1.0 미만

sentiment_factor:
  sentiment > 0    → 공유 의지 상향
  sentiment < -0.5 → 은폐 또는 역이용 가능

임계값 초과 → 조건 구조체에 능동 발화 신호 포함
임계값 미달 → 침묵 (행동 묘사만 출력)
```

### 8-2. 정보 공개 제어

`is_secret = true`이면 발화 점수 무관하게 해당 정보는 조건 구조체에 포함하지 않는다.  
`shareable_with` 목록에 없는 대상에게도 포함하지 않는다.

---

## 9. 연상 및 제3자 언급

```
A의 발언 → target 제한 없이 DB 전체 쿼리
         → B 관련 기억이 유사도로 검색됨 (연상)
         ↓
1차 필터 (룰):
  유사도 임계값
  B 기억의 is_secret
  이리나→A sentiment 조건
  이리나→B familiarity 조건
  ↓
필터 통과 시:
  B 기억 + 양측 관계 수치를 조건 구조체에 포함
  총괄 LLM이 꺼낼지, 어떻게 꺼낼지 결정
```

---

## 10. upsert 파이프라인

```
대화·상호작용 발생
  ↓
키워드 패턴 매칭 (룰 엔진)
  이벤트 타입 결정 → 등급 결정
  수치 변화량 계산: base_delta × sensitivity × delta_modifier
  ↓
문서 DB 업데이트:
  관계 수치 갱신 (클램핑 적용)
  내부 상태 수치 갱신
  CRITICAL이면:
    emotion_pending, emotion_delay_remaining, surface_state 설정
  ↓
벡터 DB 에피소드 저장:
  importance 결정 (이벤트 등급 기반)
  decay_rate 결정 (importance 기준)
  current_strength = importance로 초기화
  ↓
CRITICAL → 즉시 처리, 다음 씬 조건 구조체에 surface_state 반영
MODERATE → 씬 종료 시 일괄 처리
MINOR    → 배치 처리 또는 무시
```

---

## 11. 실시간 정보 연동 (뉴스 에이전트)

### 11-1. 파이프라인

```
외부 소스 (SNS, 뉴스 API, RSS)
  ↓
관심사 태그 필터 (페르소나별)
  ↓
인지 딜레이 적용 (core 설정값)
  ↓
벡터 DB upsert (type: external_info)
```

### 11-2. 관심사 태그 구조

```json
{
  "persona": "string",
  "interests": {
    "[topic]": {
      "sub_interests":         ["string"],
      "low_interest":          ["string"],
      "emotional_sensitivity": ["string"],
      "awareness_speed_hours": 0
    }
  }
}
```

`awareness_speed_hours`: 정보 인지까지의 딜레이. 캐릭터 설정값이다.

### 11-3. 대화 자체가 정보 획득 경로

A가 페르소나에게 정보를 알려주면 external_info로 upsert한다.  
출처 태그 ("A로부터 들었다") 포함. 이후 다른 유저와 대화 시 알고 있는 상태로 반응한다.

### 11-4. 모르는 정보 처리

DB에 없는 정보는 조건 구조체에 "페르소나는 이 정보를 알지 못합니다" 명시.  
총괄 LLM이 자체 생성하여 아는 척 하는 것을 차단한다.

---

## 12. 전체 씬 처리 파이프라인

```
[씬 트리거 / 유저 인풋]
  ↓
[페르소나 DB 조회]
  문서 DB: 코어, 내부 상태, 관계 수치, surface_state
  벡터 DB:
    LAYER 0 Force-Active
    LAYER 1 복합 조건 검색
    LAYER 2 캐스케이딩 쿼리
    LAYER 3 원거리 기억 / 지식
  ↓
[능동 발화 점수 계산]
  ↓
[조건 구조체 합성]
  수치 → 공통 척도 해석값
  에피소드 → strength 플래그 포함
  surface_state → 감정 표출 방식
  behavior_patterns 매핑
  style_anchor few-shot
  ↓
[총괄 LLM]
  조건 구조체 기반 서사·대화·행동 묘사 생성
  ↓
[키워드 패턴 매칭 - 룰 엔진]
  이벤트 등급 결정 → 수치 변화량 계산
  ↓
  CRITICAL → 즉시 upsert + surface_state 설정
  MODERATE → 씬 종료 시 일괄 upsert
  MINOR    → 배치 처리
  ↓
[emotion_delay_remaining 감소]
  0이 되면 emotion_current 교체, surface_state 갱신
  ↓
[다음 씬은 갱신된 DB 상태로 시작]
```

---

## 13. 관계 요약본 관리

에피소드가 누적되면 주기적으로 관계 요약본을 생성한다.  
총괄 LLM이 유휴 시점 배치 작업으로 처리한다.

생성 트리거:
- 에피소드 N개 누적 시
- 관계 수치 일정 폭 이상 변화 시
- 일정 기간 경과 시

기존 요약본 + 신규 에피소드 → 새 요약본으로 교체.

---

## 14. 행동 묘사 설계

행동 패턴은 `core.behavior_patterns`에 저장되며 불변이다.

`contradiction` 필드가 핵심이다.  
말과 행동의 불일치가 캐릭터를 입체적으로 만든다.

컨디션에 따른 변동폭:
```
energy 낮음 + stress 높음 → 평소보다 날카로운 반응
stability 낮음             → 감정 기복 크게 서술
최근 기억 재활성화         → 해당 감정 민감해짐
```

`core.emotional_volatility`가 낮은 캐릭터는 상태 변화에도 반응 폭이 크게 달라지지 않는다.

`core.self_perception`과 실제 behavior_patterns가 함께 조건 구조체에 주입되면  
총괄 LLM이 그 불일치를 서술에 자연스럽게 반영한다.

침묵과 비반응: 능동 발화 점수 임계값 미달 시 대사 없이 행동 묘사만 출력된다.  
침묵 자체가 캐릭터 반응이다.

---

## 15. 한계 및 미해결 과제

| 과제 | 현황 | 방향 |
|------|------|------|
| LLM의 DB 외 정보 생성 완전 차단 | 100% 보장 불가 | 조건 구조체 "모름" 명시로 최소화 |
| 총괄 LLM의 캐릭터 동질화 | 장기 서사에서 발생 가능 | style_anchor 반복 주입으로 억제, 완전 차단 아님 |
| 키워드 매칭 실패 | 간접·암시적 이벤트 감지 불가 | MINOR 폴백으로 안전하게 처리, 누락 허용 |
| 복합 감정 상태 처리 | 두 감정 동시 활성화 시 behavior_patterns 충돌 | 우선순위 기반 단일 패턴 선택 로직 설계 필요 |
| 표현 레이어 품질 상한 | DB 설계자의 캐릭터 이해도에 종속 | 자동화 불가. 설계 품질이 곧 시스템 품질 |

---

## 요약

> **벡터 DB가 캐릭터를 생성하는 것이 아니라,**  
> **벡터 DB가 캐릭터의 역사와 상태를 공급하여 LLM의 생성 방향을 조건화한다.**
>
> Lorebook이 캐릭터의 정의를 주입한다면,  
> 이 시스템은 캐릭터가 살아온 시간을 주입한다.
>
> 코어는 불변. 관계 수치는 잔류. 에피소드 디테일은 감쇠.  
> 판단은 룰 엔진. 서술은 총괄 LLM.  
> 소형 LLM은 존재하지 않는다.
