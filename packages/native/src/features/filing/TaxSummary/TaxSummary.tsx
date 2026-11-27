import { IncomeTaxResult } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { space } from "@/theme";
import { ResultRow, StatBlock } from "../fields";

export interface TaxSummaryProps {
  /** 控除タブと同じ入力で計算した所得税の結果 */
  taxResult: IncomeTaxResult;
}

/**
 * 「控除・計算」行の直下に置く税額の要約。控除を入力したら、その結果である
 * 税額の数字を真下で確認して、そのまま「確定」にできるようにする。
 */
export function TaxSummary({ taxResult }: TaxSummaryProps) {
  const taxRows: readonly { label: string; amount: number }[] = [
    { label: "所得控除", amount: taxResult.deductionsTotal },
    { label: "課税所得", amount: taxResult.taxableIncome },
    { label: "所得税額（税額控除前）", amount: taxResult.incomeTaxBase },
    { label: "税額控除", amount: taxResult.taxCreditsTotal },
    { label: "復興特別所得税", amount: taxResult.reconstructionTax },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.statGrid}>
        <StatBlock label="所得税額（確定税額）" value={taxResult.finalTax} />
      </View>
      <View>
        {taxRows.map((row) => (
          <ResultRow key={row.label} label={row.label} value={row.amount} />
        ))}
        <ResultRow label="所得税額（確定税額）" value={taxResult.finalTax} strong />
      </View>
      <AppText size="sm" tone="muted">
        源泉徴収税額・予定納税額との精算（申告納税額）は提出パネルで確認します。
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
