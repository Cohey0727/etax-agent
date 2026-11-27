import {
  INVOICE_PAYMENT_KIND_LABELS,
  INVOICE_PAYMENT_STATUS_LABELS,
  RECONCILIATION_REASON_LABELS,
} from "@etax/shared";
import { useState } from "react";
import {
  Badge,
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
import { AlertBox } from "@components/molecules";
import { InvoiceRecord } from "@types";
import { formatYen } from "@utils/format";
import styles from "./InvoicePanel.css";
import { useReconciliationData } from "./useReconciliationData";

export interface InvoiceReconciliationProps {
  invoice: InvoiceRecord;
  /** 消込・解除の後に親の一覧（消込状態）を更新するための通知。 */
  onChanged: () => void;
}

/** 金額の入力欄の値（valueAsNumber）。数として読めない入力・空欄は null。 */
const amountInput = (valueAsNumber: number): number | null =>
  Number.isNaN(valueAsNumber) ? null : Math.trunc(valueAsNumber);

/**
 * 発行済み請求書の入金消込セクション。
 * 自動推測の候補は提示だけで、承認ボタンか手動フォームの送信で初めて
 * 消込が確定する。差額は振込手数料（支払手数料）・売上値引として調整でき、
 * 過入金は預り金として処理できる。
 */
export const InvoiceReconciliation = ({ invoice, onChanged }: InvoiceReconciliationProps) => {
  const {
    result,
    candidates,
    incomeTransactions,
    loading,
    busy,
    error,
    applyPayment,
    releasePayment,
  } = useReconciliationData(invoice, onChanged);
  const [selectedTxId, setSelectedTxId] = useState<number | null>(null);
  // 空欄（null）はサーバーの既定値を使う。
  const [amount, setAmount] = useState<number | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [excessAsDeposit, setExcessAsDeposit] = useState(false);

  if (loading) {
    return <Text variant="caption">消込情報を読み込んでいます…</Text>;
  }
  if (!result) {
    return <AlertBox variant="notice">消込情報を取得できませんでした。</AlertBox>;
  }
  const { settlement } = result;
  const remaining = settlement.remaining_amount;

  const submitManual = () => {
    if (selectedTxId === null) return;
    const transactionId = selectedTxId;
    void (async () => {
      const ok = await applyPayment({
        transaction_id: transactionId,
        amount: amount ?? undefined,
        fee_amount: fee ?? undefined,
        discount_amount: discount ?? undefined,
        treat_excess_as_deposit: excessAsDeposit || undefined,
      });
      if (ok) {
        setSelectedTxId(null);
        setAmount(null);
        setFee(null);
        setDiscount(null);
        setExcessAsDeposit(false);
      }
    })();
  };

  return (
    <Col gap="md">
      <Row gap="sm" align="center" wrap>
        <Text variant="sectionTitle">入金消込</Text>
        <Badge>{INVOICE_PAYMENT_STATUS_LABELS[settlement.status]}</Badge>
      </Row>
      {error ? <AlertBox variant="error">{error}</AlertBox> : null}

      <Col gap="sm">
        <Row justify="spaceBetween">
          <Text variant="caption">請求額</Text>
          <Text variant="body">{formatYen(settlement.total_amount)}</Text>
        </Row>
        <Row justify="spaceBetween">
          <Text variant="caption">消込済み</Text>
          <Text variant="body">{formatYen(settlement.settled_amount)}</Text>
        </Row>
        <Row justify="spaceBetween">
          <Text variant="caption">残額</Text>
          <Text variant="body">{formatYen(settlement.remaining_amount)}</Text>
        </Row>
        {settlement.overpaid_amount > 0 ? (
          <Row justify="spaceBetween">
            <Text variant="caption">預り金（過入金）</Text>
            <Text variant="body">{formatYen(settlement.overpaid_amount)}</Text>
          </Row>
        ) : null}
      </Col>

      {result.payments.length > 0 ? (
        <div className={styles.tableWrap}>
          <Table>
            <thead>
              <tr>
                <TableHeaderCell>日付</TableHeaderCell>
                <TableHeaderCell>摘要</TableHeaderCell>
                <TableHeaderCell>種別</TableHeaderCell>
                <TableHeaderCell>金額</TableHeaderCell>
                <TableHeaderCell>操作</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {result.payments.map((payment) => (
                <tr key={payment.id}>
                  <TableCell>{payment.transaction?.date ?? "—"}</TableCell>
                  <TableCell>
                    {payment.transaction?.description ?? "（取引は削除済み）"}
                  </TableCell>
                  <TableCell>{INVOICE_PAYMENT_KIND_LABELS[payment.kind]}</TableCell>
                  <TableCell>{formatYen(payment.amount)}</TableCell>
                  <TableCell>
                    {payment.kind === "payment" ? (
                      <Button
                        variant="ghost"
                        onClick={() => void releasePayment(payment.id)}
                        disabled={busy}
                      >
                        解除
                      </Button>
                    ) : null}
                  </TableCell>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      ) : (
        <Text variant="caption">まだ消込はありません。</Text>
      )}
      {result.payments.length > 0 ? (
        <Text variant="caption">
          解除は「入金充当」の行から行います。その消込で自動生成した振込手数料・売上値引・預り金の取引も一緒に取り消されます。
        </Text>
      ) : null}

      {remaining > 0 && candidates.length > 0 ? (
        <Col gap="sm">
          <Text variant="sectionTitle">消込の候補（自動推測）</Text>
          {candidates.map((candidate) => (
            <Row key={candidate.transaction.id} gap="sm" align="center" wrap>
              <Text variant="body">
                {candidate.transaction.date} {candidate.transaction.description}
              </Text>
              <Text variant="body">{formatYen(candidate.transaction.amount)}</Text>
              {candidate.reasons.map((reason) => (
                <Badge key={reason}>{RECONCILIATION_REASON_LABELS[reason]}</Badge>
              ))}
              <Button
                variant="tab"
                onClick={() =>
                  void applyPayment({
                    transaction_id: candidate.transaction.id,
                    amount: candidate.suggested_amount,
                  })
                }
                disabled={busy}
              >
                {formatYen(candidate.suggested_amount)}で消し込む
              </Button>
            </Row>
          ))}
          <Text variant="caption">
            候補は金額・取引先名・期日から推測したものです。承認するまで消込は確定しません。
          </Text>
        </Col>
      ) : null}

      {remaining > 0 ? (
        <Col gap="sm">
          <Text variant="sectionTitle">入金取引を選んで消し込む</Text>
          <div>
            <label className={styles.fieldLabel} htmlFor="recon-transaction">入金取引</label>
            <Select
              id="recon-transaction"
              value={selectedTxId ?? ""}
              onChange={(e) =>
                setSelectedTxId(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              <option value="">選択してください</option>
              {incomeTransactions.map((tx) => (
                <option key={tx.id} value={tx.id}>
                  {tx.date} {tx.description} {formatYen(tx.amount)}
                </option>
              ))}
            </Select>
          </div>
          <div className={styles.formGrid}>
            <div>
              <label className={styles.fieldLabel} htmlFor="recon-amount">
                充当額（空欄なら残額まで）
              </label>
              <Input
                id="recon-amount"
                type="number"
                value={amount ?? ""}
                onChange={(e) => setAmount(amountInput(e.target.valueAsNumber))}
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="recon-fee">
                振込手数料として調整
              </label>
              <Input
                id="recon-fee"
                type="number"
                value={fee ?? ""}
                onChange={(e) => setFee(amountInput(e.target.valueAsNumber))}
              />
            </div>
            <div>
              <label className={styles.fieldLabel} htmlFor="recon-discount">
                売上値引として調整
              </label>
              <Input
                id="recon-discount"
                type="number"
                value={discount ?? ""}
                onChange={(e) => setDiscount(amountInput(e.target.valueAsNumber))}
              />
            </div>
          </div>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={excessAsDeposit}
              onChange={(e) => setExcessAsDeposit(e.target.checked)}
            />
            充当しきれない入金の残りは過入金として預り金にする
          </label>
          <Row justify="end">
            <Button onClick={submitManual} disabled={busy || selectedTxId === null}>
              消し込む
            </Button>
          </Row>
        </Col>
      ) : null}
    </Col>
  );
};
