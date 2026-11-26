import {
  DeductionInputs,
  FilingType,
  MiscIncomeInput,
  TaxCreditInputs,
  normalizeAgricultureInput,
  normalizeExpandedIncomeInput,
} from "@etax/shared";
import {
  BreakdownEntriesKey,
  BreakdownEntry,
  DeductionState,
  applyBreakdownEntries,
} from "@/features/filing/deductionState";

/** エージェントが代行する画面操作（Web の agentChatHelpers と同じ導出規則）。 */
export type AgentUiAction =
  | { type: "setYear"; year: number }
  | { type: "navigate"; route: "/" | "/filing" | "/taxpayer" }
  | { type: "reloadTransactions" }
  | { type: "applyDeductions"; year: number; patch: DeductionPatch }
  | { type: "reloadView" };

/** エージェント（set_deductions ツール）から適用される控除入力の変更分。 */
export interface DeductionPatch {
  deductions?: Partial<DeductionInputs>;
  taxCredits?: Partial<TaxCreditInputs>;
  filingType?: FilingType;
  miscIncome?: Partial<MiscIncomeInput>;
  expandedIncome?: Parameters<typeof normalizeExpandedIncomeInput>[0];
  agriculture?: Parameters<typeof normalizeAgricultureInput>[0];
  entries?: Partial<Record<BreakdownEntriesKey, BreakdownEntry[]>>;
}

const WRITE_TOOL_NAMES = new Set(["update_transactions", "add_transaction", "delete_transaction"]);
const SETTINGS_WRITE_TOOL_NAMES = new Set([
  "set_classification_rules",
  "set_jev_prompt",
  "update_systemone_settings",
]);

interface ToolCallLike {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

function resultOk(result: unknown): boolean {
  return (result as { ok?: unknown } | undefined)?.ok === true;
}

/** ツール実行結果 → 画面操作。同じ操作は1ターンに1回だけ。 */
export function deriveUiActions(toolCalls: ToolCallLike[]): AgentUiAction[] {
  const actions: AgentUiAction[] = [];
  const seen = new Set<string>();
  const push = (action: AgentUiAction) => {
    const key = JSON.stringify(action);
    if (!seen.has(key)) {
      seen.add(key);
      actions.push(action);
    }
  };
  for (const tc of toolCalls) {
    if (tc.name === "aggregate_year" || tc.name === "consumption_tax") {
      if (typeof tc.arguments.year === "number") push({ type: "setYear", year: tc.arguments.year });
      push({ type: "navigate", route: "/" });
    } else if (tc.name === "amendment_delta") {
      push({ type: "navigate", route: "/filing" });
    } else if (WRITE_TOOL_NAMES.has(tc.name)) {
      if (resultOk(tc.result)) push({ type: "reloadTransactions" });
    } else if (tc.name === "set_deductions") {
      const result = tc.result as
        | { ok?: unknown; applied?: unknown; year?: unknown; patch?: unknown }
        | undefined;
      if (result?.ok === true && result.applied === "deductions" && typeof result.year === "number") {
        push({
          type: "applyDeductions",
          year: result.year,
          patch: (result.patch ?? {}) as DeductionPatch,
        });
        push({ type: "navigate", route: "/filing" });
      }
    } else if (tc.name === "set_filing_status") {
      if (resultOk(tc.result)) {
        push({ type: "navigate", route: "/filing" });
        push({ type: "reloadView" });
      }
    } else if (tc.name === "update_taxpayer_profile") {
      if (resultOk(tc.result)) {
        push({ type: "navigate", route: "/taxpayer" });
        push({ type: "reloadView" });
      }
    } else if (SETTINGS_WRITE_TOOL_NAMES.has(tc.name)) {
      if (resultOk(tc.result)) push({ type: "reloadView" });
    }
    // set_theme はネイティブにテーマ切替の相当物がないため適用しない
  }
  return actions;
}

/** 変更分を現在の控除状態へ適用した新しい状態を返す。 */
export function applyDeductionPatch(state: DeductionState, patch: DeductionPatch): DeductionState {
  let next = state;
  if (patch.deductions) {
    const d = patch.deductions;
    next = {
      ...next,
      deductions: {
        ...next.deductions,
        ...d,
        lifeInsurance: { ...next.deductions.lifeInsurance, ...(d.lifeInsurance ?? {}) },
        earthquakeInsurance: {
          ...next.deductions.earthquakeInsurance,
          ...(d.earthquakeInsurance ?? {}),
        },
        dependents: { ...next.deductions.dependents, ...(d.dependents ?? {}) },
        disability: { ...next.deductions.disability, ...(d.disability ?? {}) },
      },
    };
  }
  if (patch.taxCredits) next = { ...next, taxCredits: { ...next.taxCredits, ...patch.taxCredits } };
  if (patch.agriculture) {
    next = {
      ...next,
      agriculture: normalizeAgricultureInput({ ...next.agriculture, ...patch.agriculture }),
    };
  }
  if (patch.filingType) next = { ...next, filingType: patch.filingType };
  if (patch.miscIncome) next = { ...next, miscIncome: { ...next.miscIncome, ...patch.miscIncome } };
  if (patch.expandedIncome) {
    const p = patch.expandedIncome as {
      temp?: Record<string, unknown>;
      dividend?: Record<string, unknown>;
      stocks?: { general?: Record<string, unknown>; listed?: Record<string, unknown> } & Record<string, unknown>;
    };
    const cur = next.expandedIncome;
    next = {
      ...next,
      expandedIncome: normalizeExpandedIncomeInput({
        temp: { ...cur.temp, ...(p.temp ?? {}) },
        dividend: { ...cur.dividend, ...(p.dividend ?? {}) },
        stocks: {
          ...cur.stocks,
          ...(p.stocks ?? {}),
          general: { ...cur.stocks.general, ...(p.stocks?.general ?? {}) },
          listed: { ...cur.stocks.listed, ...(p.stocks?.listed ?? {}) },
        },
      } as Parameters<typeof normalizeExpandedIncomeInput>[0]),
    };
  }
  if (patch.entries) {
    for (const key of Object.keys(patch.entries) as BreakdownEntriesKey[]) {
      const entries = patch.entries[key];
      if (entries) next = applyBreakdownEntries(next, key, entries);
    }
  }
  return next;
}

/** ツール名の日本語ラベル（チャットのツールチップ表示用）。 */
const TOOL_LABELS: Record<string, string> = {
  import_csv_info: "取込データの確認",
  search_transactions: "取引を検索",
  aggregate_year: "所得を集計",
  consumption_tax: "消費税を計算",
  amendment_delta: "修正申告の差分",
  search_tax_knowledge: "税務知識を検索",
  update_transactions: "取引を一括変更",
  add_transaction: "取引を追加",
  delete_transaction: "取引を削除",
  classify_account: "科目を判定",
  get_classification_rules: "分類ルールを確認",
  set_classification_rules: "分類ルールを保存",
  get_jev_prompt: "判定プロンプトを確認",
  set_jev_prompt: "判定プロンプトを保存",
  get_systemone_settings: "科目判定AIの設定を確認",
  update_systemone_settings: "科目判定AIの設定を保存",
  set_deductions: "控除入力を変更",
  get_deductions: "控除入力を確認",
  set_filing_status: "申告ステータスを変更",
  update_taxpayer_profile: "納税者情報を変更",
  set_theme: "テーマを変更",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}
