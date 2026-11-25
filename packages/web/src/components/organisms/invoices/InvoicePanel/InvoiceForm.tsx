import { Button, Col, Icon, Input, Row, Select, Text, Textarea } from "@components/atoms";
import { InvoiceInput, InvoiceLineInput } from "@types";
import { formatYen } from "@utils/format";
import styles from "./InvoicePanel.css";
import {
  ROUNDING_OPTIONS,
  TAX_RATE_OPTIONS,
  emptyLine,
  previewTotals,
} from "./invoiceOptions";
import { invoiceLineAmount } from "@etax/shared";

export interface InvoiceFormProps {
  submitLabel: string;
  value: InvoiceInput;
  busy: boolean;
  onChange: (input: InvoiceInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * 請求書の作成・編集フォーム（制御コンポーネント。状態は親が持つ）。
 * 単価は税抜。消費税額は税率ごとに1回だけ端数処理する（プレビューも
 * サーバーと同じ共有計算で出す）。
 */
export const InvoiceForm = ({
  submitLabel,
  value,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: InvoiceFormProps) => {
  const patch = (next: Partial<InvoiceInput>) => onChange({ ...value, ...next });
  const patchLine = (index: number, next: Partial<InvoiceLineInput>) => {
    const lines = value.lines.map((line, i) => {
      if (i !== index) return line;
      const merged = { ...line, ...next };
      // 税率8%以外では軽減フラグは意味を持たないので落とす。
      if (merged.tax_rate_percent !== 8) merged.is_reduced_rate = false;
      return merged;
    });
    patch({ lines });
  };
  const totals = previewTotals(value);

  return (
    <Col gap="md">
      <div className={styles.formGrid}>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-issue-date">発行日</label>
          <Input
            id="inv-issue-date"
            type="date"
            value={value.issue_date}
            onChange={(e) => patch({ issue_date: e.target.value })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-due-date">支払期限（任意）</label>
          <Input
            id="inv-due-date"
            type="date"
            value={value.due_date ?? ""}
            onChange={(e) => patch({ due_date: e.target.value ? e.target.value : null })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-counterparty">交付先の氏名又は名称</label>
          <Input
            id="inv-counterparty"
            type="text"
            value={value.counterparty_name}
            placeholder="例: 株式会社サンプル"
            onChange={(e) => patch({ counterparty_name: e.target.value })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-counterparty-address">交付先の住所（任意）</label>
          <Input
            id="inv-counterparty-address"
            type="text"
            value={value.counterparty_address}
            placeholder="例: 東京都港区芝公園4-2-8"
            onChange={(e) => patch({ counterparty_address: e.target.value })}
          />
        </div>
        <div>
          <label className={styles.fieldLabel} htmlFor="inv-rounding">消費税額の端数処理</label>
          <Select
            id="inv-rounding"
            value={value.tax_rounding}
            onChange={(e) => patch({ tax_rounding: e.target.value as InvoiceInput["tax_rounding"] })}
          >
            {ROUNDING_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className={styles.fieldLabel}>適格請求書として発行</label>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={value.is_qualified}
              onChange={(e) => patch({ is_qualified: e.target.checked })}
            />
            登録番号を表示する
          </label>
        </div>
      </div>

      <Col gap="sm">
        <Text variant="sectionTitle">明細</Text>
        {value.lines.map((line, index) => (
          <div key={index} className={styles.lineGrid}>
            <div>
              <label className={styles.fieldLabel} htmlFor={`inv-item-${index}`}>品目</label>
              <Input
                id={`inv-item-${index}`}
                type="text"
                value={line.item_name}
                placeholder="例: 開発支援業務"
                onChange={(e) => patchLine(index, { item_name: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor={`inv-qty-${index}`}>数量</label>
              <Input
                id={`inv-qty-${index}`}
                type="number"
                min={0}
                step="any"
                value={line.quantity === 0 ? "" : line.quantity}
                onChange={(e) =>
                  patchLine(index, { quantity: e.target.value === "" ? 0 : Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor={`inv-unit-${index}`}>単位</label>
              <Input
                id={`inv-unit-${index}`}
                type="text"
                value={line.unit}
                placeholder="時間"
                onChange={(e) => patchLine(index, { unit: e.target.value })}
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor={`inv-price-${index}`}>単価（税抜）</label>
              <Input
                id={`inv-price-${index}`}
                type="number"
                min={0}
                step={1}
                value={line.unit_price === 0 ? "" : line.unit_price}
                onChange={(e) =>
                  patchLine(index, {
                    unit_price: e.target.value === "" ? 0 : Number(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor={`inv-rate-${index}`}>税率</label>
              <Select
                id={`inv-rate-${index}`}
                value={line.tax_rate_percent}
                onChange={(e) => patchLine(index, { tax_rate_percent: Number(e.target.value) })}
              >
                {TAX_RATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className={styles.fieldLabel}>軽減</label>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={line.is_reduced_rate}
                  disabled={line.tax_rate_percent !== 8}
                  onChange={(e) => patchLine(index, { is_reduced_rate: e.target.checked })}
                />
                対象
              </label>
            </div>
            <div className={styles.lineAmount}>
              {formatYen(
                invoiceLineAmount({
                  itemName: line.item_name,
                  quantity: line.quantity,
                  unit: line.unit,
                  unitPrice: line.unit_price,
                  taxRatePercent: line.tax_rate_percent,
                  isReducedRate: line.is_reduced_rate,
                }),
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => patch({ lines: value.lines.filter((_, i) => i !== index) })}
              disabled={busy}
            >
              <Icon name="trash" size={14} />
            </Button>
          </div>
        ))}
        <Row>
          <Button
            variant="tab"
            size="sm"
            onClick={() => patch({ lines: [...value.lines, emptyLine()] })}
            disabled={busy}
          >
            <Icon name="plus" size={14} /> 明細を追加
          </Button>
        </Row>
      </Col>

      <div>
        <label className={styles.fieldLabel} htmlFor="inv-memo">備考（振込先など）</label>
        <Textarea
          id="inv-memo"
          value={value.memo}
          onChange={(e) => patch({ memo: e.target.value })}
        />
      </div>

      <Col gap="sm">
        {totals.groups.map((group) => (
          <Row key={group.taxRatePercent} justify="spaceBetween">
            <Text variant="caption">
              {group.taxRatePercent}%対象（税抜）{formatYen(group.subtotal)}
            </Text>
            <Text variant="caption">消費税 {formatYen(group.tax)}</Text>
          </Row>
        ))}
        <Row justify="spaceBetween">
          <Text variant="body">合計（税込）</Text>
          <Text variant="body">{formatYen(totals.total)}</Text>
        </Row>
      </Col>

      <Row gap="sm" justify="end">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          キャンセル
        </Button>
        <Button onClick={onSubmit} disabled={busy} disabledReason="保存中です">
          {submitLabel}
        </Button>
      </Row>
    </Col>
  );
};
