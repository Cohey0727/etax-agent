import { IncomeType, Transaction } from "@etax/shared";
import { useMemo, useState } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { formatYen } from "@utils";
import styles from "./BalanceRecords.css";

/** 1ページの件数。帳簿と同じく100件（全件描画すると画面が重くなるため）。 */
const PAGE_SIZE = 100;

const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  business: "事業",
  real_estate: "不動産",
  other: "その他",
};

export interface BalanceRecordsProps {
  /** その年の収支の対象になっている取引（割り当て年度で絞り込み済み）。 */
  transactions: Transaction[];
}

/**
 * 収支タブの「対象の取引」。集計の元になっている帳簿レコードそのものを
 * 日付順に並べる。数字だけでは裏付けにならないため、収支の末尾に置く。
 * 編集は帳簿側で行う前提の読み取り専用一覧。
 */
export const BalanceRecords = ({ transactions }: BalanceRecordsProps) => {
  const [page, setPage] = useState(1);
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => a.date.localeCompare(b.date)),
    [transactions],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const displayed = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (sorted.length === 0) return null;

  return (
    <Card>
    <Col gap="sm">
      <Text variant="statLabel">対象の取引（帳簿レコード {sorted.length}件）</Text>
      <div>
        <div className={`${styles.recordRow} ${styles.recordHead}`}>
          <span>日付</span>
          <span>摘要</span>
          <span>勘定科目</span>
          <span>区分</span>
          <span className={styles.recordTaxCell}>税区分</span>
          <span className={styles.recordCellRight}>金額（税込）</span>
        </div>
        {displayed.map((t, index) => (
          <div key={`${t.date}-${t.description}-${t.amount}-${index}`} className={styles.recordRow}>
            <span>{t.date}</span>
            <span className={styles.recordDesc}>{t.description}</span>
            <span>{t.category}</span>
            <span>{INCOME_TYPE_LABELS[t.income_type]}</span>
            <span className={styles.recordTaxCell}>{t.tax_category || "―"}</span>
            <span
              className={`${styles.recordCellRight} ${t.amount < 0 ? styles.amountNegative : ""}`}
            >
              {formatYen(t.amount)}
            </span>
          </div>
        ))}
      </div>
      {totalPages > 1 ? (
        <Col gap="sm">
          <Row justify="end">
            <Text variant="muted">
              全{sorted.length}件中 {(currentPage - 1) * PAGE_SIZE + 1}–
              {(currentPage - 1) * PAGE_SIZE + displayed.length}件目
            </Text>
          </Row>
          <Row gap="sm" align="center" justify="center">
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            前へ
          </Button>
          {pageList(currentPage, totalPages).map((item, index) =>
            item === "gap" ? (
              <Text key={`gap-${index}`} variant="muted">
                …
              </Text>
            ) : (
              <Button
                key={item}
                variant={item === currentPage ? "primary" : "ghost"}
                size="sm"
                onClick={() => setPage(item)}
              >
                {item}
              </Button>
            ),
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            次へ
          </Button>
          </Row>
        </Col>
      ) : null}
    </Col>
    </Card>
  );
};

/** ページネーションの並び。先頭・末尾と現在ページの前後だけ出し、間は「…」で畳む。 */
function pageList(current: number, total: number): readonly (number | "gap")[] {
  const pages = [...new Set([1, total, current - 1, current, current + 1])]
    .filter((page) => page >= 1 && page <= total)
    .sort((a, b) => a - b);
  const items: (number | "gap")[] = [];
  for (const page of pages) {
    const prev = items[items.length - 1];
    if (typeof prev === "number" && page - prev > 1) items.push("gap");
    items.push(page);
  }
  return items;
}
