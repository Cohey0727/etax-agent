import {
  FilingFigures,
  FilingType,
  filingIncomeBridgeRows,
  filingIncomeStatCards,
  filingTotalIncomeLabel,
} from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components";
import { space } from "@/theme";
import { ResultRow, StatBlock } from "../fields";

export interface IncomeSummaryProps {
  /** 帳簿と申告入力から求めた所得と所得税額（確定申告画面が計算したもの） */
  figures: FilingFigures;
  /** 申告の種類（白色申告では所得合計に「青色控除後」を付けない） */
  filingType: FilingType;
  /** 対象年の帳簿に取引があるか（無ければ取り込みを促す） */
  hasTransactions: boolean;
}

/**
 * 「収支」行の直下に置く収支の要約。収支（収入・支出・差引）を見直したら、
 * その結果である所得の数字を真下で確認して、そのまま「確定」にできるようにする。
 * 帳簿に取引が無い年（給与・雑所得だけの年）も所得合計を出す。
 */
export function IncomeSummary({ figures, filingType, hasTransactions }: IncomeSummaryProps) {
  const isWhite = filingType === "white";
  return (
    <View style={styles.wrap}>
      {hasTransactions ? null : (
        <AppText size="sm" tone="muted">
          この年の取引はまだありません。先に帳簿へ取り込んでください。
        </AppText>
      )}
      <View style={styles.statGrid}>
        {filingIncomeStatCards(figures, isWhite).map((card) => (
          <StatBlock key={card.label} label={card.label} value={card.amount} />
        ))}
      </View>
      <View>
        {filingIncomeBridgeRows(figures, isWhite).map((row) => (
          <ResultRow key={row.label} label={row.label} value={row.amount} />
        ))}
        <ResultRow label={filingTotalIncomeLabel(isWhite)} value={figures.totalIncome} strong />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
