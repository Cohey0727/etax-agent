import { CorrectedFigures, FilingType, Transaction, transactionBusinessAmount } from "@etax/shared";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppText } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatYen } from "@/utils";
import { ResultRow, SectionHead, StatBlock } from "../fields";
import { IncomeSummaryFigures } from "../incomeSummaryFigures";

interface CategoryAmount {
  category: string;
  amount: number;
}

export interface BalanceSummaryProps {
  /** 対象年の取引（割り当て年度で絞り込み済み） */
  transactions: Transaction[];
  /** 対象年の申告数値（事業・不動産ごとの収入と経費） */
  figures: CorrectedFigures;
  /** 所得の要約（確定申告画面で税額と同じ入力から求めたもの） */
  summary: IncomeSummaryFigures;
  /** 申告の種類（白色申告では所得合計に「青色控除後」を付けない） */
  filingType: FilingType;
}

/**
 * 確定申告の「収支」タブの集計。その年の帳簿を収支として見直せるように、
 * 収入・支出・差引（収支）を中心に置き、事業／不動産ごとの収支、そこから
 * 所得合計への内訳、勘定科目ごとの内訳を出す。
 * 月別の収支と、集計の対象になっている帳簿の取引そのものは、隣の
 * MonthlyBalance と BalanceRecords がそれぞれ別カードで並べる。
 * 未分類が残っていれば注意も出す。
 */
export function BalanceSummary({ transactions, figures, summary, filingType }: BalanceSummaryProps) {
  const scopedTransactions = useMemo(
    () => transactions.filter((t) => t.income_type !== "other"),
    [transactions],
  );
  // 内訳も見出し（申告数値）と同じ事業分で集計し、合計が一致するようにする。
  const income = useMemo(
    () => sumByCategory(scopedTransactions.filter((t) => transactionBusinessAmount(t) > 0), false),
    [scopedTransactions],
  );
  const expenses = useMemo(
    () => sumByCategory(scopedTransactions.filter((t) => transactionBusinessAmount(t) < 0), true),
    [scopedTransactions],
  );
  const otherFlow = useMemo(() => {
    const others = transactions.filter((t) => t.income_type === "other");
    return {
      count: others.length,
      income: others.filter((t) => t.amount > 0).reduce((sum, t) => sum + Math.trunc(t.amount), 0),
      expense: others
        .filter((t) => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(Math.trunc(t.amount)), 0),
    };
  }, [transactions]);
  const unclassifiedCount = transactions.filter((t) => t.category === "未分類").length;

  if (transactions.length === 0) {
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

      <DivisionBalance
        title="事業の収支"
        revenue={figures.business_revenue}
        expenses={figures.business_expenses}
      />
      <DivisionBalance
        title="不動産の収支"
        revenue={figures.real_estate_revenue}
        expenses={figures.real_estate_expenses}
      />

      <View>
        <SectionHead title="所得の内訳" />
        {summary.bridgeRows.map((row) => (
          <ResultRow key={row.label} label={row.label} value={row.amount} />
        ))}
        <ResultRow label={`所得合計${suffix}`} value={summary.totalIncome} strong />
      </View>

      <CategoryList title="収入の内訳" rows={income} tone="income" />
      <CategoryList title="支出の内訳" rows={expenses} tone="expense" />

      {otherFlow.count > 0 ? (
        <AppText size="xs" tone="muted">
          集計対象外（資金移動・投資・個人的な出入り）: {otherFlow.count} 件・入金{" "}
          {formatYen(otherFlow.income)} / 出金 {formatYen(otherFlow.expense)}
        </AppText>
      ) : null}

      {unclassifiedCount > 0 ? (
        <AlertBox
          tone="warn"
          message={`未分類の取引が ${unclassifiedCount} 件あります。帳簿で勘定科目を付けてから確認済みにしてください。`}
        />
      ) : null}
    </View>
  );
}

function DivisionBalance({
  title,
  revenue,
  expenses,
}: {
  title: string;
  revenue: number;
  expenses: number;
}) {
  return (
    <View>
      <SectionHead title={title} />
      <ResultRow label="収入" value={revenue} />
      <ResultRow label="経費" value={expenses} />
      <ResultRow label="差引" value={revenue - expenses} strong />
    </View>
  );
}

function CategoryList({
  title,
  rows,
  tone,
}: {
  title: string;
  rows: readonly CategoryAmount[];
  tone: "income" | "expense";
}) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const max = Math.max(1, ...rows.map((row) => row.amount));
  return (
    <View style={styles.categoryList}>
      <SectionHead title={title} />
      {rows.length === 0 ? (
        <AppText size="sm" tone="muted">
          なし
        </AppText>
      ) : (
        rows.map((row) => (
          <View key={row.category} style={styles.categoryRow}>
            <View style={styles.categoryHead}>
              <AppText size="sm" tone="muted" style={styles.categoryName}>
                {row.category}
              </AppText>
              <AppText size="sm">
                {formatYen(row.amount)}
                <AppText size="sm" tone="muted">
                  （{total > 0 ? Math.round((row.amount / total) * 100) : 0}%）
                </AppText>
              </AppText>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${Math.round((row.amount / max) * 100)}%`,
                    backgroundColor: tone === "income" ? colors.barSimplified : colors.barStandard,
                  },
                ]}
              />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

/** 科目ごとに事業分を合計し、金額の大きい順に並べる（支出は絶対値で）。 */
function sumByCategory(transactions: Transaction[], absolute: boolean): CategoryAmount[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    const businessAmount = transactionBusinessAmount(t);
    const amount = absolute ? Math.abs(businessAmount) : businessAmount;
    totals.set(t.category, (totals.get(t.category) ?? 0) + amount);
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  statGrid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  categoryList: { gap: space.xs },
  categoryRow: { gap: 2 },
  categoryHead: { flexDirection: "row", justifyContent: "space-between", gap: space.sm },
  categoryName: { flex: 1 },
  barTrack: { height: 6, backgroundColor: colors.lineSoft, borderRadius: radius.pill },
  barFill: { height: 6, borderRadius: radius.pill },
});
