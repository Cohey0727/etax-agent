import { DeductionPatch } from "@etax/shared";
import { AppView, ChatRole, ThemeMode } from "@types";
import { ChatSession } from "@utils";

/**
 * agentChatHelpers.ts — エージェントのツール実行結果から画面操作を導く
 * 変換と、チャット表示用のラベル・要約ヘルパー。
 */

/**
 * エージェントが代行する画面操作。ツール実行結果から導き、AppPage が実際の状態変更を行う。
 * - setYear: 年度切替（集計・消費税計算が対象年を引いたとき）
 * - navigate: 画面遷移（集計系はダッシュボード、修正申告の差分は確定申告画面）
 */
export type AgentUiAction =
  | { type: "setYear"; year: number }
  | { type: "navigate"; view: AppView }
  | { type: "setTheme"; mode: ThemeMode }
  | { type: "reloadTransactions" }
  /** 控除入力の変更を画面側の保存値へ適用する（set_deductions の結果）。 */
  | { type: "applyDeductions"; year: number; patch: DeductionPatch }
  /** 変更の影響を受ける画面を、表示中なら読み直す（他の画面の未保存の入力は残す）。 */
  | { type: "reloadView"; view: AppView };

/** サーバーから届くツール実行の記録。 */
interface ToolCallRecord {
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
}

const succeeded = (tc: ToolCallRecord): boolean =>
  (tc.result as { ok?: unknown } | undefined)?.ok === true;

/** 集計・消費税計算は、対象年へ切り替えてダッシュボードで見せる。 */
const showYearOnDashboard = (tc: ToolCallRecord): AgentUiAction[] => [
  ...(typeof tc.arguments.year === "number"
    ? [{ type: "setYear", year: tc.arguments.year } as const]
    : []),
  { type: "navigate", view: AppView.Dashboard },
];

/** 帳簿の書き込みが成功したら、画面の取引と、帳簿を自前で読む画面（帳簿・領収書）を読み直す。 */
const reloadLedger = (tc: ToolCallRecord): AgentUiAction[] =>
  succeeded(tc)
    ? [
        { type: "reloadTransactions" },
        { type: "reloadView", view: AppView.Ledger },
        { type: "reloadView", view: AppView.Receipt },
      ]
    : [];

/** 設定の変更は、設定画面を開いていればその表示に効く。 */
const reloadSettings = (tc: ToolCallRecord): AgentUiAction[] =>
  succeeded(tc) ? [{ type: "reloadView", view: AppView.Settings }] : [];

/** ツール名 → 画面操作。ここに無いツール（参照系）は画面を変えない。 */
const toolUiActions = new Map<string, (tc: ToolCallRecord) => AgentUiAction[]>([
  ["aggregate_year", showYearOnDashboard],
  ["consumption_tax", showYearOnDashboard],
  // 修正の比較は確定申告画面（前回確定との差分）に出す。
  ["amendment_delta", () => [{ type: "navigate", view: AppView.Filing }]],
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
        { type: "navigate", view: AppView.Filing },
      ];
    },
  ],
  [
    "set_filing_status",
    (tc) =>
      succeeded(tc)
        ? [
            { type: "navigate", view: AppView.Filing },
            { type: "reloadView", view: AppView.Filing },
          ]
        : [],
  ],
  [
    "update_taxpayer_profile",
    (tc) =>
      succeeded(tc)
        ? [
            { type: "navigate", view: AppView.Taxpayer },
            { type: "reloadView", view: AppView.Taxpayer },
          ]
        : [],
  ],
  ["set_classification_rules", reloadSettings],
  ["set_jev_prompt", reloadSettings],
  ["update_systemone_settings", reloadSettings],
]);

/** ツール実行結果 → 画面操作。同じ操作は1ターンに1回だけ。 */
export const deriveUiActions = (toolCalls: ToolCallRecord[]): AgentUiAction[] => {
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
};

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
  get_systemone_settings: "判定モデル設定を確認",
  update_systemone_settings: "判定モデル設定を変更",
  get_filing_status: "申告ステータスを確認",
  set_filing_status: "申告ステータスを変更",
  get_taxpayer_profile: "納税者情報を確認",
  update_taxpayer_profile: "納税者情報を変更",
  get_deductions: "控除入力を確認",
  set_deductions: "控除入力を変更",
  set_theme: "テーマを変更",
};

export const toolLabel = (name: string): string => TOOL_LABELS[name] ?? name;

/** チップに出す引数の要約（主要なものだけ短く）。 */
export const summarizeToolArgs = (args: Record<string, unknown>): string => {
  const parts: string[] = [];
  const text = (v: unknown, max = 18): string => {
    const s = String(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };
  if (typeof args.year === "number") parts.push(`${args.year}年`);
  if (typeof args.keyword === "string" && args.keyword) parts.push(text(args.keyword));
  if (typeof args.description === "string" && args.description) parts.push(text(args.description));
  if (typeof args.query === "string" && args.query) parts.push(text(args.query));
  if (typeof args.mode === "string") parts.push(args.mode);
  if (typeof args.method === "string") parts.push(args.method);
  if (typeof args.set_category === "string") parts.push(`→ ${args.set_category}`);
  if (typeof args.category === "string" && !args.set_category) parts.push(args.category);
  if (Array.isArray(args.rules)) parts.push(`${args.rules.length}件のルール`);
  if (typeof args.prompt === "string") {
    parts.push(args.prompt === "" ? "自動生成に戻す" : `${args.prompt.length}文字`);
  }
  return parts.join("・");
};

/** 履歴一覧に出す、その会話の最初の質問の抜粋。 */
export function sessionExcerpt(session: ChatSession): string {
  const first = session.messages.find((m) => m.role === ChatRole.User) ?? session.messages[0];
  const text = first?.content.replaceAll("\n", " ") ?? "";
  return text.length > 42 ? `${text.slice(0, 42)}…` : text;
}
