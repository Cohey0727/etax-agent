import { isIncomeType, TAX_CATEGORIES } from "@etax/shared";
import { Badge, Button, Col, Icon, Input, Row, Select, TableCell, Text } from "@components/atoms";
import { LedgerTransaction } from "@types";
import {
  categoryOptionsWith,
  INCOME_TYPE_OPTIONS,
  inputNumberOrNull,
  LedgerRowDraft,
  TAX_CATEGORY_OPTIONS,
} from "./ledgerOptions";
import styles from "./LedgerPanel.css";

export interface LedgerTableRowProps {
  row: LedgerTransaction;
  /** 入力欄に出す値（手を入れていなければ保存済みの値） */
  edit: LedgerRowDraft;
  dirty: boolean;
  yearOptions: readonly number[];
  busy: boolean;
  deleteArmed: boolean;
  /** 削除のアニメーション中か */
  deleting: boolean;
  onEdit: (row: LedgerTransaction, patch: Partial<LedgerRowDraft>) => void;
  onSave: (row: LedgerTransaction) => void;
  onDelete: (row: LedgerTransaction) => void;
  onHistory: (row: LedgerTransaction) => void;
}

/** 帳簿の取引テーブルの1行。その場で編集でき、保存・削除・履歴は親へ委ねる。 */
export const LedgerTableRow = ({
  row,
  edit,
  dirty,
  yearOptions,
  busy,
  deleteArmed,
  deleting,
  onEdit,
  onSave,
  onDelete,
  onHistory,
}: LedgerTableRowProps) => (
  <tr className={deleting ? styles.rowDeleting : undefined}>
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
        {categoryOptionsWith([edit.category]).map((name) => (
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
        onChange={(e) => {
          const incomeType = e.target.value;
          if (isIncomeType(incomeType)) onEdit(row, { income_type: incomeType });
        }}
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
          variant={deleteArmed ? "danger" : "ghost"}
          size="sm"
          className={
            deleteArmed
              ? `${styles.iconButton} ${styles.armedButton}`
              : styles.iconButton
          }
          disabled={busy}
          disabledReason="処理中です"
          onClick={() => onDelete(row)}
          aria-label={deleteArmed ? "本当に削除" : "削除"}
          title={deleteArmed ? "本当に削除" : "削除"}
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
