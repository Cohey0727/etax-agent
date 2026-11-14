import { Transaction } from "@etax/shared";
import { AppView } from "./AppView";
import { ThemeMode } from "./Theme";

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
}
