// Veo mp4 → animated webp 변환. Fictory 파이프라인과 동일한 고정 스펙:
//   540 x 810, Q75, 12fps, loop=0.
// 원본 mp4 해상도/종횡비에 맞춰 중앙 크롭 후 리사이즈.
//
// 요구: ffmpeg / ffprobe 바이너리가 시스템에 설치되어 있어야 한다.
// 개발기 기준: Windows 는 winget (Gyan.FFmpeg), macOS 는 brew install ffmpeg.
// Vercel 런타임엔 ffmpeg 이 없으므로 이 모듈은 로컬 스크립트 / 별도 워커에서만 호출한다.

import { execFileSync } from "node:child_process";
import { existsSync, statSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import os from "node:os";

const ANI_WIDTH = 540;
const ANI_HEIGHT = 810;
const ANI_QUALITY = 75;
const ANI_FPS = 12;

export const ANIMATION_SPEC = {
  width: ANI_WIDTH,
  height: ANI_HEIGHT,
  quality: ANI_QUALITY,
  fps: ANI_FPS,
  loop: 0,
} as const;

function findBinary(name: "ffmpeg" | "ffprobe"): string {
  const exe = process.platform === "win32" ? `${name}.exe` : name;

  // 1) PATH 탐색 — env 파싱 (한글 사용자 디렉토리에서 where 가 깨지는 케이스 회피)
  const pathDirs = (process.env.PATH || "").split(process.platform === "win32" ? ";" : ":");
  for (const dir of pathDirs) {
    const candidate = join(dir, exe);
    if (existsSync(candidate)) return candidate;
  }

  // 2) Windows winget (Gyan.FFmpeg)
  if (process.platform === "win32") {
    const wingetPath = join(
      process.env.LOCALAPPDATA || "",
      "Microsoft/WinGet/Packages",
    );
    try {
      const packages = readdirSync(wingetPath).filter((d) => d.includes("FFmpeg"));
      for (const pkg of packages) {
        const pkgDir = join(wingetPath, pkg);
        for (const sub of readdirSync(pkgDir)) {
          const candidate = join(pkgDir, sub, "bin", exe);
          try {
            statSync(candidate);
            return candidate;
          } catch {
            /* continue */
          }
        }
      }
    } catch {
      /* continue */
    }
  }

  throw new Error(
    `${name} not found. Install via:\n` +
      (process.platform === "win32"
        ? "  winget install Gyan.FFmpeg"
        : process.platform === "darwin"
          ? "  brew install ffmpeg"
          : "  apt-get install ffmpeg"),
  );
}

function probeDimensions(ffprobe: string, mp4Path: string): { w: number; h: number } {
  const out = execFileSync(
    ffprobe,
    [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height",
      "-of", "csv=p=0",
      mp4Path,
    ],
    { encoding: "utf-8" },
  ).trim();
  const [w, h] = out.split(",").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`ffprobe_parse_failed: ${out}`);
  }
  return { w, h };
}

/**
 * mp4 Buffer 를 받아 540x810 Q75 12fps animated webp Buffer 를 반환한다.
 * ffmpeg 을 CLI 로 호출하며 일시 파일은 OS 임시 폴더에 쓰고 삭제한다.
 */
export async function mp4ToAnimatedWebp(mp4: Buffer): Promise<Buffer> {
  const ffmpeg = findBinary("ffmpeg");
  const ffprobe = findBinary("ffprobe");

  const tmpRoot = resolve(os.tmpdir(), "characterchat-ani");
  await mkdir(tmpRoot, { recursive: true });
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const mp4Path = join(tmpRoot, `src-${stamp}.mp4`);
  const webpPath = join(tmpRoot, `out-${stamp}.webp`);

  await writeFile(mp4Path, mp4);

  try {
    const { w: srcW, h: srcH } = probeDimensions(ffprobe, mp4Path);

    const targetRatio = ANI_WIDTH / ANI_HEIGHT; // 0.667
    const srcRatio = srcW / srcH;
    let cropFilter: string;
    if (srcRatio < targetRatio) {
      // 원본이 더 세로로 김 → 상하 크롭
      const cropH = Math.round(srcW / targetRatio);
      const offsetY = Math.round((srcH - cropH) / 2);
      cropFilter = `crop=${srcW}:${cropH}:0:${offsetY}`;
    } else {
      // 원본이 더 가로로 김 → 좌우 크롭
      const cropW = Math.round(srcH * targetRatio);
      const offsetX = Math.round((srcW - cropW) / 2);
      cropFilter = `crop=${cropW}:${srcH}:${offsetX}:0`;
    }

    execFileSync(
      ffmpeg,
      [
        "-y",
        "-i", mp4Path,
        "-vf", `${cropFilter},scale=${ANI_WIDTH}:${ANI_HEIGHT}`,
        "-r", String(ANI_FPS),
        "-c:v", "libwebp",
        "-lossless", "0",
        "-quality", String(ANI_QUALITY),
        "-loop", "0",
        "-an",
        webpPath,
      ],
      { stdio: "pipe" },
    );

    return readFileSync(webpPath);
  } finally {
    try { unlinkSync(mp4Path); } catch { /* ignore */ }
    try { unlinkSync(webpPath); } catch { /* ignore */ }
  }
}
