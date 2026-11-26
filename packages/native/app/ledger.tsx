import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { LedgerScreen } from "@/features/ledger/LedgerScreen";
import { useAppState } from "@/state/AppContext";

/**
 * 帳簿ルート。試算表からのドリルダウンでは year / cat（複数可）/ itype の
 * ルートパラメータで初期フィルターを受け取る。パラメータが変わるたびに
 * 画面を作り直して初期状態へ戻す。
 */
export default function LedgerRoute() {
  const params = useLocalSearchParams<{ year?: string; cat?: string | string[]; itype?: string }>();
  const { year, setYear } = useAppState();

  const paramYear = params.year ? Number(params.year) : null;
  useEffect(() => {
    if (paramYear !== null && Number.isInteger(paramYear) && paramYear !== year) {
      setYear(paramYear);
    }
  }, [paramYear, year, setYear]);

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
