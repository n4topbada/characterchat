// src/lib/assets/blob.ts
// 자산 저장소 추상화. 로컬 dev 는 public/ 파일시스템, 프로덕션은 @vercel/blob.
// BLOB_READ_WRITE_TOKEN 이 있으면 무조건 blob. 없으면 로컬.

import fs from "node:fs/promises";
import path from "node:path";
import { put } from "@vercel/blob";

export type StoredAsset = {
  url: string;
  pathname: string;
};

function useRemote(): boolean {
  const t = process.env.BLOB_READ_WRITE_TOKEN;
  return !!t && t.trim().length > 0 && !/placeholder/i.test(t);
}

/**
 * `relPath` 는 "portraits/aria.png" 처럼 public/ 기준 상대경로.
 * 로컬: public/{relPath} 에 기록 → "/{relPath}" 반환.
 * 원격: Vercel Blob 에 업로드 → 공개 URL 반환.
 */
export async function putAsset(
  relPath: string,
  body: Buffer,
  contentType: string,
): Promise<StoredAsset> {
  const normalized = relPath.replace(/^\/+/, "");

  if (useRemote()) {
    const res = await put(normalized, body, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url: res.url, pathname: res.pathname };
  }

  const outFile = path.resolve(process.cwd(), "public", normalized);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, body);
  return { url: "/" + normalized, pathname: normalized };
}
