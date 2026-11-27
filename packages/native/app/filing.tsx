import { useLocalSearchParams } from "expo-router";
import { ScreenContainer, SelectField } from "@/components";
import { FilingWorkspace, filingTabFromParam } from "@/features/filing/FilingWorkspace";
import { useAppState } from "@/state/AppContext";

/**
 * 確定申告画面。総合・収支・控除・消費税の4タブを持ち、控除等の入力は
 * 年度ごとに保存される（FilingWorkspace が状態を持つ）。
 * tab パラメータで初期タブを指定できる（サイドバーの子項目からの遷移）。
 */
export default function FilingScreen() {
  const { year, years, setYear } = useAppState();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initialTab = filingTabFromParam(tab);
  return (
    <ScreenContainer>
      <SelectField
        label="年度"
        value={String(year)}
        options={years.map((y) => ({ value: String(y), label: `${y}年分` }))}
        onChange={(v) => setYear(Number(v))}
      />
      <FilingWorkspace key={`${year}:${initialTab}`} initialTab={initialTab} />
    </ScreenContainer>
  );
}
