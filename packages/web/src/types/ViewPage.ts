import { Transaction } from "@etax/shared";
import { AgentConnectionConfig } from "./Api";
import { AppView } from "./AppView";
import { SendKeyMode } from "./Chat";
import { ThemeMode } from "./Theme";

/** 確定申告画面のタブ。URL（/accounts/<年度>/final-tax/<タブ>）と連動する。 */
export type FilingTab = "overview" | "balance" | "deductions" | "consumption";

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
  /**
   * 領収書から帳簿へ登録した取引を、画面の取引へ加える（保存は登録側で済んでいる）。
   * 登録後も画面に留まり、続けて撮影・登録できる。領収書画面だけが使う。
   */
  onRegisterTransaction?: (transaction: Transaction) => void;
  /**
   * CSV取込（DB保存済み）の「ダッシュボードで使う」専用。取込レスポンスは
   * 新規分のみで年度の完全な集合ではないため、汎用の onUseTransactions とは
   * 別に、サーバーから影響年度を読み直す経路を使う。取込画面だけが使う。
   */
  onUseImportedCsv?: (transactions: Transaction[]) => void;
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
