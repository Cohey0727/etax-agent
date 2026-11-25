import { IncomeType } from "@etax/shared";
import { Card, Col, Text } from "@components/atoms";
import { TrialBalancePl } from "@types";
import { formatYen } from "@utils";
import styles from "./TrialBalancePanel.css";

export interface PlSectionProps {
  title: string;
  year: number;
  incomeType: IncomeType;
  current: TrialBalancePl;
  previous: TrialBalancePl;
  onDrillDown: (incomeType: IncomeType, categories: string[]) => void;
}

type PlRowKind = "line" | "subtotal" | "total";

interface PlRow {
  label: string;
  current: number;
  previous: number;
  kind: PlRowKind;
  /** ドリルダウン先の科目（行が科目単位の場合のみ） */
  categories?: string[];
}

/**
 * 損益計算書（1区分分）。数値はXTXの青色申告決算書と一致する集計を
 * そのまま表示し、前年との比較（増減）も並べる。科目名をクリックすると
 * 帳簿がその科目でフィルタされた状態で開く。
 */
export const PlSection = ({
  title,
  year,
  incomeType,
  current,
  previous,
  onDrillDown,
}: PlSectionProps) => {
  const rows = buildRows(current, previous);
  const isEmpty =
    current.revenue === 0 &&
    current.expenses === 0 &&
    current.purchases === 0 &&
    previous.revenue === 0 &&
    previous.expenses === 0 &&
    previous.purchases === 0;
  return (
    <Card>
      <Col gap="sm">
        <Text variant="statLabel">{title}</Text>
        {isEmpty ? (
          <Text variant="muted">この区分の取引はありません。</Text>
        ) : (
          <div className={styles.tableScroll}>
            <div className={`${styles.plRow} ${styles.headRow}`}>
              <span>科目</span>
              <span className={styles.cell}>{year}年</span>
              <span className={styles.cell}>{year - 1}年</span>
              <span className={styles.cell}>増減</span>
            </div>
            {rows.map((row) => (
              <div
                key={row.label}
                className={`${styles.plRow} ${
                  row.kind === "total"
                    ? styles.totalRow
                    : row.kind === "subtotal"
                      ? styles.subtotalRow
                      : ""
                }`}
              >
                {row.categories ? (
                  <button
                    type="button"
                    className={styles.categoryButton}
                    onClick={() => onDrillDown(incomeType, row.categories ?? [])}
                  >
                    {row.label}
                  </button>
                ) : (
                  <span>{row.label}</span>
                )}
                <span className={styles.cell}>{formatYen(row.current)}</span>
                <span className={styles.cell}>{formatYen(row.previous)}</span>
                <span className={styles.cell}>{formatDiff(row.current - row.previous)}</span>
              </div>
            ))}
          </div>
        )}
      </Col>
    </Card>
  );
};

/** 決算書の並び（収入→仕入→経費→差引→青色控除→所得）で行を組み立てる。 */
function buildRows(current: TrialBalancePl, previous: TrialBalancePl): PlRow[] {
  const rows: PlRow[] = [];
  rows.push({
    label: "売上（収入）金額",
    current: current.revenue,
    previous: previous.revenue,
    kind: "subtotal",
  });
  for (const line of current.revenue_lines) {
    rows.push({
      label: line.category,
      current: line.amount,
      previous: previousAmount(previous.revenue_lines, line.category),
      kind: "line",
      categories: line.categories,
    });
  }
  if (current.purchases > 0 || previous.purchases > 0) {
    rows.push({
      label: "仕入高",
      current: current.purchases,
      previous: previous.purchases,
      kind: "line",
      categories: ["仕入高"],
    });
    rows.push({
      label: "差引金額（売上総利益）",
      current: current.revenue - current.purchases,
      previous: previous.revenue - previous.purchases,
      kind: "subtotal",
    });
  }
  for (const line of current.expense_lines) {
    rows.push({
      label: line.category,
      current: line.amount,
      previous: previousAmount(previous.expense_lines, line.category),
      kind: "line",
      categories: line.categories,
    });
  }
  rows.push({ label: "経費計", current: current.expenses, previous: previous.expenses, kind: "subtotal" });
  rows.push({
    label: "差引金額",
    current: current.income_before_blue,
    previous: previous.income_before_blue,
    kind: "subtotal",
  });
  rows.push({
    label: "青色申告特別控除",
    current: current.blue_deduction,
    previous: previous.blue_deduction,
    kind: "line",
  });
  rows.push({ label: "所得金額", current: current.income, previous: previous.income, kind: "total" });
  return rows;
}

function previousAmount(lines: { category: string; amount: number }[], category: string): number {
  return lines.find((line) => line.category === category)?.amount ?? 0;
}

function formatDiff(diff: number): string {
  if (diff === 0) return "―";
  return diff > 0 ? `+${formatYen(diff)}` : formatYen(diff);
}
