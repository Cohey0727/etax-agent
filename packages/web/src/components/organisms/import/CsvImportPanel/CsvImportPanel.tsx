import { Transaction } from "@etax/shared";
import { useRef, useState } from "react";
import { Button, Card, Col, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { ImportCsvResponse } from "@types";
import { importCsvFile } from "@utils";
import { ImportedTransactionsTable } from "../ImportedTransactionsTable";
import { MappingSummary } from "../MappingSummary";
import { AccountClassificationPanel } from "../AccountClassificationPanel";
import styles from "./CsvImportPanel.css";

export interface CsvImportPanelProps {
  onUseTransactions: (transactions: Transaction[]) => void;
  /** DB保存済みの取込で使う専用経路（サーバーから影響年度を読み直す）。 */
  onUseImportedCsv?: (transactions: Transaction[]) => void;
  onLoadSample: () => void;
}

export const CsvImportPanel = ({ onUseTransactions, onUseImportedCsv, onLoadSample }: CsvImportPanelProps) => {
  const [result, setResult] = useState<ImportCsvResponse | null>(null);
  // 科目判定で書き換わるため、取込結果の取引は編集可能なコピーで保持する
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    try {
      const res = await importCsvFile(file);
      setResult(res);
      setTxs(res.transactions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Col gap="md">
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">銀行・カード明細CSVの取込</Text>
          <Text variant="muted">
            銀行やカード会社の明細CSVをそのまま選んでください。列の対応付け（どの列が日付・摘要・金額か）は
            <strong>AIが自動で判定</strong>
            します（APIキーが無い場合はキーワードによる自動判定）。 Shift_JIS のCSVにも対応しています。
          </Text>
          <Row gap="sm" align="center" wrap>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className={styles.hiddenInput}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.target.value = "";
              }}
            />
            <Button disabled={loading} disabledReason="取込中です" onClick={() => fileRef.current?.click()}>
              {loading ? "取込中…" : "CSVファイルを選ぶ"}
            </Button>
            <Button variant="ghost" onClick={onLoadSample}>
              サンプルデータを読み込む
            </Button>
          </Row>
        </Col>
      </Card>

      {error && <AlertBox variant="error">取込エラー: {error}</AlertBox>}

      {result && (
        <>
          <MappingSummary
            result={{ ...result, transactions: txs }}
            onUseTransactions={
              // DB保存済みなら、取込分だけで画面を置き換えずサーバー読み直し経路を使う
              result.persisted && onUseImportedCsv ? onUseImportedCsv : onUseTransactions
            }
          />
          <AccountClassificationPanel transactions={txs} onApply={setTxs} />
          <ImportedTransactionsTable transactions={txs} />
        </>
      )}
    </Col>
  );
};
