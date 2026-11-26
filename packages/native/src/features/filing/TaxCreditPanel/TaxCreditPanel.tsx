import { IncomeTaxResult, TaxCreditBreakdown, TaxCreditInputs } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Card, SelectField } from "@/components";
import { space } from "@/theme";
import { AmountField, ResultRow, SectionHead } from "../fields";

/** 税額控除の内訳表示ラベル（エンジンの内訳キー → 正式名称）。 */
const CREDIT_LABELS: readonly { key: keyof TaxCreditBreakdown; label: string }[] = [
  { key: "housingLoan", label: "住宅借入金等特別控除" },
  { key: "flatReduction", label: "定額減税（令和6年分）" },
  { key: "dividend", label: "配当控除" },
  { key: "politicalDonations", label: "政党等寄附金特別控除" },
  { key: "certifiedNpoDonations", label: "認定NPO法人等寄附金特別控除" },
  { key: "seismicRetrofit", label: "住宅耐震改修特別控除" },
  { key: "foreignTax", label: "外国税額控除" },
];

const RATE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "0.007", label: "0.7%（2022年以降に居住）" },
  { value: "0.01", label: "1%（2021年以前に居住）" },
];

export interface TaxCreditPanelProps {
  taxCredits: TaxCreditInputs;
  /** 所得税額の計算結果（税額控除の内訳と確定税額を含む） */
  result: IncomeTaxResult;
  /** 配当所得の入力がある場合、配当控除の対象額はそちらの内訳が優先する */
  dividendCreditDerived?: boolean;
  onChange: (next: TaxCreditInputs) => void;
}

/** 税額控除の入力と税額計算（自動計算）の表示。 */
export function TaxCreditPanel({
  taxCredits,
  result,
  dividendCreditDerived,
  onChange,
}: TaxCreditPanelProps) {
  const set = (patch: Partial<TaxCreditInputs>) => onChange({ ...taxCredits, ...patch });
  const credits = result.taxCredits;

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="税額控除の入力と税額計算"
          description="住宅ローンの年末残高などを入れると税額控除が計算され、確定税額に反映されます。控除限度額は住宅の区分で決まります（認定住宅35万円・ZEH水準31.5万円・省エネ基準適合28万円・その他21万円など）。"
        />

        <SectionHead title="住宅借入金等特別控除" />
        <AmountField
          label="住宅ローンの年末残高"
          value={taxCredits.housingLoanBalance}
          onChange={(v) => set({ housingLoanBalance: v })}
        />
        <AmountField
          label="控除限度額（住宅の区分に応じた上限）"
          value={taxCredits.housingLoanLimit}
          onChange={(v) => set({ housingLoanLimit: v })}
        />
        <SelectField
          label="控除率（居住年で決まります）"
          value={String(taxCredits.housingLoanRate)}
          options={RATE_OPTIONS}
          onChange={(v) => set({ housingLoanRate: Number(v) })}
        />

        <SectionHead title="定額減税（令和6年分のみ）" />
        <AmountField
          label="定額減税額（本人・配偶者・扶養親族の人数 × 30,000円）"
          value={taxCredits.flatReduction}
          onChange={(v) => set({ flatReduction: v })}
        />

        <SectionHead title="配当控除" />
        {dividendCreditDerived ? (
          <AppText size="sm" tone="muted">
            配当所得の入力があるため、配当控除の対象額は配当・一時所得パネルの
            内訳から自動で計算しています（下の手入力は使われません）。
          </AppText>
        ) : null}
        <AmountField
          label="配当等の金額（剰余金の配当など・総合課税）"
          value={taxCredits.dividendCorporate}
          onChange={(v) => set({ dividendCorporate: v })}
        />
        <AmountField
          label="証券投資信託の収益の分配（総合課税）"
          value={taxCredits.dividendTrust}
          onChange={(v) => set({ dividendTrust: v })}
        />

        <SectionHead title="寄附金の税額控除" />
        <AmountField
          label="政党等への寄附金"
          value={taxCredits.politicalDonations}
          onChange={(v) => set({ politicalDonations: v })}
        />
        <AmountField
          label="認定NPO法人・公益社団法人等への寄附金"
          value={taxCredits.certifiedNpoDonations}
          onChange={(v) => set({ certifiedNpoDonations: v })}
        />

        <SectionHead title="住宅耐震改修特別控除" />
        <AmountField
          label="耐震改修の標準的な費用の額"
          value={taxCredits.seismicRetrofitStandardCost}
          onChange={(v) => set({ seismicRetrofitStandardCost: v })}
        />
        <AmountField
          label="その他の耐震工事に係る金額"
          value={taxCredits.seismicRetrofitOtherCost}
          onChange={(v) => set({ seismicRetrofitOtherCost: v })}
        />

        <SectionHead title="外国税額控除" />
        <AmountField
          label="外国所得税の額"
          value={taxCredits.foreignTaxPaid}
          onChange={(v) => set({ foreignTaxPaid: v })}
        />
        <AmountField
          label="調整国外所得金額"
          value={taxCredits.foreignIncome}
          onChange={(v) => set({ foreignIncome: v })}
        />

        <SectionHead title="税額計算（自動計算）" />
        <View>
          <ResultRow label="合計所得金額" value={result.totalIncome} />
          <ResultRow label="所得控除の合計" value={result.deductionsTotal} />
          <ResultRow label="課税所得金額（1,000円未満切捨て）" value={result.taxableIncome} />
          <ResultRow label="所得税額（税額控除前）" value={result.incomeTaxBase} />
          {CREDIT_LABELS.filter(({ key }) => credits[key] > 0).map(({ key, label }) => (
            <ResultRow key={key} label={label} value={credits[key]} />
          ))}
          <ResultRow label="税額控除の合計" value={result.taxCreditsTotal} />
          <ResultRow label="復興特別所得税" value={result.reconstructionTax} />
          <ResultRow label="確定税額（100円未満切捨て）" value={result.finalTax} strong />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
