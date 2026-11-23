/**
 * regexRulesRepository.ts — 正規表現ルールの手編集（上書き）の保存（repositories）。
 *
 * 設定画面の「AIのメモリー」で編集されたルール一式を、サーバーの
 * データディレクトリの JSON ファイルに保存する。保存された値は lib/config の
 * 上書きとして保持され、科目判定では学習履歴から自動生成されるルールより
 * 優先される（実効ルールはカスタムそのもの）。空の配列で保存すると
 * 上書きが消え、自動生成に戻る。
 * マルチテナント分離のため、ファイルと上書きは所有者ごとに分ける
 * （settingsFiles 参照。既定ユーザーは従来のファイル名をそのまま使う）。
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  getRegexRulesOverride,
  serverDataDir,
  setRegexRulesOverride,
  setRegexRulesOverrideForOwner,
} from "../lib/config";
import { ownerIdForWrite } from "../lib/tenantContext";
import { listSettingsOwnerIds, settingsFilePath } from "./settingsFiles";
import { RegexRule } from "../services/classification/generateRules";

const RULES_FILENAME = "regex-rules.json";

function rulesPath(ownerId: number): string {
  return settingsFilePath(RULES_FILENAME, ownerId);
}

/** 保存済みのルール上書きを読む（無ければ null）。壊れた要素は捨てる。 */
export async function readStoredRegexRules(
  ownerId: number = ownerIdForWrite(),
): Promise<RegexRule[] | null> {
  try {
    const text = await readFile(rulesPath(ownerId), "utf-8");
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== "object" || parsed === null) return null;
    const rules = (parsed as Record<string, unknown>)["rules"];
    if (!Array.isArray(rules)) return null;
    const cleaned = rules.filter(
      (r): r is RegexRule =>
        typeof r === "object" &&
        r !== null &&
        typeof (r as RegexRule).pattern === "string" &&
        (r as RegexRule).pattern !== "" &&
        typeof (r as RegexRule).category === "string" &&
        (r as RegexRule).category !== "",
    );
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
}

/** 起動時に保存済みルールを読み、全所有者分を lib/config の上書きとして反映する。 */
export async function loadRegexRulesOverride(): Promise<void> {
  for (const ownerId of await listSettingsOwnerIds(RULES_FILENAME)) {
    setRegexRulesOverrideForOwner(ownerId, await readStoredRegexRules(ownerId));
  }
}

/** ルールを保存し、その場で上書きとして反映する。現在の上書きを返す。 */
export async function saveRegexRulesOverride(rules: RegexRule[]): Promise<RegexRule[] | null> {
  const ownerId = ownerIdForWrite();
  const cleaned = rules
    .map((r) => ({ pattern: r.pattern.trim(), category: r.category }))
    .filter((r) => r.pattern !== "");
  await mkdir(serverDataDir(), { recursive: true });
  await writeFile(rulesPath(ownerId), JSON.stringify({ rules: cleaned }, null, 2), "utf-8");
  setRegexRulesOverride(cleaned.length > 0 ? cleaned : null);
  return getRegexRulesOverride();
}
