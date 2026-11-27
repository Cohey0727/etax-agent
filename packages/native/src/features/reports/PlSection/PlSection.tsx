import { IncomeType, trialBalancePlRows } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { TrialBalancePl } from "@/api";
import { AppText, BouncePressable, Card } from "@/components";
import { formatYen } from "@/utils";
import { tableStyles } from "../tableStyles";

export interface PlSectionProps {
  title: string;
  year: number;
  current: TrialBalancePl;
  previous: TrialBalancePl;
  /** この表の所得区分。科目ドリルダウンの絞り込みに使う。 */
  incomeType: IncomeType;
  /** 科目タップで、その科目に絞った帳簿へ遷移する。 */
  onDrillDown?: (incomeType: IncomeType, categories: string[]) => void;
}

/** 損益計算書（1区分分）。前年との比較（増減）も並べる。 */
export function PlSection({ title, year, current, previous, incomeType, onDrillDown }: PlSectionProps) {
  const rows = trialBalancePlRows(current, previous);
  const isEmpty =
    current.revenue === 0 &&
    current.expenses === 0 &&
    current.purchases === 0 &&
    previous.revenue === 0 &&
    previous.expenses === 0 &&
    previous.purchases === 0;
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        {title}
      </AppText>
      {isEmpty ? (
        <AppText size="sm" tone="muted">
          この区分の取引はありません。
        </AppText>
      ) : (
        <View>
          <View style={[tableStyles.row, tableStyles.headRow]}>
            <AppText size="sm" weight="bold" style={tableStyles.label}>科目</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>{year}年</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>{year - 1}年</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>増減</AppText>
          </View>
          {rows.map((row) => (
            <View
              key={row.key}
              style={[
                tableStyles.row,
                row.kind === "total" ? tableStyles.totalRow : null,
                row.kind === "subtotal" ? tableStyles.subtotalRow : null,
              ]}
            >
              {row.categories && onDrillDown ? (
                <BouncePressable
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label}の帳簿を開く`}
                  onPress={() => onDrillDown(incomeType, row.categories ?? [])}
                  pressScale={0.97}
                  style={tableStyles.label}
                >
                  <AppText size="sm" tone="accent">
                    {row.label}
                  </AppText>
                </BouncePressable>
              ) : (
                <AppText
                  size="sm"
                  weight={row.kind === "line" ? "regular" : "semibold"}
                  style={tableStyles.label}
                >
                  {row.label}
                </AppText>
              )}
              <AppText size="sm" weight={row.kind === "total" ? "bold" : "regular"} style={styles.cell}>
                {formatYen(row.current)}
              </AppText>
              <AppText size="sm" style={styles.cell}>{formatYen(row.previous)}</AppText>
              <AppText size="sm" style={styles.cell}>{formatDiff(row.current - row.previous)}</AppText>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function formatDiff(diff: number): string {
  if (diff === 0) return "―";
  return diff > 0 ? `+${formatYen(diff)}` : formatYen(diff);
}

const styles = StyleSheet.create({
  cell: { width: 92, textAlign: "right" },
});
