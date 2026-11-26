import { ScreenContainer, SelectField } from "@/components";
import { TaxpayerWorkspace } from "@/features/filing/TaxpayerWorkspace";
import { useAppState } from "@/state/AppContext";

/**
 * 納税者情報画面。納税者プロフィール・申告の種類・開業届と青色申告
 * 承認申請書の入力を持つ（TaxpayerWorkspace が本体）。
 */
export default function TaxpayerScreen() {
  const { year, years, setYear } = useAppState();
  return (
    <ScreenContainer>
      <SelectField
        label="年度"
        value={String(year)}
        options={years.map((y) => ({ value: String(y), label: `${y}年分` }))}
        onChange={(v) => setYear(Number(v))}
      />
      <TaxpayerWorkspace key={year} />
    </ScreenContainer>
  );
}
