import { FilingType } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { space } from "@/theme";
import { formatYen } from "@/utils";
import { ResultRow, StatBlock } from "../fields";
import { IncomeSummaryFigures } from "../incomeSummaryFigures";

export interface IncomeSummaryProps {
  /** 所得の要約（確定申告画面で税額と同じ入力から求めたもの） */
  summary: IncomeSummaryFigures;
  /** 申告の種類（白色申告では所得合計に「青色控除後」を付けない） */
  filingType: FilingType;
  /** 対象年の帳簿に取引があるか */
  hasTransactions: boolean;
}

/**
 * 「収支」行の直下に置く収支の要約。収支（収入・支出・差引）を見直したら、
 * その結果である所得の数字を真下で確認して、そのまま「確定」にできるようにする。
 */
export function IncomeSummary({ summary, filingType, hasTransactions }: IncomeSummaryProps) {
  if (!hasTransactions) {
    return (
      <AppText size="sm" tone="muted">
        この年の取引はまだありません。先に帳簿へ取り込んでください。
      </AppText>
    );
  }

  const suffix = filingType === "white" ? "" : "（青色控除後）";
  const statCards: readonly { label: string; value: string }[] = [
    { label: "収入合計", value: formatYen(summary.incomeTotal) },
    { label: "支出合計", value: formatYen(summary.expenseTotal) },
    { label: "収支（差引）", value: formatYen(summary.incomeTotal - summary.expenseTotal) },
    { label: `所得合計${suffix}`, value: formatYen(summary.totalIncome) },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.statGrid}>
        {statCards.map((card) => (
          <StatBlock key={card.label} label={card.label} value={card.value} />
        ))}
      </View>
      <View>
        {summary.bridgeRows.map((row) => (
          <ResultRow key={row.label} label={row.label} value={row.amount} />
        ))}
        <ResultRow label={`所得合計${suffix}`} value={summary.totalIncome} strong />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
