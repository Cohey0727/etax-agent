/**
 * settingsFiles.ts — 設定系 JSON ファイルの所有者（テナント）別ファイル名（repositories）。
 *
 * 設定画面で編集される値（SystemOne 接続設定・jev プロンプト・正規表現
 * ルール・科目判定の学習履歴）はデータフォルダの JSON ファイルに保存する。
 * マルチテナント分離のため、所有者ごとに別ファイルに分ける。既定ユーザー
 * （認証オフ運用のデータの所有者）は無印のファイル名を使い、それ以外の
 * 所有者は「-<所有者ID>」を付けたファイルを使う。
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../lib/config";
import { DEFAULT_OWNER_ID } from "../lib/tenantContext";

/** 所有者別の設定ファイル名を返す。 */
export function settingsFilename(base: string, ownerId: number): string {
  if (ownerId === DEFAULT_OWNER_ID) return base;
  return base.replace(/\.json$/, `-${ownerId}.json`);
}

/** 所有者別の設定ファイルのフルパスを返す。 */
export function settingsFilePath(base: string, ownerId: number): string {
  return join(serverDataDir(), settingsFilename(base, ownerId));
}

/**
 * 起動時の全所有者読み込み用：データフォルダに存在する base の
 * 設定ファイルの所有者ID一覧（既定ユーザーは常に含む）。
 */
export async function listSettingsOwnerIds(base: string): Promise<number[]> {
  const ids = new Set<number>([DEFAULT_OWNER_ID]);
  try {
    const entries = await readdir(serverDataDir());
    const stem = base.replace(/\.json$/, "");
    const pattern = new RegExp(`^${stem}-(\\d+)\\.json$`);
    for (const name of entries) {
      const matched = pattern.exec(name);
      if (matched) ids.add(Number(matched[1]));
    }
  } catch {
    // データフォルダが無ければ既定ユーザーのみ。
  }
  return [...ids];
}
