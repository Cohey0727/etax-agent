/**
 * jevPromptRepository.ts — jev 用プロンプトの手編集（上書き）の保存（repositories）。
 *
 * 設定画面の「AIのメモリー」で編集されたプロンプトを、サーバーの
 * データディレクトリの JSON ファイルに保存する。保存された値は lib/config の
 * 上書きとして保持され、科目判定では学習履歴から自動生成されるプロンプトより
 * 優先される。空文字で保存すると上書きが消え、自動生成に戻る。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getJevPromptOverride, serverDataDir, setJevPromptOverride } from "../lib/config";

const PROMPT_FILENAME = "jev-prompt.json";

function promptPath(): string {
  return join(serverDataDir(), PROMPT_FILENAME);
}

/** 保存済みのプロンプト上書きを読む（無ければ空文字）。 */
export async function readStoredJevPrompt(): Promise<string> {
  try {
    const text = await readFile(promptPath(), "utf-8");
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) return "";
    const prompt = (parsed as Record<string, unknown>)["prompt"];
    return typeof prompt === "string" ? prompt : "";
  } catch {
    return "";
  }
}

/** 起動時に保存済みプロンプトを読み、lib/config の上書きとして反映する。 */
export async function loadJevPromptOverride(): Promise<void> {
  setJevPromptOverride(await readStoredJevPrompt());
}

/** プロンプトを保存し、その場で上書きとして反映する。現在の上書きを返す。 */
export async function saveJevPromptOverride(prompt: string): Promise<string> {
  const trimmed = prompt.trim();
  await mkdir(serverDataDir(), { recursive: true });
  await writeFile(promptPath(), JSON.stringify({ prompt: trimmed }, null, 2), "utf-8");
  setJevPromptOverride(trimmed);
  return getJevPromptOverride();
}
