# 11 · Assets — 저장 / 명명 / 업로드 규칙

캐릭터당 수백 장의 초상/배경 이미지가 붙는다. 원본(PNG) · 변환본(webp) ·
DB 행 · 원격 Blob 경로가 어긋나지 않도록 **파일명 스킴**을 단일 소스 오브
트루스로 둔다. 파일명만 보면 `Asset` 행의 모든 분류 필드를 복원할 수 있어야
한다.

---

## 1. 원본 폴더 레이아웃

```
asset/
├─ char01/                  # 미라 (legacy — 별도 카탈로그 JSON 병행. 건드리지 않음)
├─ char0002/                # 류하진 (남성 · 여성향 · 15금)
├─ char0003/                # 서아진 (여성 · 남성향 · 19금)
└─ ...                      # 신규 캐릭터는 `char{NNNN}/` 로 추가
```

- **한 폴더 = 한 캐릭터**. 슬러그 기반이 아니라 `char{NNNN}` 아이디 기반인
  이유: 이름/슬러그는 바뀔 수 있지만 자산 원본 디렉토리는 안정적이어야 함.
- 원본 PNG 는 리포에 커밋하지 않는다 (`.gitignore` 의 `asset/` ).

## 2. 파일명 스킴

### 2.1 포트레이트/갤러리 (주인공이 찍힌 컷)

```
{charId}_{scene}_{expression}_{nsfw}_{ordinal}.png
```

regex: `^char\d{2,4}_(home|work|gym|sleep|daily|nude|naked|underwear|sex_bg)_(neutral|happy|angry|sad|embarrassed|aroused)_(sfw|nsfw)_\d{4}\.png$`

| 세그먼트 | 허용 값 | 의미 |
|---|---|---|
| `charId` | `char0002`, `char0003`, ... | 캐릭터 고유 아이디 |
| `scene` | `home`, `work`, `gym`, `sleep`, `daily`, `nude`, `naked`, `underwear`, `sex_bg` | 장면/상황 → `Asset.sceneTag` |
| `expression` | `neutral`, `happy`, `angry`, `sad`, `embarrassed`, `aroused` | 감정 → `Asset.expression` 에 매핑 |
| `nsfw` | `sfw`, `nsfw` | 노출 수위의 큰 분류. 세부 `nsfwLevel (0~3)` 은 scene 조합으로 결정 |
| `ordinal` | 4자리 zero-pad (`0072`) | 캐릭터 내 전역 순번. 파일 생성 순서 보존용 |

**스펠링은 정확해야 한다**. 과거 `emarrassed` / `embrrassed` 같은 오타가 있었고
`scripts/asset-canonicalize.ts` 가 일괄 rename 했다. 향후 생성 파이프라인도
이 스펠링을 엄수.

### 2.2 배경 (캐릭터가 없는 컷, `kind = background`)

```
{charId}_bg_{location}_{ordinal}.png
```

| 세그먼트 | 허용 값 | 의미 |
|---|---|---|
| `location` | `balcony`, `bar`, `bedroom1`, `gym`, `house`, `rooftop`, `bed`, `forest`, `locker`, `pool`, `shower`, ... | 배경 로케이션 |

## 3. scene ↔ Asset 필드 매핑 (단일 소스)

**이 테이블이 `scripts/upload-character.ts` 의 매핑 함수와 동기화되어야 한다.**

### 3.1 scene → sceneTag / clothingTag / 기본 nsfwLevel

| scene | sceneTag | clothingTag | 기본 nsfwLevel | 비고 |
|---|---|---|---|---|
| `home` | `home` | `dressed` | 0 | 실내 일상복 |
| `daily` | `casual` | `dressed` | 0 | 외출복/편한 복장 |
| `work` | `work` | `dressed` | 0 | 업무/정장 |
| `gym` | `gym` | `dressed` | 0 | 운동복 |
| `sleep` | `sleep` | `partial` | 0 | 잠옷/반이완 상태 |
| `nude` | `nude` | `naked` | 1 | 남성 상반신 노출 수준(15금) |
| `underwear` | `underwear` | `underwear` | 2 | 속옷 차림 |
| `naked` | `naked` | `naked` | 2–3 | 여성 전신 노출 |
| `sex_bg` | `sex_bg` | `naked` | 3 | 성행위 장면 |

### 3.2 nsfwLevel 상한 — **캐릭터별 cap**

"콘텐츠 등급" 으로 상한을 두고, 파일이 그 이상이어도 업로드 시 cap 에
맞춘다:

| 캐릭터 등급 | 허용 상한 | 예 |
|---|---|---|
| 남성 · 여성향 · 15금 | `nsfwLevel ≤ 1` | 류하진 |
| 여성 · 남성향 · 19금 | `nsfwLevel ≤ 3` | 서아진 |
| SFW 전용 | `nsfwLevel = 0` | (미정의) |

### 3.3 expression → Asset.expression / moodFit

| expression | Asset.expression | moodFit |
|---|---|---|
| `neutral` | `neutral` | `["calm"]` |
| `happy` | `smile` | `["happy"]` |
| `angry` | `angry` | `["angry", "tense"]` |
| `sad` | `crying` | `["sad"]` |
| `embarrassed` | `shy` | `["shy"]` |
| `aroused` | `seductive` | `["horny", "teasing"]` |

### 3.4 scene → locationFit (기본값)

| scene | locationFit |
|---|---|
| `home`, `daily` | `["home"]` |
| `work` | `["office"]` |
| `gym` | `["gym"]` |
| `sleep` | `["bedroom"]` |
| `nude`, `naked`, `underwear`, `sex_bg` | `["bedroom", "home"]` |

## 4. GCS (Vercel Blob) 경로 규칙

업로드는 `src/lib/assets/blob.ts` 의 `putAsset(relPath, body, contentType)` 로
단일화. `relPath` 는 다음 구조를 **반드시** 지킨다:

```
characters/{slug}/portrait.webp
characters/{slug}/gallery/{scene}_{expression}_{ordinal}.webp
characters/{slug}/backgrounds/{location}_{ordinal}.webp
```

- **slug 기반** (`mira`, `ryu-ha-jin`, `seo-ah-jin`) — 원본 폴더가 `charNNNN`
  이어도 Blob 은 슬러그로 맵된다. 슬러그가 안정적일 때만 변경.
- `addRandomSuffix: false` + `allowOverwrite: true` — 같은 경로로 재업로드
  하면 덮어쓴다(멱등 안전).
- 포트레이트: 768×1024 cover-crop (`sharp` `attention`) + `webp q=88`.
- 갤러리/배경: 장변 최대 1280 px (원본이 작으면 유지) + `webp q=85`.
- Blob key 에서 `char0002_` 같은 캐릭터 아이디 접두사는 버린다. slug 가 바뀌어도
  Blob 은 관리가 되어야 하니 `scene/expression/ordinal` 만 남긴다.

## 5. Asset 행 필드 생성 규칙

업로드 스크립트가 각 파일마다 다음을 채운다:

| 필드 | 값 |
|---|---|
| `id` | 신규 ULID |
| `characterId` | Character.id |
| `kind` | `portrait` (대표 1장) / `gallery` / `background` |
| `blobUrl` | `putAsset` 반환 URL |
| `mimeType` | 항상 `image/webp` |
| `width` / `height` | 변환 후 실제 픽셀 |
| `order` | 포트레이트 0, 갤러리는 파일명 `ordinal`, 배경도 `ordinal` |
| `sceneTag` / `clothingTag` | §3.1 매핑 |
| `expression` | §3.3 매핑 |
| `moodFit` | §3.3 매핑 |
| `locationFit` | §3.4 매핑 |
| `nsfwLevel` | §3.1 × §3.2 cap |
| `description` | 자동 생성: `"{scene} · {expression}"` |
| `triggerTags` | `[scene, expression]` |
| `composition` / `pose` | 기본 null (수동 보정) |

## 6. 포트레이트 선택 규칙

`Character.portraitAssetId` / `heroAssetId` 는 **캐릭터당 1개**. 업로드
스크립트의 `--portrait <filename>` 플래그로 명시한다(기본값 없음).
기존 업로드 이후 포트레이트를 교체할 땐 `scripts/set-portrait.ts` 로
특정 gallery Asset 을 promote 한다(재업로드 없음).

| 캐릭터 | 포트레이트 파일 |
|---|---|
| 류하진 | `char0002_home_aroused_sfw_0072.png` |
| 서아진 | `char0003_daily_angry_sfw_0001.png` |
| 미라 (legacy) | `char01_casual002.png` |

## 6.1 Portrait 애니메이션 (Veo 3.1 Lite)

포트레이트는 반드시 animated webp(`Asset.animationUrl`) 를 함께 등록한다.
정적 이미지만 있어도 UI 는 fallback 으로 렌더하지만, 채팅 헤더와 카드의
"숨 쉬는" 느낌을 유지하려면 ani 가 필요하다.

- **생성**: `scripts/generate-portrait-ani.ts <slug> [slug...]`
  - `src/lib/animate/stream.ts` 의 `collectPortraitAnimation()` 을 그대로
    호출. Veo 폴링 → mp4 → ffmpeg 540×810 Q75 12fps → Blob 업로드.
  - 결과 key: `portraits/ani/{assetId}.webp` (portrait Asset id 기준).
- **safety filter 대응**: 기본 모션 프롬프트로 Veo 가 `veo_no_result` 를
  리턴하면(대개 표정/자세가 성적으로 해석됨) `generate-portrait-ani-custom.ts`
  로 "미세 idle 만 추가, 성적 표현 금지" 을 명시한 safer prompt 로 재시도.
- **재생성**: `--force` 플래그로 기존 animationUrl 덮어쓰기.
- **소요 시간**: Veo 폴링 포함 캐릭터당 30s ~ 4min. 로컬 ffmpeg 필요 (Vercel
  서버리스엔 없음 — 로컬/워커에서만 돈다).

## 7. 재실행 / 멱등성

- Character + Config + PersonaCore 는 upsert.
- Asset 은 캐릭터별로 전체 삭제 후 재생성(`upload-character.ts --wipe`).
- 포트레이트/hero 는 null 로 초기화 후 대표 파일을 다시 매핑.
- Blob 은 `allowOverwrite: true` 라 같은 경로가 덮어쓰여 고아 파일이 남지 않음.

## 8. 관리자 UI 에서 개별 수정

업로드 스크립트는 "대량 초기 주입" 전용이다. 개별 이미지의 tag 교정은
`/admin/characters/[id]` 의 Assets 탭에서 `PATCH /api/admin/assets/[id]` 로
한다.

## 9. 카드/히어로 렌더 스펙 (UI 계약)

- **캐러셀 카드** — `w-full aspect-[3/4] max-w-md`, `object-cover`, 하단에
  `bg-gradient-to-t from-black/70 via-black/30 to-transparent` 스크림.
- **히어로** — `/characters/[slug]` 상단, `w-full aspect-[16/9] max-w-md`.
  `heroAssetId` 가 따로 없으면 포트레이트 재사용.
- **raw `<img>` 사용** — `next/image` 최적화 우회 (commit `d22128b`,
  `src/lib/assets/imageHint.ts`). Vercel Blob URL 은 자체 CDN 캐시.

## 10. 삭제 플로우

`DELETE /api/admin/assets/[id]`:
1. `prisma.$transaction` 내에서 Character.portraitAssetId / heroAssetId null 화
   후 Asset row 삭제.
2. 로컬 `/` 경로면 파일시스템 `fs.unlink` (커밋 `7422e4f` 에서 순서 수정 —
   DB 먼저 지우고 파일 정리).

## 11. 향후

- Blob orphan cleanup cron (`characters/{slug}/gallery/*.webp` 중 DB
  참조 없는 파일 주기 삭제).
- `Asset.variants[]` — 400 / 800 / 1600 여러 크기를 함께 저장해서 반응형 srcset.
- `composition` / `pose` 자동 태깅 — LLM 비전 분류기로 boot-strap.
