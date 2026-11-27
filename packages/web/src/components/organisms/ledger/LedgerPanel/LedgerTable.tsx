import { TAX_CATEGORIES } from "@etax/shared";
import {
  Badge,
  Button,
  Col,
  Icon,
  Input,
  Row,
  Select,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { LedgerTransaction } from "@types";
import {
  BUSINESS_RATIO_GUIDE_CATEGORIES,
  BUSINESS_RATIO_GUIDE_TEXT,
  CATEGORY_OPTIONS,
  INCOME_TYPE_OPTIONS,
  PAGE_SIZE,
  TAX_CATEGORY_OPTIONS,
  inputNumberOrNull,
  LedgerRowDraft,
  pageList,
  toDraft,
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
}: {
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
}) => {
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
            {displayedRows.map((row) => {
              const edit = edits[row.id] ?? toDraft(row);
              const dirty = isDirty(row);
              return (
                <tr
                  key={row.id}
                  className={deletingId === row.id ? styles.rowDeleting : undefined}
                >
                  <TableCell>
                    <Input
                      type="date"
                      className={`${styles.cellInput} ${styles.cellControl}`}
                      value={edit.date}
                      onChange={(e) => onEdit(row, { date: e.target.value })}
                      aria-label="日付"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      className={`${styles.cellInput} ${styles.cellSelect}`}
                      value={edit.fiscal_year}
                      onChange={(e) =>
                        onEdit(row, { fiscal_year: Number(e.target.value) })
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
                      className={`${styles.descriptionInput} ${styles.cellControl}`}
                      value={edit.description}
                      onChange={(e) => onEdit(row, { description: e.target.value })}
                      aria-label="摘要"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      className={`${styles.amountInput} ${styles.cellControl}`}
                      value={edit.amount ?? ""}
                      onChange={(e) =>
                        onEdit(row, { amount: inputNumberOrNull(e.target.valueAsNumber) })
                      }
                      aria-label="金額"
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      className={styles.cellSelect}
                      value={edit.category}
                      onChange={(e) => onEdit(row, { category: e.target.value })}
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
                      className={styles.cellSelect}
                      value={edit.income_type}
                      onChange={(e) => onEdit(row, { income_type: e.target.value })}
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
                      className={styles.cellSelect}
                      value={edit.tax_category}
                      onChange={(e) => onEdit(row, { tax_category: e.target.value })}
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
                    <Col gap="sm">
                      <Row gap="sm" align="center" className={styles.ratioRow}>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          className={`${styles.ratioInput} ${styles.cellControl}`}
                          value={edit.business_ratio_percent ?? ""}
                          onChange={(e) =>
                            onEdit(row, {
                              business_ratio_percent: inputNumberOrNull(e.target.valueAsNumber),
                            })
                          }
                          aria-label="事業割合（%）"
                        />
                        <Text variant="muted" className={styles.ratioUnit}>
                          %
                        </Text>
                        {edit.business_ratio_percent !== null && edit.business_ratio_percent < 100 ? (
                          <Badge>按分 {edit.business_ratio_percent}%</Badge>
                        ) : null}
                      </Row>
                      {edit.business_ratio_percent !== null && edit.business_ratio_percent < 100 ? (
                        <Input
                          className={`${styles.basisInput} ${styles.cellControl}`}
                          value={edit.business_ratio_basis}
                          onChange={(e) =>
                            onEdit(row, { business_ratio_basis: e.target.value })
                          }
                          placeholder="按分根拠（任意）"
                          aria-label="按分根拠"
                        />
                      ) : null}
                    </Col>
                  </TableCell>
                  <TableCell>
                    <Input
                      className={`${styles.cellInput} ${styles.cellControl}`}
                      value={edit.account}
                      onChange={(e) => onEdit(row, { account: e.target.value })}
                      aria-label="出所"
                    />
                  </TableCell>
                  <TableCell className={styles.actionsCell}>
                    <Row gap="sm" align="center" className={styles.actionsRow}>
                      <Button
                        variant="primary"
                        size="sm"
                        className={styles.iconButton}
                        disabled={!dirty || busy}
                        disabledReason={busy ? "処理中です" : "変更がありません"}
                        onClick={() => onSave(row)}
                        aria-label="保存"
                        title="保存"
                      >
                        <Icon name="save" size={16} />
                      </Button>
                      <Button
                        variant={deleteArmedId === row.id ? "danger" : "ghost"}
                        size="sm"
                        className={
                          deleteArmedId === row.id
                            ? `${styles.iconButton} ${styles.armedButton}`
                            : styles.iconButton
                        }
                        disabled={busy}
                        disabledReason="処理中です"
                        onClick={() => onDelete(row)}
                        aria-label={deleteArmedId === row.id ? "本当に削除" : "削除"}
                        title={deleteArmedId === row.id ? "本当に削除" : "削除"}
                        data-delete-arm={row.id}
                      >
                        <Icon name="trash" size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className={styles.iconButton}
                        onClick={() => onHistory(row)}
                        aria-label="履歴"
                        title="履歴"
                      >
                        <Icon name="history" size={16} />
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
