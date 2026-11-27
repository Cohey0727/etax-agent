import { useLocalSearchParams } from "expo-router";
import { LedgerScreen } from "@/features/ledger/LedgerScreen";

/**
 * 帳簿ルート。試算表からのドリルダウンでは year / cat（複数可）/ itype の
 * ルートパラメータで初期フィルターを受け取る。パラメータが変わるたびに
 * 画面を作り直して初期状態へ戻す。年度はドリルダウン元がアプリ全体の
 * 年度に合わせてから遷移するので、ここでは書き戻さない。
 */
export default function LedgerRoute() {
  const params = useLocalSearchParams<{ year?: string; cat?: string | string[]; itype?: string }>();
  const paramYear = params.year ? Number(params.year) : null;

  const categories = (Array.isArray(params.cat) ? params.cat : params.cat ? [params.cat] : []).filter(
    (c) => c !== "",
  );
  const signature = `${paramYear ?? ""}|${categories.join(",")}|${params.itype ?? ""}`;
  return (
    <LedgerScreen
      key={signature}
      initialCategories={categories}
      initialIncomeType={params.itype}
    />
  );
}
