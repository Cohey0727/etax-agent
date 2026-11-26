import { ScrollView, StyleSheet, View } from "react-native";
import { TrialBalanceMonth } from "@/api";
import { AppText, Card } from "@/components";
import { formatYen } from "@/utils";
import { tableStyles } from "../tableStyles";

export interface MonthlySectionProps {
  year: number;
  current: TrialBalanceMonth[];
  previous: TrialBalanceMonth[];
}

const HEADERS: readonly string[] = ["収入", "支出", "差引", "累計収支", "前年収入", "前年支出", "前年差引"];

/** 月次推移表（事業＋不動産）。当年に前年の同月を並べる。 */
export function MonthlySection({ year, current, previous }: MonthlySectionProps) {
  const totals = sumMonths(current);
  const previousTotals = sumMonths(previous);
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        月次推移（事業＋不動産）
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[tableStyles.row, tableStyles.headRow]}>
            <AppText size="sm" weight="bold" style={styles.month}>月</AppText>
            {HEADERS.map((header) => (
              <AppText key={header} size="sm" weight="bold" style={styles.cell}>
                {header}
              </AppText>
            ))}
          </View>
          {current.map((row) => {
            const prev = previous[row.month - 1];
            const values = [
              row.revenue,
              row.expenses,
              row.balance,
              row.cumulative,
              prev?.revenue ?? 0,
              prev?.expenses ?? 0,
              prev?.balance ?? 0,
            ];
            return (
              <View key={row.month} style={tableStyles.row}>
                <AppText size="sm" style={styles.month}>{row.month}月</AppText>
                {values.map((value, index) => (
                  <AppText
                    key={HEADERS[index]}
                    size="sm"
                    tone={(index === 2 || index === 3) && value < 0 ? "negative" : "text"}
                    style={styles.cell}
                  >
                    {formatYen(value)}
                  </AppText>
                ))}
              </View>
            );
          })}
          <View style={[tableStyles.row, tableStyles.totalRow]}>
            <AppText size="sm" weight="bold" style={styles.month}>合計</AppText>
            {[totals.revenue, totals.expenses, totals.balance, null, previousTotals.revenue, previousTotals.expenses, previousTotals.balance].map(
              (value, index) => (
                <AppText key={HEADERS[index]} size="sm" weight="bold" style={styles.cell}>
                  {value === null ? "―" : formatYen(value)}
                </AppText>
              ),
            )}
          </View>
        </View>
      </ScrollView>
      <AppText size="xs" tone="muted">
        {year}年の列が当年、前年の列が{year - 1}年の同月です。
      </AppText>
    </Card>
  );
}

function sumMonths(months: TrialBalanceMonth[]): { revenue: number; expenses: number; balance: number } {
  return {
    revenue: months.reduce((sum, m) => sum + m.revenue, 0),
    expenses: months.reduce((sum, m) => sum + m.expenses, 0),
    balance: months.reduce((sum, m) => sum + m.balance, 0),
  };
}

const styles = StyleSheet.create({
  month: { width: 44 },
  cell: { width: 104, textAlign: "right" },
});
