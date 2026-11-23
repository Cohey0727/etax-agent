/**
 * systemOneSettingsRepository.ts — SystemOne（jev）接続設定の保存（repositories）。
 *
 * 設定画面から入力された接続先（ベースURL・APIキー・モデル）を、サーバーの
 * データディレクトリの JSON ファイルに保存する。読み込んだ値は lib/config の
 * 上書きとして保持され、loadSystemOneConfig() が環境変数より優先して使う。
 * APIキーを含むため、このファイルは Git 管理外（データディレクトリ配下）。
 * マルチテナント分離のため、ファイルと上書きは所有者ごとに分ける
 * （settingsFiles 参照。既定ユーザーは従来のファイル名をそのまま使う）。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  serverDataDir,
  setSystemOneOverrides,
  setSystemOneOverridesForOwner,
  SystemOneOverrides,
} from "../lib/config";
import { ownerIdForWrite } from "../lib/tenantContext";
import { listSettingsOwnerIds, settingsFilePath } from "./settingsFiles";

const SETTINGS_FILENAME = "systemone-settings.json";

function settingsPath(ownerId: number): string {
  return settingsFilePath(SETTINGS_FILENAME, ownerId);
}

/** 保存済みの設定を読む（無ければ空）。APIキーは有無だけを外に出す。 */
export async function readStoredSystemOneSettings(
  ownerId: number = ownerIdForWrite(),
): Promise<SystemOneOverrides> {
  try {
    const text = await readFile(settingsPath(ownerId), "utf-8");
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const overrides: SystemOneOverrides = {};
    if (typeof record["baseUrl"] === "string" && record["baseUrl"]) {
      overrides.baseUrl = record["baseUrl"];
    }
    const storedKey = record["apiKey"];
    if (typeof storedKey === "string" && storedKey) {
      overrides.apiKey = storedKey;
    }
    if (typeof record["model"] === "string" && record["model"]) {
      overrides.model = record["model"];
    }
    return overrides;
  } catch {
    return {};
  }
}

/** 起動時に保存済み設定を読み、全所有者分を lib/config の上書きとして反映する。 */
export async function loadSystemOneSettings(): Promise<void> {
  for (const ownerId of await listSettingsOwnerIds(SETTINGS_FILENAME)) {
    setSystemOneOverridesForOwner(ownerId, await readStoredSystemOneSettings(ownerId));
  }
}

/** 設定を保存し、その場で上書きとして反映する。 */
export async function saveSystemOneSettings(
  overrides: SystemOneOverrides,
): Promise<void> {
  const ownerId = ownerIdForWrite();
  await mkdir(serverDataDir(), { recursive: true });
  await writeFile(settingsPath(ownerId), JSON.stringify(overrides, null, 2), "utf-8");
  setSystemOneOverrides(overrides);
}
