import { Row, Table, TableHeaderCell, Text } from "@components/atoms";
import { LedgerTransaction } from "@types";
import { LedgerPagination } from "./LedgerPagination";
import {
  BUSINESS_RATIO_GUIDE_CATEGORIES,
  BUSINESS_RATIO_GUIDE_TEXT,
  LedgerRowDraft,
  toDraft,
} from "./ledgerOptions";
import styles from "./LedgerPanel.css";
import { LedgerTableRow } from "./LedgerTableRow";

export interface LedgerTableProps {
  displayedRows: readonly LedgerTransaction[];
  edits: Record<number, LedgerRowDraft>;
  yearOptions: readonly number[];
  busy: boolean;
  deleteArmedId: number | null;
  deletingId: number | null;
  visibleCount: number;
  currentPage: number;
  totalPages: number;
  isDirty: (row: LedgerTransaction) => boolean;
  onEdit: (row: LedgerTransaction, patch: Partial<LedgerRowDraft>) => void;
  onSave: (row: LedgerTransaction) => void;
  onDelete: (row: LedgerTransaction) => void;
  onHistory: (row: LedgerTransaction) => void;
  onPageChange: (page: number) => void;
}

/**
 * LedgerTable.tsx — 帳簿の取引テーブル（現在ページ分）とページネーション。
 * 行はその場で編集でき、保存・削除はコールバックで親へ委ねる。
 */
export const LedgerTable = ({
  displayedRows,
  edits,
  yearOptions,
  busy,
  deleteArmedId,
  deletingId,
  visibleCount,
  currentPage,
  totalPages,
  isDirty,
  onEdit,
  onSave,
  onDelete,
  onHistory,
  onPageChange,
}: LedgerTableProps) => {
  // 按分候補科目で割合が未設定（100%）の行があれば、軽いガイドを出す。
  const showRatioGuide = displayedRows.some((row) => {
    const edit = edits[row.id] ?? toDraft(row);
    return (
      BUSINESS_RATIO_GUIDE_CATEGORIES.has(edit.category) &&
      (edit.business_ratio_percent ?? 100) >= 100
    );
  });
  return (
    <>
      <Row gap="sm" align="center" justify="spaceBetween">
        {showRatioGuide ? (
          <Text variant="caption">{BUSINESS_RATIO_GUIDE_TEXT}</Text>
        ) : (
          <span />
        )}
        <Text variant="muted">{visibleCount}件ヒット</Text>
      </Row>
      <div className={styles.tableWrap}>
        <Table>
          <thead>
            <tr>
              <TableHeaderCell>日付</TableHeaderCell>
              <TableHeaderCell>年度</TableHeaderCell>
              <TableHeaderCell>摘要</TableHeaderCell>
              <TableHeaderCell>金額（税込）</TableHeaderCell>
              <TableHeaderCell>勘定科目</TableHeaderCell>
              <TableHeaderCell>区分</TableHeaderCell>
              <TableHeaderCell>税区分</TableHeaderCell>
              <TableHeaderCell>事業割合</TableHeaderCell>
              <TableHeaderCell>出所</TableHeaderCell>
              <TableHeaderCell className={styles.actionsHeader}>操作</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => (
              <LedgerTableRow
                key={row.id}
                row={row}
                edit={edits[row.id] ?? toDraft(row)}
                dirty={isDirty(row)}
                yearOptions={yearOptions}
                busy={busy}
                deleteArmed={deleteArmedId === row.id}
                deleting={deletingId === row.id}
                onEdit={onEdit}
                onSave={onSave}
                onDelete={onDelete}
                onHistory={onHistory}
              />
            ))}
          </tbody>
        </Table>
      </div>
      {totalPages > 1 ? (
        <LedgerPagination
          visibleCount={visibleCount}
          displayedCount={displayedRows.length}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      ) : null}
    </>
  );
};
