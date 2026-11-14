import { Transaction } from "@etax/shared";

/**
 * 画面（ビュー）コンポーネント共通の props。
 * ビュー切替の対応表（AppPage の appViews）へ載せるため全ビューで揃える。
 */
export interface ViewPageProps {
  transactions: Transaction[];
  onUseTransactions: (transactions: Transaction[]) => void;
  onLoadSample: () => void;
}
