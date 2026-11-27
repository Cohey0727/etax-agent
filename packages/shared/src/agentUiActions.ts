/**
 * agentUiActions.ts — エージェントのツール実行結果から画面操作を導く変換と、
 * チャットの表示に使うツール名のラベル・会話履歴の日時と抜粋。Web と native が共通で使う。
 * 遷移先の画面は AgentScreen で表し、各アプリが自分の画面（Web の AppView・native のルート）へ写す。
 */
import { ChatRole, type ChatMessage } from "./apiWire";
import type { DeductionPatch } from "./filingInputs";

/** エージェントの画面操作で、遷移・読み直しの対象になる画面。 */
export const AgentScreen = {
  Dashboard: "dashboard",
  Ledger: "ledger",
  Receipt: "receipt",
  Filing: "filing",
  Taxpayer: "taxpayer",
  Settings: "settings",
} as const;

export type AgentScreen = (typeof AgentScreen)[keyof typeof AgentScreen];

/** エージェントが切り替えられる外観テーマ（set_theme の mode）。 */
export type AgentThemeMode = "light" | "dark" | "system";

/**
 * エージェントが代行する画面操作。ツール実行結果から導き、各アプリが実際の状態変更を行う。
 * - setYear: 年度切替（集計・消費税計算が対象年を引いたとき）
 * - navigate: 画面遷移（集計系はダッシュボード、修正申告の差分は確定申告画面）
 */
export type AgentUiAction =
  | { type: "setYear"; year: number }
  | { type: "navigate"; screen: AgentScreen }
  | { type: "setTheme"; mode: AgentThemeMode }
  | { type: "reloadTransactions" }
  /** 控除入力の変更を画面側の保存値へ適用する（set_deductions の結果）。 */
  | { type: "applyDeductions"; year: number; patch: DeductionPatch }
  /** 変更の影響を受ける画面を、表示中なら読み直す（他の画面の未保存の入力は残す）。 */
  | { type: "reloadView"; screen: AgentScreen };

/** サーバーから届くツール実行の記録。 */
export interface AgentToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

const succeeded = (tc: AgentToolCallRecord): boolean =>
  (tc.result as { ok?: unknown } | undefined)?.ok === true;

/** 集計・消費税計算は、対象年へ切り替えてダッシュボードで見せる。 */
const showYearOnDashboard = (tc: AgentToolCallRecord): AgentUiAction[] => [
  ...(typeof tc.arguments.year === "number"
    ? [{ type: "setYear", year: tc.arguments.year } as const]
    : []),
  { type: "navigate", screen: AgentScreen.Dashboard },
];

/** 帳簿の書き込みが成功したら、画面の取引と、帳簿を自前で読む画面（帳簿・領収書）を読み直す。 */
const reloadLedger = (tc: AgentToolCallRecord): AgentUiAction[] =>
  succeeded(tc)
    ? [
        { type: "reloadTransactions" },
        { type: "reloadView", screen: AgentScreen.Ledger },
        { type: "reloadView", screen: AgentScreen.Receipt },
      ]
    : [];

/** 設定の変更は、設定画面を開いていればその表示に効く。 */
const reloadSettings = (tc: AgentToolCallRecord): AgentUiAction[] =>
  succeeded(tc) ? [{ type: "reloadView", screen: AgentScreen.Settings }] : [];

/** ツール名 → 画面操作。ここに無いツール（参照系）は画面を変えない。 */
const toolUiActions = new Map<string, (tc: AgentToolCallRecord) => AgentUiAction[]>([
  ["aggregate_year", showYearOnDashboard],
  ["consumption_tax", showYearOnDashboard],
  // 修正の比較は確定申告画面（前回確定との差分）に出す。
  ["amendment_delta", () => [{ type: "navigate", screen: AgentScreen.Filing }]],
  [
    "set_theme",
    (tc) => {
      const mode = tc.arguments.mode;
      return mode === "light" || mode === "dark" || mode === "system"
        ? [{ type: "setTheme", mode }]
        : [];
    },
  ],
  ["update_transactions", reloadLedger],
  ["add_transaction", reloadLedger],
  ["delete_transaction", reloadLedger],
  [
    "set_deductions",
    (tc) => {
      // 控除入力の変更は画面側の保存値へ適用し、確定申告画面で見せる。
      const result = tc.result as
        | { ok?: unknown; applied?: unknown; year?: unknown; patch?: unknown }
        | undefined;
      if (result?.ok !== true || result.applied !== "deductions" || typeof result.year !== "number") {
        return [];
      }
      return [
        { type: "applyDeductions", year: result.year, patch: (result.patch ?? {}) as DeductionPatch },
        { type: "navigate", screen: AgentScreen.Filing },
      ];
    },
  ],
  [
    "set_filing_status",
    (tc) =>
      succeeded(tc)
        ? [
            { type: "navigate", screen: AgentScreen.Filing },
            { type: "reloadView", screen: AgentScreen.Filing },
          ]
        : [],
  ],
  [
    "update_taxpayer_profile",
    (tc) =>
      succeeded(tc)
        ? [
            { type: "navigate", screen: AgentScreen.Taxpayer },
            { type: "reloadView", screen: AgentScreen.Taxpayer },
          ]
        : [],
  ],
  ["set_classification_rules", reloadSettings],
  ["set_jev_prompt", reloadSettings],
  ["update_systemone_settings", reloadSettings],
]);

/** ツール実行結果 → 画面操作。同じ操作は1ターンに1回だけ。 */
export function deriveUiActions(toolCalls: readonly AgentToolCallRecord[]): AgentUiAction[] {
  const actions: AgentUiAction[] = [];
  const seen = new Set<string>();
  for (const tc of toolCalls) {
    for (const action of toolUiActions.get(tc.name)?.(tc) ?? []) {
      const key = JSON.stringify(action);
      if (seen.has(key)) continue;
      seen.add(key);
      actions.push(action);
    }
  }
  return actions;
}

/** ツール名の日本語ラベル（チャットのツール表示用）。 */
const toolLabels: Record<string, string> = {
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
  get_filing_status: "申告ステータスを確認",
  set_filing_status: "申告ステータスを変更",
  get_taxpayer_profile: "納税者情報を確認",
  update_taxpayer_profile: "納税者情報を変更",
  get_deductions: "控除入力を確認",
  set_deductions: "控除入力を変更",
  set_theme: "テーマを変更",
};

/** ツール名の表示名。ラベルの無いツールは名前をそのまま返す。 */
export function agentToolLabel(name: string): string {
  return toolLabels[name] ?? name;
}

/** 会話履歴の保存日時の表示（端末の時刻で YYYY/MM/DD HH:mm）。解釈できなければそのまま返す。 */
export function formatChatSessionDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 履歴一覧に出す、その会話の最初の質問の抜粋（改行は空白にし、42文字まで）。 */
export function chatSessionExcerpt(messages: readonly ChatMessage[]): string {
  const first = messages.find((m) => m.role === ChatRole.User) ?? messages[0];
  const text = first?.content.replaceAll("\n", " ") ?? "";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
