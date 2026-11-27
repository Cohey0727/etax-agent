import { useEffect, useState } from "react";
import { Button, Card, Col, LoadingCircle, Row, Select, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { LedgerTransaction, ReceiptRecord } from "@types";
import {
  fetchLedgerTransactions,
  fetchReceipts,
  formatYen,
  linkReceipt,
  receiptContentUrl,
  unlinkReceipt,
} from "@utils";
import styles from "./ReceiptLibraryPanel.css";

export interface ReceiptLibraryPanelProps {
  /** 紐付け先の候補を出す対象年 */
  year: number;
}

const formatAmount = (value: number | null | undefined): string =>
  value === null || value === undefined ? "—" : formatYen(Math.abs(value));

const transactionLabel = (tx: LedgerTransaction): string =>
  `${tx.date} ${tx.description || "（摘要なし）"} ${formatAmount(tx.amount)}`;

export const ReceiptLibraryPanel = ({ year }: ReceiptLibraryPanelProps) => {
  const [loaded, setLoaded] = useState(false);
  const [receipts, setReceipts] = useState<ReceiptRecord[] | null>(null);
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 紐付け・解除のあとに一覧を取り直す回数。
  const [reloadCount, setReloadCount] = useState(0);

  // 年度を切り替えたら紐付け先の候補を取り直す。先に出した取得の結果が後から
  // 返っても、切り替え後の年度の候補を上書きしないよう捨てる。
  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchReceipts(), fetchLedgerTransactions(year)]).then(
      ([receiptList, ledgerList]) => {
        if (cancelled) return;
        setReceipts(receiptList);
        setLedger(ledgerList ?? []);
        setLoaded(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [year, reloadCount]);

  const handleLink = async (receipt: ReceiptRecord) => {
    const target = Number(selected[receipt.file_id] ?? "");
    if (!Number.isInteger(target) || target <= 0) {
      setError("紐付け先の取引を選んでください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await linkReceipt(receipt.file_id, target);
      setReloadCount((count) => count + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleUnlink = async (receipt: ReceiptRecord) => {
    setBusy(true);
    setError(null);
    try {
      await unlinkReceipt(receipt.file_id);
      setReloadCount((count) => count + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const linkedLabel = (receipt: ReceiptRecord): string | null => {
    if (receipt.transaction_id === null) return null;
    const tx = ledger.find((t) => t.id === receipt.transaction_id);
    return tx ? transactionLabel(tx) : `取引ID ${receipt.transaction_id}`;
  };

  return (
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">証憑の一覧</Text>
        <Text variant="muted">
          解析した領収書画像の一覧です。取引へ紐付けると、帳簿から証憑を辿れるようになります
          （電子帳簿保存法の相互関連性）。
        </Text>
        {error && <AlertBox variant="error">{error}</AlertBox>}
        {!loaded && <LoadingCircle />}
        {loaded && receipts === null && (
          <Text variant="muted">帳簿DBに接続できないため、証憑の一覧を表示できません。</Text>
        )}
        {receipts !== null && receipts.length === 0 && (
          <Text variant="muted">まだ証憑がありません。上の欄から領収書画像を解析すると、ここに残ります。</Text>
        )}
        {receipts?.map((receipt) => {
          const linked = linkedLabel(receipt);
          return (
            <Row key={receipt.file_id} gap="md" align="start" wrap className={styles.row}>
              <img
                src={receiptContentUrl(receipt.file_id)}
                alt="証憑のサムネイル"
                className={styles.thumb}
              />
              <Col gap="sm" className={styles.body}>
                <Text>
                  {receipt.extracted
                    ? `${receipt.extracted.date ?? "日付なし"} ${receipt.extracted.payee} ${receipt.extracted.description} ${formatAmount(receipt.extracted.amount)}`
                    : "未解析の証憑"}
                </Text>
                {linked ? (
                  <Row gap="sm" align="center" wrap>
                    <Text variant="muted">紐付け先: {linked}</Text>
                    <Button disabled={busy} onClick={() => void handleUnlink(receipt)}>
                      紐付けを外す
                    </Button>
                  </Row>
                ) : (
                  <Row gap="sm" align="center" wrap>
                    <Select
                      value={selected[receipt.file_id] ?? ""}
                      onChange={(e) =>
                        setSelected({ ...selected, [receipt.file_id]: e.target.value })
                      }
                    >
                      <option value="">紐付け先の取引を選ぶ</option>
                      {ledger.map((tx) => (
                        <option key={tx.id} value={tx.id}>
                          {transactionLabel(tx)}
                        </option>
                      ))}
                    </Select>
                    <Button disabled={busy} onClick={() => void handleLink(receipt)}>
                      紐付ける
                    </Button>
                  </Row>
                )}
              </Col>
            </Row>
          );
        })}
      </Col>
    </Card>
  );
};
