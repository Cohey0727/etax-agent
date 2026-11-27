/**
 * agentSettingsTools.ts — 対話エージェントの設定系ツール実処理（services/agent）。
 *
 * 画面（設定・申告ステータス・納税者情報）でできる操作を、エージェントからも
 * 行えるようにする。設定だろうが何だろうが、エージェントに頼めるのが方針。
 * 各関数はツールの引数を受け取り、LLM へ返す結果オブジェクトを返す。
 * 失敗は例外として投げ、呼び出し側（agentAiTools）が { ok: false, error } に
 * 変えて LLM へ返す。
 */
import { loadSystemOneConfig } from "../../lib/config";
import {
  filingStatusToApi,
  listFilingStatusRows,
  upsertFilingStatusRow,
} from "../../repositories/filingStatusRepository";
import { saveJevPromptOverride } from "../../repositories/jevPromptRepository";
import { saveRegexRulesOverride } from "../../repositories/regexRulesRepository";
import { readStoredSystemOneSettings } from "../../repositories/systemOneSettingsRepository";
import {
  emptyTaxpayerProfile,
  findTaxpayerCarryRow,
  getTaxpayerProfileRow,
  taxpayerProfileToApi,
  upsertTaxpayerProfileRow,
} from "../../repositories/taxpayerRepository";
import { TaxpayerProfile } from "../../schemas/taxpayer";
import { buildJevPromptView } from "../classification/jevPromptView";
import { buildRegexRulesView } from "../classification/regexRulesView";
import { RegexRule } from "../classification/generateRules";
import { updateSystemOneSettings } from "../classification/updateSystemOneSettings";
import { validateJevPrompt } from "../classification/validateJevPrompt";
import { validateRegexRules } from "../classification/validateRegexRules";
import { toSystemOneSettingsResponse } from "../../usecases/systemOneSettingsView";
import { requireDb } from "../mcp/mcpToolKit";

/** 正規表現ルール一式（カスタム／自動生成／実効）を返す。 */
export async function getClassificationRulesForAgent() {
  return buildRegexRulesView();
}

/** 正規表現ルール一式を保存する。空配列で自動生成に戻る。 */
export async function setClassificationRulesForAgent(rules: RegexRule[]) {
  const validated = validateRegexRules(rules);
  if (!validated.ok) throw new Error(validated.message);
  await saveRegexRulesOverride(validated.rules);
  return buildRegexRulesView();
}

/** jev 用プロンプト（カスタム／自動生成／実効）を返す。 */
export async function getJevPromptForAgent() {
  const view = await buildJevPromptView();
  return {
    custom_prompt: view.customPrompt,
    generated_prompt: view.generatedPrompt,
    effective_prompt: view.effectivePrompt,
  };
}

/** jev 用プロンプトを保存する。空文字で自動生成に戻る。 */
export async function setJevPromptForAgent(prompt: string) {
  const validated = validateJevPrompt(prompt);
  if (!validated.ok) throw new Error(validated.message);
  await saveJevPromptOverride(prompt);
  return getJevPromptForAgent();
}

/** SystemOne の接続設定（保存値と実効値。APIキーは有無だけ）を返す。 */
export async function getSystemOneSettingsForAgent() {
  const stored = await readStoredSystemOneSettings();
  const effective = loadSystemOneConfig();
  const view = toSystemOneSettingsResponse(stored, effective);
  return {
    base_url: view.baseUrl,
    model: view.model,
    api_key_set: view.apiKeySet,
    effective_base_url: view.effectiveBaseUrl,
    effective_model: view.effectiveModel,
  };
}

/** SystemOne の接続設定を更新する。空の項目は変更しない。 */
export async function updateSystemOneSettingsForAgent(args: {
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}) {
  const unlessBlank = (value: string | undefined) => (value?.trim() ? value : undefined);
  await updateSystemOneSettings({
    baseUrl: unlessBlank(args.baseUrl),
    model: unlessBlank(args.model),
    apiKey: unlessBlank(args.apiKey),
  });
  return getSystemOneSettingsForAgent();
}

/** 申告ステータスを返す。year 省略時は全年度。 */
export async function getFilingStatusForAgent(year?: number) {
  const db = requireDb();
  const rows = await listFilingStatusRows(db);
  const api = rows.map(filingStatusToApi);
  if (year === undefined) return { statuses: api };
  return { status: api.find((s) => s.year === year) ?? null };
}

/** 指定年の申告ステータスを更新する（指定した項目だけ）。 */
export async function setFilingStatusForAgent(
  year: number,
  patch: { confirmed?: boolean; calculated?: boolean; submitted?: boolean },
) {
  const db = requireDb();
  const row = await upsertFilingStatusRow(db, year, patch);
  return row ? filingStatusToApi(row) : { ok: false, error: "申告ステータスを更新できませんでした" };
}

/**
 * 外部 LLM へ値を渡さない識別番号（マイナンバーと e-Tax の利用者識別番号）。
 * アプリの DB 内だけに置き、エージェントには登録有無だけを伝える。
 */
const MASKED_TAXPAYER_KEYS = ["my_number", "user_id"] as const;

/**
 * エージェント（外部 LLM）へ返す形に納税者プロフィールを整える。
 * ツール結果は呼び出しログにも残るため、ここで落とすことでログへの混入も防ぐ。
 */
export function taxpayerProfileForAgent(profile: TaxpayerProfile) {
  return {
    ...profile,
    my_number: "",
    my_number_registered: profile.my_number !== "",
    user_id: "",
    user_id_registered: profile.user_id !== "",
  };
}

/** 納税者プロフィールを返す（無ければ過去年からの引き継ぎ、無ければ空）。 */
export async function getTaxpayerProfileForAgent(year: number) {
  const db = requireDb();
  const own = await getTaxpayerProfileRow(db, year);
  if (own) return { taxpayer: taxpayerProfileForAgent(taxpayerProfileToApi(own)), carried_from: null };
  const carry = await findTaxpayerCarryRow(db, year);
  return carry
    ? { taxpayer: taxpayerProfileForAgent(taxpayerProfileToApi(carry)), carried_from: carry.year }
    : { taxpayer: taxpayerProfileForAgent(emptyTaxpayerProfile()), carried_from: null };
}

/** 納税者プロフィールを更新する（指定した項目だけ。未指定は現在の値を維持）。 */
export async function updateTaxpayerProfileForAgent(year: number, patch: Partial<TaxpayerProfile>) {
  const db = requireDb();
  // マージ元はマスクされていない実値で読む（マスク済みを書き戻すと
  // 保存済みマイナンバーが消えてしまうため、読みは内部用に分ける）。
  const own = await getTaxpayerProfileRow(db, year);
  const carry = own ? null : await findTaxpayerCarryRow(db, year);
  const current: TaxpayerProfile = own
    ? taxpayerProfileToApi(own)
    : carry
      ? taxpayerProfileToApi(carry)
      : emptyTaxpayerProfile();
  const allowed = new Set(Object.keys(emptyTaxpayerProfile()) as (keyof TaxpayerProfile)[]);
  const masked: ReadonlySet<string> = new Set(MASKED_TAXPAYER_KEYS);
  const merged: TaxpayerProfile = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key as keyof TaxpayerProfile) || value === undefined) continue;
    // マスクした値（空文字）を LLM がそのまま書き戻しても保存値を消さない。
    if (masked.has(key) && value === "") continue;
    (merged as Record<string, unknown>)[key] = value;
  }
  const row = await upsertTaxpayerProfileRow(db, year, merged);
  return row
    ? taxpayerProfileForAgent(taxpayerProfileToApi(row))
    : { ok: false, error: "納税者プロフィールを更新できませんでした" };
}
