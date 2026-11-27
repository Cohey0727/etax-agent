/**
 * jevPromptRepository.ts — jev 用プロンプトの手編集（上書き）の保存（repositories）。
 *
 * 設定画面の「AIのメモリー」で編集されたプロンプトを、サーバーの
 * データディレクトリの JSON ファイルに保存する。保存された値は lib/config の
 * 上書きとして保持され、科目判定では学習履歴から自動生成されるプロンプトより
 * 優先される。空文字で保存すると上書きが消え、自動生成に戻る。
 * マルチテナント分離のため、ファイルと上書きは所有者ごとに分ける
 * （settingsFiles 参照。既定ユーザーは従来のファイル名をそのまま使う）。
 */
import { mkdir, readFile } from "node:fs/promises";
import { serializeFileUpdate, writeFileAtomic } from "../lib/atomicFile";
import {
  getJevPromptOverride,
  serverDataDir,
  setJevPromptOverride,
  setJevPromptOverrideForOwner,
} from "../lib/config";
import { ownerIdForWrite } from "../lib/tenantContext";
import { listSettingsOwnerIds, settingsFilePath } from "./settingsFiles";

const PROMPT_FILENAME = "jev-prompt.json";

function promptPath(ownerId: number): string {
  return settingsFilePath(PROMPT_FILENAME, ownerId);
}

/** 保存済みのプロンプト上書きを読む（無ければ空文字）。 */
export async function readStoredJevPrompt(
  ownerId: number = ownerIdForWrite(),
): Promise<string> {
  try {
    const text = await readFile(promptPath(ownerId), "utf-8");
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) return "";
    const prompt = (parsed as Record<string, unknown>)["prompt"];
    return typeof prompt === "string" ? prompt : "";
  } catch {
    return "";
  }
}

/** 起動時に保存済みプロンプトを読み、全所有者分を lib/config の上書きとして反映する。 */
export async function loadJevPromptOverride(): Promise<void> {
  for (const ownerId of await listSettingsOwnerIds(PROMPT_FILENAME)) {
    setJevPromptOverrideForOwner(ownerId, await readStoredJevPrompt(ownerId));
  }
}

/** プロンプトを保存し、その場で上書きとして反映する。現在の上書きを返す。 */
export async function saveJevPromptOverride(prompt: string): Promise<string> {
  const path = promptPath(ownerIdForWrite());
  const trimmed = prompt.trim();
  // ファイルとメモリ上の上書きを、保存した順のまま揃える
  await serializeFileUpdate(path, async () => {
    await mkdir(serverDataDir(), { recursive: true });
    await writeFileAtomic(path, JSON.stringify({ prompt: trimmed }, null, 2));
    setJevPromptOverride(trimmed);
  });
  return getJevPromptOverride();
}
