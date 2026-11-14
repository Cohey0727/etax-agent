import { Transaction } from "@etax/shared";

/**
 * 画面（ビュー）コンポーネント共通の props。
 * ビュー切替の対応表（AppPage の appViews）へ載せるため全ビューで揃える。
 * year は左上の年度切替（AppPage が保持）から配られる。
 */
export interface ViewPageProps {
  transactions: Transaction[];
  year: number;
  onUseTransactions: (transactions: Transaction[]) => void;
  onLoadSample: () => void;
}
