import { Transaction } from "@etax/shared";
import { AgentConnectionConfig } from "./AgentConnection";
import { AppView } from "./AppView";
import { SendKeyMode } from "./Chat";
import { ThemeMode } from "./Theme";

/** 確定申告画面のタブ。URL（/accounts/<年度>/final-tax/<タブ>）と連動する。 */
export type FilingTab = "overview" | "balance" | "deductions" | "consumption" | "taxpayer";

/**
 * 画面（ビュー）コンポーネント共通の props。
 * ビュー切替の対応表（AppPage の appViews）へ載せるため全ビューで揃える。
 * year は左上の年度切替（AppPage が保持）から配られる。
 * themeMode は設定画面だけが使うが、全ビュー共通の形に揃えて配る。
 */
export interface ViewPageProps {
  transactions: Transaction[];
  year: number;
  onUseTransactions: (transactions: Transaction[]) => void;
  onLoadSample: () => void;
  /** 帳簿画面の変更を全体へ反映する（メモリのみ・画面遷移なし）。 */
  onSyncTransactions?: (transactions: Transaction[]) => void;
  /** 他画面への遷移（帳簿の「追加」ドロップダウンなどから使う）。 */
  onNavigate?: (view: AppView) => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  /** チャットの送信キー。設定画面だけが使うが、テーマと同じく共通の形で配る。 */
  sendKeyMode: SendKeyMode;
  onSendKeyModeChange: (mode: SendKeyMode) => void;
  /** 外部接続（AI）の上書き設定。設定画面だけが使うが、共通の形で配る。 */
  agentConnection: AgentConnectionConfig;
  onAgentConnectionChange: (config: AgentConnectionConfig) => void;
  /** 確定申告画面のタブ（URL連動）。確定申告画面だけが使うが、共通の形で配る。 */
  filingTab?: FilingTab;
  onFilingTabChange?: (tab: FilingTab) => void;
}
