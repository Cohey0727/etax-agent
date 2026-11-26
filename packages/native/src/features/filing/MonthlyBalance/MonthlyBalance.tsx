import { Transaction, transactionBusinessAmount } from "@etax/shared";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Card } from "@/components";
import { colors, space } from "@/theme";
import { formatYen } from "@/utils";
import { SectionHead } from "../fields";

interface MonthlyAmount {
  month: number;
  income: number;
  expense: number;
  balance: number;
  cumulative: number;
}

export interface MonthlyBalanceProps {
  /** その年で絞り込み済みの取引（割り当て年度ベース）。 */
  transactions: Transaction[];
}

/**
 * 収支タブの「月別の収支」を独立した1枚のカードで出す。
 * 月ごとの収入・支出・差引と、差引の累計（累計収支）。
 * 取引のない月も0で並べる。集計は収支カードに合わせ、事業・不動産の
 * 取引だけを対象にする（資金移動などの「その他」区分は含めない）。
 * 金額は事業分（家事按分後）で集計し、収支カードの見出しと一致させる。
 */
export function MonthlyBalance({ transactions }: MonthlyBalanceProps) {
  const scoped = useMemo(
    () => transactions.filter((t) => t.income_type !== "other"),
    [transactions],
  );
  const monthly = useMemo(() => sumByMonth(scoped), [scoped]);
  const incomeTotal = useMemo(
    () =>
      scoped.reduce((sum, t) => {
        const amount = transactionBusinessAmount(t);
        return amount > 0 ? sum + amount : sum;
      }, 0),
    [scoped],
  );
  const expenseTotal = useMemo(
    () =>
      scoped.reduce((sum, t) => {
        const amount = transactionBusinessAmount(t);
        return amount < 0 ? sum + -amount : sum;
      }, 0),
    [scoped],
  );

  if (scoped.length === 0) return null;

  return (
    <Card>
      <SectionHead title="月別の収支" />
      <View style={[styles.row, styles.headRow]}>
        <AppText size="xs" weight="semibold" tone="muted" style={styles.monthCell}>
          月
        </AppText>
        <AppText size="xs" weight="semibold" tone="muted" style={styles.cell}>
          収入
        </AppText>
        <AppText size="xs" weight="semibold" tone="muted" style={styles.cell}>
          支出
        </AppText>
        <AppText size="xs" weight="semibold" tone="muted" style={styles.cell}>
          差引
        </AppText>
        <AppText size="xs" weight="semibold" tone="muted" style={styles.cell}>
          累計収支
        </AppText>
      </View>
      {monthly.map((row) => (
        <View key={row.month} style={styles.row}>
          <AppText size="sm" style={styles.monthCell}>
            {row.month}月
          </AppText>
          <AppText size="sm" style={styles.cell}>
            {formatYen(row.income)}
          </AppText>
          <AppText size="sm" style={styles.cell}>
            {formatYen(row.expense)}
          </AppText>
          <AppText
            size="sm"
            style={[styles.cell, row.balance < 0 ? { color: colors.negative } : null]}
          >
            {formatYen(row.balance)}
          </AppText>
          <AppText
            size="sm"
            style={[styles.cell, row.cumulative < 0 ? { color: colors.negative } : null]}
          >
            {formatYen(row.cumulative)}
          </AppText>
        </View>
      ))}
      <View style={[styles.row, styles.totalRow]}>
        <AppText size="sm" weight="bold" style={styles.monthCell}>
          合計
        </AppText>
        <AppText size="sm" weight="bold" style={styles.cell}>
          {formatYen(incomeTotal)}
        </AppText>
        <AppText size="sm" weight="bold" style={styles.cell}>
          {formatYen(expenseTotal)}
        </AppText>
        <AppText size="sm" weight="bold" style={styles.cell}>
          {formatYen(incomeTotal - expenseTotal)}
        </AppText>
        <AppText size="sm" weight="bold" style={styles.cell}>
          ―
        </AppText>
      </View>
    </Card>
  );
}

/** 月ごとの収入・支出・差引と、差引の累計（累計収支）。取引のない月も0で並べる。 */
function sumByMonth(transactions: Transaction[]): MonthlyAmount[] {
  const rows: MonthlyAmount[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    income: 0,
    expense: 0,
    balance: 0,
    cumulative: 0,
  }));
  for (const t of transactions) {
    const month = Number(t.date.slice(5, 7));
    if (month < 1 || month > 12) continue;
    const amount = transactionBusinessAmount(t);
    if (amount > 0) rows[month - 1].income += amount;
    else rows[month - 1].expense += -amount;
  }
  let cumulative = 0;
  for (const row of rows) {
    row.balance = row.income - row.expense;
    cumulative += row.balance;
    row.cumulative = cumulative;
  }
  return rows;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: space.xs,
  },
  headRow: { borderBottomWidth: 1, borderBottomColor: colors.lineSoft },
  totalRow: { borderTopWidth: 1, borderTopColor: colors.lineSoft },
  monthCell: { width: 36 },
  cell: { flex: 1, textAlign: "right" },
});
