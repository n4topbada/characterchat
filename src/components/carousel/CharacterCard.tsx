"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Bookmark, Loader2, Sparkles } from "lucide-react";
// Link 는 /characters/[slug] 랜딩을 건너뛰기로 하면서 더 이상 필요 없음.
import { SafePortrait } from "@/components/character/SafePortrait";
import { PhysicalStats } from "@/components/character/PhysicalStats";
import { mergeIntro } from "@/lib/character-display";

export type CarouselCharacter = {
  /** 세션 upsert 에 필요한 실제 Character id. slug 만으로는 조회 라운드트립이 한 번 더 든다. */
  id: string;
  slug: string;
  name: string;
  /** 한줄 소개 (tagline) — backstory 와 ','로 결합되어 단일 intro 가 된다 */
  tagline: string;
  accentColor: string;
  portraitUrl: string | null;
  /**
   * 카드가 SSE 로 "어디부터 이어 돌려야 하는지" 판정하는 메타.
   *  - null        → portrait Asset 자체가 없다 → /portrait/generate 부터
   *  - 값 존재     → Asset 은 있으므로 animation 만 돌리면 된다
   */
  portraitAssetId: string | null;
  /** Asset.animationUrl 존재 여부. true 면 Ani 도 완료된 상태. */
  hasAnimation: boolean;
  /** PersonaCore.shortTags — 단어형, 1줄. 비어 있을 땐 derive. */
  tags?: string[];
  /** PersonaCore.backstorySummary — tagline 과 합쳐 하나의 intro 로 노출 */
  backstorySummary?: string | null;
  /** 신체 스펙 (+나이) — 슬림 1줄 스탯 스트립 */
  ageText?: string | null;
  heightCm?: number | null;
  weightKg?: number | null;
  threeSize?: string | null;
  mbti?: string | null;
};

type GenStatus = "idle" | "portrait" | "animation" | "done" | "error";

/**
 * Character card — Scholastic Archive 스타일 풀스크린 카드.
 *
 * 슬림 레이아웃:
 *   이름 → (1줄) 단어형 태그 → (2~3줄) 합쳐진 intro → 초슬림 스탯 스트립 → CTA
 *
 * autoGenerate:
 *   Caster 의 confirm-autocommit 직후 /find?focus=&gen=1 로 들어왔을 때 이 플래그로
 *   포커스 카드 한 장만 SSE 체인(portrait → animation)을 돌린다.
 *   - portraitAssetId 가 없으면 portrait SSE 부터 시작
 *   - 있으면 animation SSE 만 실행
 *   - 둘 다 준비되어 있으면 바로 "done"
 *   생성 중에는 portrait 영역 위에 "이미지 생성 중" 오버레이를 덮고, 완료되면
 *   router.refresh() 로 SSR 을 다시 태워 최신 URL 을 받아온다.
 */
export function CharacterCard({
  c,
  autoGenerate,
}: {
  c: CarouselCharacter;
  index: number;
  autoGenerate?: boolean;
}) {
  const tags = (c.tags ?? []).slice(0, 6);
  const intro = mergeIntro(c.tagline, c.backstorySummary);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [genStatus, setGenStatus] = useState<GenStatus>("idle");
  const [genStage, setGenStage] = useState<string | null>(null);
  const [genMessage, setGenMessage] = useState<string | null>(null);
  // React strict-mode 두 번 마운트 / 리렌더 등으로 중복 SSE 방지. 카드 수명 내 1회.
  const genStartedRef = useRef(false);

  // 카드의 "대화 시작" → /characters/[slug] 랜딩을 건너뛰고 바로 세션을 upsert 해
  // /chat/[id] 로 이동. POST /api/sessions 는 idempotent (기존 세션 있으면 reused).
  async function handleStart() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ characterId: c.id }),
      });
      if (!r.ok) {
        setBusy(false);
        // 대부분 401 — 비로그인 상태. 로그인 후 현재 슬러그로 돌아오게 한다.
        if (r.status === 401) {
          router.push(
            `/auth/signin?callbackUrl=/find` as never,
          );
          return;
        }
        return;
      }
      const { id } = (await r.json()) as { id: string };
      router.push(`/chat/${id}` as never);
    } catch {
      setBusy(false);
    }
  }

  // ---------- SSE: animation Agent ----------
  //
  // /api/admin/assets/[id]/animate SSE 를 소비. 단계마다 genStage 로 사람이
  // 읽는 라벨을 갱신한다. saved/reused 에서 router.refresh() → SSR 재실행 →
  // hasAnimation=true 로 재주입되며 오버레이가 걷힌다.
  const runAnimation = useCallback(
    async (assetId: string) => {
      setGenStatus("animation");
      setGenStage("애니메이션 준비");
      setGenMessage(null);
      // 로컬 에러 플래그 — React state 는 closure 에 고정되므로 SSE 루프 내 판정은
      // 이 로컬 변수로 한다.
      let hadError = false;
      try {
        const r = await fetch(`/api/admin/assets/${assetId}/animate`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
          },
          body: JSON.stringify({}),
        });
        if (!r.ok || !r.body) {
          setGenStatus("error");
          setGenMessage(`애니메이션 생성 실패 (${r.status})`);
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let terminal = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const evLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            const data = dataLine.slice(5).trim();
            try {
              if (event === "started") setGenStage("Veo 모션 설계");
              else if (event === "download") setGenStage("원본 이미지 준비");
              else if (event === "veo_start") setGenStage("Veo 비디오 생성 시작");
              else if (event === "veo_poll") {
                const { elapsedSec } = JSON.parse(data) as {
                  elapsedSec: number;
                };
                setGenStage(`Veo 렌더 중 ${elapsedSec}s`);
              } else if (event === "veo_done") setGenStage("mp4 수신");
              else if (event === "ffmpeg_start") setGenStage("webp 변환");
              else if (event === "ffmpeg_done") setGenStage("업로드 준비");
              else if (event === "upload") setGenStage("업로드");
              else if (event === "saved" || event === "reused") {
                setGenStatus("done");
                setGenStage(null);
                terminal = true;
              } else if (event === "error") {
                const { message } = JSON.parse(data) as { message: string };
                setGenStatus("error");
                setGenMessage(message);
                setGenStage(null);
                terminal = true;
                hadError = true;
              }
            } catch {
              // ignore frame parse
            }
          }
        }
        if (!terminal) {
          setGenStatus("error");
          setGenMessage("빈 응답");
          setGenStage(null);
        } else if (!hadError) {
          // SSR 재실행으로 animationUrl 반영. hasAnimation=true 가 내려오면
          // 이 카드가 재마운트되지 않더라도 portraitUrl 이 스틸→애니 로 스왑된다.
          router.refresh();
        }
      } catch (e) {
        setGenStatus("error");
        setGenMessage(e instanceof Error ? e.message : String(e));
        setGenStage(null);
      }
    },
    [router],
  );

  // ---------- SSE: portrait Agent (+chain animation) ----------
  //
  // /api/admin/characters/[id]/portrait/generate SSE 를 소비. saved 에서 얻은
  // assetId 로 즉시 animation 체인. runId 없이 돌려도 Caster 대화 컨텍스트는
  // 서버쪽 character.personaCore 만으로 채워지는 기본 경로가 작동한다.
  const runPortrait = useCallback(
    async (characterId: string) => {
      setGenStatus("portrait");
      setGenStage("포트레이트 그리는 중");
      setGenMessage(null);
      // 로컬 에러 플래그. useState 의 genStatus 는 이 콜백의 closure 에 캡쳐되어
      // stale 해지므로, 같은 콜 안에서는 이 변수로 판정한다.
      let hadError = false;
      try {
        const r = await fetch(
          `/api/admin/characters/${characterId}/portrait/generate`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "text/event-stream",
            },
            body: JSON.stringify({}),
          },
        );
        if (!r.ok || !r.body) {
          setGenStatus("error");
          setGenMessage(`포트레이트 생성 실패 (${r.status})`);
          return;
        }
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let savedAssetId: string | null = null;
        let terminal = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const frames = buf.split("\n\n");
          buf = frames.pop() ?? "";
          for (const frame of frames) {
            const lines = frame.split("\n");
            const evLine = lines.find((l) => l.startsWith("event:"));
            const dataLine = lines.find((l) => l.startsWith("data:"));
            if (!evLine || !dataLine) continue;
            const event = evLine.slice(6).trim();
            const data = dataLine.slice(5).trim();
            try {
              if (event === "saved") {
                const j = JSON.parse(data) as { assetId: string };
                savedAssetId = j.assetId ?? null;
                terminal = true;
              } else if (event === "error") {
                const { message } = JSON.parse(data) as { message: string };
                setGenStatus("error");
                setGenMessage(message);
                setGenStage(null);
                terminal = true;
                hadError = true;
              }
            } catch {
              // ignore
            }
          }
        }
        if (!terminal || !savedAssetId) {
          if (!hadError) {
            setGenStatus("error");
            setGenMessage("포트레이트 결과 없음");
            setGenStage(null);
          }
          return;
        }
        // 스틸 저장 성공 → SSR 을 한 번 깨워 portraitUrl 을 바로 반영.
        // 이어 애니메이션 체인.
        router.refresh();
        await runAnimation(savedAssetId);
      } catch (e) {
        setGenStatus("error");
        setGenMessage(e instanceof Error ? e.message : String(e));
        setGenStage(null);
      }
    },
    [router, runAnimation],
  );

  // autoGenerate 마운트 시 1회 트리거.
  useEffect(() => {
    if (!autoGenerate) return;
    if (genStartedRef.current) return;
    // 상태별 분기:
    //  - 에셋 자체 없음 → 포트레이트부터
    //  - 에셋 있고 애니 없음 → 애니메이션만
    //  - 둘 다 있음 → no-op
    if (!c.portraitAssetId) {
      genStartedRef.current = true;
      void runPortrait(c.id);
    } else if (!c.hasAnimation) {
      genStartedRef.current = true;
      void runAnimation(c.portraitAssetId);
    }
    // 둘 다 완료면 조용히 done — 오버레이도 없음.
  }, [autoGenerate, c.id, c.portraitAssetId, c.hasAnimation, runPortrait, runAnimation]);

  // 오버레이 표시 조건: 실제로 진행 중이거나, 에셋이 아예 없는데 autoGenerate 조건인 경우.
  const generating = genStatus === "portrait" || genStatus === "animation";
  // 포트레이트 URL 이 비어 있는데 카드에 아직 시작도 못 한 상태면 그라디언트 fallback
  // 위에 얇은 "준비 중" 힌트만 띄운다 — 사용자가 빈 공간에 당황하지 않도록.
  const pendingPortrait = !c.portraitUrl && autoGenerate && !generating && genStatus !== "error";

  return (
    <section className="h-full w-full snap-start relative flex flex-col px-5 pt-6 pb-6">
      {/* Portrait frame — SafePortrait: local 은 unoptimized, 실패 시 gradient fallback */}
      <div className="absolute inset-0 z-0">
        <SafePortrait
          src={c.portraitUrl}
          priority
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover"
        />
        <div className="absolute inset-0 diagonal-bg opacity-40 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent pointer-events-none" />
      </div>

      {/* 생성 진행 오버레이 — 카드 중앙에 배치. portrait/animation 공용.
          완료 시 router.refresh() 로 c.portraitUrl 이 갱신되며 오버레이는 자연 소멸. */}
      {(generating || pendingPortrait) && (
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
          <div className="glass-strong ghost-border rounded-lg px-5 py-4 shadow-tinted-lg flex flex-col items-center gap-2 max-w-[80%]">
            <div className="flex items-center gap-2 text-on-surface">
              <Sparkles size={18} className="animate-pulse text-primary" strokeWidth={2.5} />
              <span className="font-headline font-bold text-sm tracking-wider">
                {genStatus === "animation"
                  ? "애니메이션 생성 중"
                  : "이미지 생성 중"}
              </span>
            </div>
            {genStage ? (
              <span className="text-[11px] text-on-surface-variant tabular-nums">
                {genStage}
              </span>
            ) : null}
            {pendingPortrait ? (
              <span className="text-[11px] text-on-surface-variant">
                잠시만 기다려줘
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* 에러 배너 — 생성 실패 시 카드 상단에 얇게. 치명적이지 않으니 카드 사용은 계속 가능. */}
      {genStatus === "error" && genMessage ? (
        <div className="absolute top-3 inset-x-5 z-20 rounded-md border border-rose-300/50 bg-rose-50/90 px-2.5 py-1.5 text-[11px] text-rose-900 shadow-sm">
          생성 실패: {genMessage}
        </div>
      ) : null}

      {/* Geometric frame decoration */}
      <div className="absolute top-32 right-5 w-16 h-16 border-t-2 border-r-2 border-primary/30 z-10 pointer-events-none" />
      <div className="absolute bottom-40 left-5 w-16 h-16 border-b-2 border-l-2 border-primary/30 z-10 pointer-events-none" />

      {/* Card shell */}
      <div className="mt-auto relative z-10 max-w-md mx-auto w-full">
        <div className="glass-strong ghost-border rounded-lg overflow-hidden shadow-tinted-lg">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />

          <div className="p-6 pl-7 space-y-3">
            {/* 이름 */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-headline text-3xl font-bold text-on-surface leading-tight tracking-tight truncate">
                {c.name}
              </h2>
              <button
                type="button"
                aria-label="Bookmark"
                className="shrink-0 p-2 bg-surface-container-high hover:bg-surface-container-highest transition-colors active:scale-95 rounded-md"
              >
                <Bookmark size={16} strokeWidth={2} className="text-primary" />
              </button>
            </div>

            {/* 단어형 태그 — 1줄, 통일 스타일 (no more 3-color rotation).
                길이 넘치면 가로 스크롤 허용. */}
            {tags.length > 0 && (
              <div className="-mx-1 overflow-x-auto">
                <ul className="flex items-center gap-1.5 px-1 whitespace-nowrap">
                  {tags.map((t) => (
                    <li
                      key={t}
                      className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-sm border border-outline-variant/50 text-on-surface-variant bg-surface-container-low"
                    >
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 통합 intro — tagline + backstory 합본. 카드에서는 3줄까지. */}
            <p className="text-on-surface leading-relaxed line-clamp-3 text-sm">
              {intro}
            </p>

            {/* 신체 스탯 — 슬림 1줄 */}
            <PhysicalStats
              stats={{
                ageText: c.ageText,
                heightCm: c.heightCm,
                weightKg: c.weightKg,
                threeSize: c.threeSize,
                mbti: c.mbti,
              }}
            />

            {/* CTA — parallelogram. 클릭 즉시 세션 upsert → /chat/[id] 로 점프.
                랜딩 페이지(/characters/[slug]) 는 건너뛴다. */}
            <button
              type="button"
              onClick={handleStart}
              disabled={busy}
              className="relative group flex items-center justify-center overflow-hidden h-14 w-full active:scale-[0.98] transition-transform mt-2 disabled:opacity-60"
            >
              <div
                className="absolute inset-0 btn-cta-gradient group-hover:brightness-110 transition-all"
                style={{ transform: "skewX(-12deg)" }}
              />
              <div className="relative flex items-center gap-3 text-on-primary font-headline font-bold tracking-[0.2em] text-sm">
                {busy ? (
                  <Loader2 size={16} className="animate-spin" strokeWidth={2.5} />
                ) : (
                  <>
                    <span>대화 시작</span>
                    <ArrowRight size={16} strokeWidth={2.5} />
                  </>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
