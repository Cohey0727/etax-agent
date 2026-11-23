import { Transaction } from "@etax/shared";
import { Badge, Button, Card, Col, Row, Table, TableCell, TableHeaderCell, Text } from "@components/atoms";
import styles from "./MappingSummary.css";
import { AlertBox } from "@components/molecules";
import { CsvMapping, ImportCsvResponse } from "@types";

export interface MappingSummaryProps {
  result: ImportCsvResponse;
  onUseTransactions: (transactions: Transaction[]) => void;
}

type AmountSign = CsvMapping["amountSign"];
type MappingSource = ImportCsvResponse["mappingSource"];

const mappingRows: readonly { key: keyof CsvMapping; label: string }[] = [
  { key: "dateColumn", label: "日付" },
  { key: "descriptionColumn", label: "摘要" },
  { key: "amountColumn", label: "金額（符号つき1列）" },
  { key: "debitColumn", label: "出金（支払）" },
  { key: "creditColumn", label: "入金" },
  { key: "balanceColumn", label: "残高" },
  { key: "accountColumn", label: "口座" },
];

const amountSignDescriptions = {
  split: "出金/入金の2列から合成（入金 − 出金）",
  inverted: "反転して使用",
  "as-is": "そのまま使用（収入が正）",
} as const satisfies Record<AmountSign, string>;

const mappingSourceLabels = {
  ai: "AIが判定",
  heuristic: "キーワードで自動判定",
} as const satisfies Record<MappingSource, string>;

export const MappingSummary = ({ result, onUseTransactions }: MappingSummaryProps) => {
  return (
    <Card>
      <Col gap="sm">
        <Row gap="sm" align="center">
          <Text variant="sectionTitle">検出された列マッピング</Text>
          <Badge>{mappingSourceLabels[result.mappingSource]}</Badge>
        </Row>
        <Table>
          <tbody>
            {mappingRows.map(({ key, label }) => (
              <tr key={key}>
                <TableHeaderCell className={styles.labelCell}>{label}</TableHeaderCell>
                <TableCell>{result.mapping[key] ?? "—（なし）"}</TableCell>
              </tr>
            ))}
            <tr>
              <TableHeaderCell>日付書式</TableHeaderCell>
              <TableCell>{result.mapping.dateFormat}</TableCell>
            </tr>
            <tr>
              <TableHeaderCell>金額の符号</TableHeaderCell>
              <TableCell>{amountSignDescriptions[result.mapping.amountSign]}</TableCell>
            </tr>
          </tbody>
        </Table>
        <Text variant="muted">
          ファイル: {result.filename}（{result.encoding}）／ 取込 {result.count} 件
          {result.skippedRows > 0 && <> ／ 読めずスキップ {result.skippedRows} 件</>}
          {result.duplicatesSkipped > 0 && <> ／ 重複除外 {result.duplicatesSkipped} 件</>}
          {result.persisted
            ? " ／ DBに保存しました"
            : " ／ DB未接続のためプレビューのみ（保存されていません）"}
        </Text>
        {result.persistWarning && <AlertBox>{result.persistWarning}</AlertBox>}
        <Row gap="sm">
          <Button onClick={() => onUseTransactions(result.transactions)}>
            このデータをダッシュボードで使う
          </Button>
        </Row>
      </Col>
    </Card>
  );
};
