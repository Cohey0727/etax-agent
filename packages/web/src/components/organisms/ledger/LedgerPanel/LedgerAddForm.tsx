import { isIncomeType } from "@etax/shared";
import { RefObject } from "react";
import { Button, Card, Col, Input, Row, Select, Text } from "@components/atoms";
import {
  BUSINESS_RATIO_GUIDE_CATEGORIES,
  BUSINESS_RATIO_GUIDE_TEXT,
  CATEGORY_OPTIONS,
  INCOME_TYPE_OPTIONS,
  inputNumberOrNull,
  LedgerRowDraft,
  TAX_CATEGORY_OPTIONS,
} from "./ledgerOptions";
import styles from "./LedgerPanel.css";

export interface LedgerAddFormProps {
  draft: LedgerRowDraft;
  yearOptions: readonly number[];
  busy: boolean;
  formRef: RefObject<HTMLDivElement | null>;
  onDraftChange: (next: LedgerRowDraft) => void;
  onAdd: () => void;
  onClose: () => void;
}

/**
 * LedgerAddForm.tsx — 取引の手動追加フォーム（カード）。
 * 入力値（draft）は親が持ち、追加の実行も親へ委ねる。
 */
export const LedgerAddForm = ({
  draft,
  yearOptions,
  busy,
  formRef,
  onDraftChange,
  onAdd,
  onClose,
}: LedgerAddFormProps) => {
  return (
    <div ref={formRef}>
      <Card>
        <Col gap="md">
          <Row gap="md" align="center" justify="spaceBetween">
            <Text variant="sectionTitle">取引を追加（手動）</Text>
            <Button variant="ghost" size="sm" onClick={onClose}>
              閉じる
            </Button>
          </Row>
          <div className={styles.addGrid}>
            <Col gap="sm">
              <Text variant="statLabel">日付</Text>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => onDraftChange({ ...draft, date: e.target.value })}
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">年度（割り当て）</Text>
              <Select
                value={draft.fiscal_year}
                onChange={(e) =>
                  onDraftChange({ ...draft, fiscal_year: Number(e.target.value) })
                }
              >
                {[...new Set([...yearOptions, draft.fiscal_year, Number(draft.date.slice(0, 4))])]
                  .filter((optionYear) => Number.isInteger(optionYear) && optionYear > 0)
                  .sort((a, b) => b - a)
                  .map((optionYear) => (
                    <option key={optionYear} value={optionYear}>
                      {optionYear}年
                    </option>
                  ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">摘要</Text>
              <Input
                value={draft.description}
                onChange={(e) => onDraftChange({ ...draft, description: e.target.value })}
                placeholder="例: サーバー利用料"
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">金額（支出はマイナス）</Text>
              <Input
                type="number"
                value={draft.amount ?? ""}
                onChange={(e) =>
                  onDraftChange({ ...draft, amount: inputNumberOrNull(e.target.valueAsNumber) })
                }
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">勘定科目</Text>
              <Select
                value={draft.category}
                onChange={(e) => onDraftChange({ ...draft, category: e.target.value })}
              >
                {CATEGORY_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">区分</Text>
              <Select
                value={draft.income_type}
                onChange={(e) => {
                  const incomeType = e.target.value;
                  if (isIncomeType(incomeType)) onDraftChange({ ...draft, income_type: incomeType });
                }}
              >
                {INCOME_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">税区分</Text>
              <Select
                value={draft.tax_category}
                onChange={(e) => onDraftChange({ ...draft, tax_category: e.target.value })}
              >
                {TAX_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">出所</Text>
              <Input
                value={draft.account}
                onChange={(e) => onDraftChange({ ...draft, account: e.target.value })}
              />
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">事業割合（%）</Text>
              <Input
                type="number"
                min={0}
                max={100}
                step={1}
                value={draft.business_ratio_percent ?? ""}
                onChange={(e) =>
                  onDraftChange({
                    ...draft,
                    business_ratio_percent: inputNumberOrNull(e.target.valueAsNumber),
                  })
                }
              />
              {BUSINESS_RATIO_GUIDE_CATEGORIES.has(draft.category) &&
              (draft.business_ratio_percent ?? 100) >= 100 ? (
                <Text variant="caption">{BUSINESS_RATIO_GUIDE_TEXT}</Text>
              ) : null}
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">按分根拠（任意）</Text>
              <Input
                value={draft.business_ratio_basis}
                onChange={(e) =>
                  onDraftChange({ ...draft, business_ratio_basis: e.target.value })
                }
                placeholder="例: 面積割合"
              />
            </Col>
          </div>
          <Row gap="sm" align="center">
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              disabledReason="処理中です"
              onClick={onAdd}
            >
              帳簿に追加
            </Button>
            <Text variant="caption">追加・保存・削除はそのまま帳簿データベースに記録されます。</Text>
          </Row>
        </Col>
      </Card>
    </div>
  );
};
