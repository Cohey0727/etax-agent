import { StyleSheet, View } from "react-native";
import { TrialBalanceBs, TrialBalanceBsRow } from "@/api";
import { AppText, Card } from "@/components";
import { formatYen } from "@/utils";
import { tableStyles } from "../tableStyles";

export interface BalanceSheetSectionProps {
  balanceSheet: TrialBalanceBs;
}

/**
 * 貸借対照表（試算表）。貸借対照表入力がある場合にだけ表示される。
 * 貸借が一致しない場合はその旨と差額を表示する。
 */
export function BalanceSheetSection({ balanceSheet }: BalanceSheetSectionProps) {
  const bs = balanceSheet;
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        貸借対照表
      </AppText>
      <View>
        <View style={[tableStyles.row, tableStyles.headRow]}>
          <AppText size="sm" weight="bold" style={tableStyles.label}>資産の部</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>期首</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>期末</AppText>
        </View>
        {bs.asset_rows.map((row) => (
          <BsRowLine key={row.key} row={row} />
        ))}
        <View style={tableStyles.row}>
          <AppText size="sm" style={tableStyles.label}>事業主貸</AppText>
          <AppText size="sm" style={styles.cell}>―</AppText>
          <AppText size="sm" style={styles.cell}>{formatYen(bs.owner_loan)}</AppText>
        </View>
        <View style={[tableStyles.row, tableStyles.totalRow]}>
          <AppText size="sm" weight="bold" style={tableStyles.label}>資産合計</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>{formatYen(bs.opening_assets)}</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>{formatYen(bs.closing_assets)}</AppText>
        </View>
        <View style={[tableStyles.row, tableStyles.headRow]}>
          <AppText size="sm" weight="bold" style={tableStyles.label}>負債・資本の部</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>期首</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>期末</AppText>
        </View>
        {bs.liability_rows.map((row) => (
          <BsRowLine key={row.key} row={row} />
        ))}
        <View style={tableStyles.row}>
          <AppText size="sm" style={tableStyles.label}>事業主借</AppText>
          <AppText size="sm" style={styles.cell}>―</AppText>
          <AppText size="sm" style={styles.cell}>{formatYen(bs.owner_borrowing)}</AppText>
        </View>
        <View style={tableStyles.row}>
          <AppText size="sm" style={tableStyles.label}>元入金</AppText>
          <AppText size="sm" style={styles.cell}>{formatYen(bs.capital)}</AppText>
          <AppText size="sm" style={styles.cell}>{formatYen(bs.capital)}</AppText>
        </View>
        <View style={tableStyles.row}>
          <AppText size="sm" style={tableStyles.label}>所得金額（青色申告特別控除前）</AppText>
          <AppText size="sm" style={styles.cell}>―</AppText>
          <AppText size="sm" style={styles.cell}>{formatYen(bs.income_before_blue)}</AppText>
        </View>
        <View style={[tableStyles.row, tableStyles.totalRow]}>
          <AppText size="sm" weight="bold" style={tableStyles.label}>負債・資本合計</AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>
            {formatYen(bs.opening_liabilities_capital)}
          </AppText>
          <AppText size="sm" weight="bold" style={styles.cell}>
            {formatYen(bs.closing_liabilities_capital)}
          </AppText>
        </View>
      </View>
      <BalanceNote label="期首" balanced={bs.opening_balanced} diff={bs.opening_assets - bs.opening_liabilities_capital} />
      <BalanceNote label="期末" balanced={bs.closing_balanced} diff={bs.closing_assets - bs.closing_liabilities_capital} />
    </Card>
  );
}

function BsRowLine({ row }: { row: TrialBalanceBsRow }) {
  return (
    <View style={tableStyles.row}>
      <AppText size="sm" style={tableStyles.label}>{row.label}</AppText>
      <AppText size="sm" style={styles.cell}>{formatYen(row.opening)}</AppText>
      <AppText size="sm" style={styles.cell}>{formatYen(row.closing)}</AppText>
    </View>
  );
}

function BalanceNote({ label, balanced, diff }: { label: string; balanced: boolean; diff: number }) {
  return balanced ? (
    <AppText size="xs" tone="muted">
      {label}の貸借は一致しています。
    </AppText>
  ) : (
    <AppText size="xs" tone="negative">
      {label}の貸借が一致していません（差額 {formatYen(diff)}）。
    </AppText>
  );
}

const styles = StyleSheet.create({
  cell: { width: 104, textAlign: "right" },
});
