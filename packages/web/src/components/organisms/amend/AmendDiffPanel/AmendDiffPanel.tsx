import { amendmentDelta, AmendmentDelta, SAMPLE_CORRECTED_2024, SAMPLE_ORIGINAL_2024 } from "@etax/shared";
import { useState } from "react";
import { Button, Card, Col, Row, Table, TableCell, TableHeaderCell, Text, Textarea } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { formatNumber } from "@utils";
import styles from "./AmendDiffPanel.css";

export interface AmendDiffPanelProps {}

export const AmendDiffPanel = ({}: AmendDiffPanelProps) => {
  const [originalText, setOriginalText] = useState(prettyJson(SAMPLE_ORIGINAL_2024));
  const [correctedText, setCorrectedText] = useState(prettyJson(SAMPLE_CORRECTED_2024));
  const [delta, setDelta] = useState<AmendmentDelta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    try {
      const original = JSON.parse(originalText) as Record<string, unknown>;
      const corrected = JSON.parse(correctedText) as Record<string, unknown>;
      setDelta(amendmentDelta(original, corrected));
    } catch (e) {
      setError(`JSONのパースに失敗しました: ${e instanceof Error ? e.message : String(e)}`);
      setDelta(null);
    }
  };

  return (
    <Col gap="md">
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">修正申告 — 申告済み vs 修正後の差分</Text>
          <Text variant="muted">
            申告書の主要項目をフラットなJSONで貼り付けてください。初期状態はサンプル
            （家賃収入を事業収入に含めて申告し住宅ローン控除を適用していた状態 →
            不動産所得へ切り分け）です。
          </Text>
          <Row gap="md" align="start">
            <Col gap="sm" className={styles.flexChild}>
              <Text variant="statLabel">申告済み（original）</Text>
              <Textarea
                variant="code"
                value={originalText}
                onChange={(e) => setOriginalText(e.target.value)}
                spellCheck={false}
              />
            </Col>
            <Col gap="sm" className={styles.flexChild}>
              <Text variant="statLabel">修正後（corrected）</Text>
              <Textarea
                variant="code"
                value={correctedText}
                onChange={(e) => setCorrectedText(e.target.value)}
                spellCheck={false}
              />
            </Col>
          </Row>
          <Row gap="sm">
            <Button onClick={run}>差分を計算する</Button>
          </Row>
        </Col>
      </Card>

      {error && <AlertBox variant="error">{error}</AlertBox>}

      {delta && (
        <Card>
          <Col gap="sm">
            <Text variant="sectionTitle">{delta.year}年分 差分</Text>
            {Object.keys(delta.fieldDiffs).length === 0 ? (
              <Text>差分はありません。</Text>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHeaderCell>項目</TableHeaderCell>
                    <TableHeaderCell align="right">申告済み</TableHeaderCell>
                    <TableHeaderCell align="right">修正後</TableHeaderCell>
                    <TableHeaderCell align="right">差分</TableHeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(delta.fieldDiffs).map(([field, v]) => (
                    <tr key={field}>
                      <TableCell>{field}</TableCell>
                      <TableCell align="right">{formatValue(v.original)}</TableCell>
                      <TableCell align="right">{formatValue(v.corrected)}</TableCell>
                      <TableCell
                        align="right"
                        tone={
                          v.diff !== null && v.diff > 0
                            ? "negative"
                            : v.diff !== null && v.diff < 0
                              ? "positive"
                              : "default"
                        }
                      >
                        {formatDiff(v.diff)}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
            {delta.taxDelta !== null ? (
              <Text>
                <strong>税額の増減: {formatDiff(delta.taxDelta)}円</strong>（
                {delta.taxDelta > 0
                  ? "追加納付"
                  : delta.taxDelta < 0
                    ? "還付方向"
                    : "増減なし"}
                ）
              </Text>
            ) : (
              <Text variant="muted">
                税額フィールド（income_tax 等）が無いため、税額の増減は算出できません。
              </Text>
            )}
          </Col>
        </Card>
      )}
    </Col>
  );
};

function prettyJson(o: Record<string, unknown>): string {
  return JSON.stringify(o, null, 2);
}

function formatValue(v: unknown): string {
  return typeof v === "number" ? formatNumber(v) : v === null || v === undefined ? "—" : String(v);
}

function formatDiff(d: number | null): string {
  if (d === null) return "—";
  return `${d > 0 ? "+" : ""}${formatNumber(d)}`;
}
