import { TAX_CATEGORIES } from "@etax/shared";
import {
  Button,
  Col,
  Input,
  Row,
  Select,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { LedgerTransaction, LedgerTransactionInput } from "@types";
import {
  CATEGORY_OPTIONS,
  INCOME_TYPE_OPTIONS,
  PAGE_SIZE,
  TAX_CATEGORY_OPTIONS,
  pageList,
  toInput,
} from "./ledgerOptions";
import styles from "./LedgerPanel.css";

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
  visibleCount,
  currentPage,
  totalPages,
  isDirty,
  onEdit,
  onSave,
  onDelete,
  onPageChange,
}: {
  displayedRows: readonly LedgerTransaction[];
  edits: Record<number, LedgerTransactionInput>;
  yearOptions: readonly number[];
  busy: boolean;
  deleteArmedId: number | null;
  visibleCount: number;
  currentPage: number;
  totalPages: number;
  isDirty: (row: LedgerTransaction) => boolean;
  onEdit: (id: number, patch: Partial<LedgerTransactionInput>) => void;
  onSave: (row: LedgerTransaction) => void;
  onDelete: (row: LedgerTransaction) => void;
  onPageChange: (page: number) => void;
}) => {
  return (
    <>
      <Row gap="sm" align="center" justify="end">
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
              <TableHeaderCell>出所</TableHeaderCell>
              <TableHeaderCell>操作</TableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => {
              const edit = edits[row.id] ?? toInput(row);
              const dirty = isDirty(row);
              return (
                <tr key={row.id}>
                  <TableCell>
                    <Input
                      type="date"
                      className={styles.cellInput}
                      value={edit.date}
                      onChange={(e) => onEdit(row.id, { date: e.target.value })}
                      aria-label="日付"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      className={styles.cellInput}
                      value={edit.fiscal_year}
                      onChange={(e) =>
                        onEdit(row.id, { fiscal_year: Number(e.target.value) })
                      }
                      aria-label="割り当て年度"
                      title={
                        edit.fiscal_year !== Number(edit.date.slice(0, 4))
                          ? "日付の年とは違う年度に割り当てられています"
                          : undefined
                      }
                    >
                      {[...new Set([...yearOptions, edit.fiscal_year])]
                        .sort((a, b) => b - a)
                        .map((optionYear) => (
                          <option key={optionYear} value={optionYear}>
                            {optionYear}年
                          </option>
                        ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className={styles.descriptionInput}
                      value={edit.description}
                      onChange={(e) => onEdit(row.id, { description: e.target.value })}
                      aria-label="摘要"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className={styles.amountInput}
                      value={edit.amount}
                      onChange={(e) =>
                        onEdit(row.id, { amount: Number(e.target.value) })
                      }
                      aria-label="金額"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={edit.category}
                      onChange={(e) => onEdit(row.id, { category: e.target.value })}
                      aria-label="勘定科目"
                    >
                      {CATEGORY_OPTIONS.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={edit.income_type}
                      onChange={(e) => onEdit(row.id, { income_type: e.target.value })}
                      aria-label="区分"
                    >
                      {INCOME_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={edit.tax_category}
                      onChange={(e) => onEdit(row.id, { tax_category: e.target.value })}
                      aria-label="税区分"
                    >
                      {TAX_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                      {edit.tax_category && !TAX_CATEGORIES.includes(edit.tax_category) ? (
                        <option value={edit.tax_category}>{edit.tax_category}</option>
                      ) : null}
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className={styles.cellInput}
                      value={edit.account}
                      onChange={(e) => onEdit(row.id, { account: e.target.value })}
                      aria-label="出所"
                    />
                  </TableCell>
                  <TableCell className={styles.actionsCell}>
                    <Row gap="sm" align="center" className={styles.actionsRow}>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={!dirty || busy}
                        disabledReason={busy ? "処理中です" : "変更がありません"}
                        onClick={() => onSave(row)}
                      >
                        保存
                      </Button>
                      <Button
                        variant={deleteArmedId === row.id ? "danger" : "ghost"}
                        size="sm"
                        disabled={busy}
                        disabledReason="処理中です"
                        onClick={() => onDelete(row)}
                      >
                        {deleteArmedId === row.id ? "本当に削除" : "削除"}
                      </Button>
                    </Row>
                  </TableCell>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      {totalPages > 1 ? (
        <Col gap="sm">
          <Row justify="end">
            <Text variant="muted">
              全{visibleCount}件中 {(currentPage - 1) * PAGE_SIZE + 1}–
              {(currentPage - 1) * PAGE_SIZE + displayedRows.length}件目
            </Text>
          </Row>
          <Row gap="sm" align="center" justify="center">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1}
              disabledReason="最初のページです"
              onClick={() => onPageChange(currentPage - 1)}
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
                  onClick={() => onPageChange(item)}
                >
                  {item}
                </Button>
              ),
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages}
              disabledReason="最後のページです"
              onClick={() => onPageChange(currentPage + 1)}
            >
              次へ
            </Button>
          </Row>
        </Col>
      ) : null}
    </>
  );
};
