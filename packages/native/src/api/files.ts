/**
 * files.ts — ファイルのアップロード（署名付きURL経由）と、
 * 生成ファイル（二進データ・Base64）の保存＋共有シート表示。
 */
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { apiJson, ApiError, rawFetch } from "./client";
import { PresignUploadFileResponse } from "./types";

export const UPLOADABLE_IMAGE_TYPES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/** 端末上のファイル（file:// URI）のバイト列を読む。 */
export async function readLocalFileBytes(uri: string): Promise<Uint8Array> {
  const file = new File(uri);
  return file.bytes();
}

/**
 * 署名付きURLでストレージへ直接アップロードし、ファイルIDを返す。
 * APIサーバーはバイト列を経由しない。
 */
export async function uploadViaPresignedUrl(
  bytes: Uint8Array,
  contentType: string,
  purpose?: string,
): Promise<string> {
  const presign = await apiJson<PresignUploadFileResponse>("/api/files/presign-upload", {
    method: "POST",
    body: { contentType, ...(purpose ? { purpose } : {}) },
  });
  const resp = await rawFetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bytes as unknown as BodyInit,
  });
  if (!resp.ok) {
    throw new ApiError(resp.status, `ファイルのアップロードに失敗しました (HTTP ${resp.status})`);
  }
  return presign.fileId;
}

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64文字列をバイト列へ変換する（PDF等の生成物保存用）。 */
export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, "");
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    if (ch === "=") break;
    const value = BASE64_CHARS.indexOf(ch);
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** バイト列をキャッシュ領域へファイルとして書き出す。 */
export function saveBytesToCacheFile(filename: string, bytes: Uint8Array): File {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  return file;
}

/** Base64の生成物（PDF等）をファイルに保存する。 */
export function saveBase64ToCacheFile(filename: string, base64: string): File {
  return saveBytesToCacheFile(filename, decodeBase64(base64));
}

/** テキスト（XTX等）をファイルに保存する。 */
export function saveTextToCacheFile(filename: string, text: string): File {
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(text);
  return file;
}

/** 保存したファイルを共有シートで開く（保存・送信先の選択は利用者）。 */
export async function shareFile(file: File, mimeType: string): Promise<void> {
  const available = await Sharing.isAvailableAsync();
  if (!available) throw new Error("この端末では共有が使えません");
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: file.name });
}

/** APIの二進応答（PDF等）を認証付きで取得し、ファイルに保存する。 */
export async function downloadApiFile(
  path: string,
  filename: string,
): Promise<File> {
  const { apiRaw } = await import("./client");
  const resp = await apiRaw(path);
  if (!resp.ok) {
    const data = (await resp.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(resp.status, data.error ?? `HTTP ${resp.status}`);
  }
  const buffer = await resp.arrayBuffer();
  return saveBytesToCacheFile(filename, new Uint8Array(buffer));
}
