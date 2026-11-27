import { guessIncomeType, Transaction } from "@etax/shared";
import { useState } from "react";
import { Button, Card, Col, Row, Select, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AccountClassification } from "@types";
import {
  accountChoices,
  classificationSourceLabels,
  classifyAccountsBatch,
  recordClassificationFeedback,
  withCurrentOption,
} from "@utils";
import styles from "./AccountClassificationPanel.css";

export interface AccountClassificationPanelProps {
  transactions: Transaction[];
  /** 科目を反映した取引リストで差し替える。 */
  onApply: (transactions: Transaction[]) => void;
}

interface Suggestion {
  index: number;
  classification: AccountClassification;
  account: string;
}

const MAX_SUGGESTIONS = 50;

export const AccountClassificationPanel = ({
  transactions,
  onApply,
}: AccountClassificationPanelProps) => {
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const unclassifiedIndexes = transactions
    .map((tx, index) => (tx.category === "未分類" ? index : -1))
    .filter((index) => index >= 0);

  if (unclassifiedIndexes.length === 0 && !suggestions) return null;

  const handleJudge = async () => {
    setLoading(true);
    setError(null);
    setConfirmed(false);
    try {
      const targets = unclassifiedIndexes.slice(0, MAX_SUGGESTIONS);
      const results = await classifyAccountsBatch(
        targets.map((index) => transactions[index]?.description ?? ""),
      );
      setSuggestions(
        targets.map((index, i) => ({
          index,
          classification: results[i] as AccountClassification,
          account: (results[i] as AccountClassification).account,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!suggestions) return;
    const byIndex = new Map(suggestions.map((s) => [s.index, s.account]));
    const updated = transactions.map((tx, index) => {
      const account = byIndex.get(index);
      if (!account || account === "未分類") return tx;
      return { ...tx, category: account, income_type: guessIncomeType(tx.description, account) };
    });
    onApply(updated);
    // 確定した対応を学習履歴へ記録する（生成ルールとプロンプトの材料になる）
    for (const s of suggestions) {
      if (s.account !== "未分類") {
        void recordClassificationFeedback(transactions[s.index]?.description ?? "", s.account);
      }
    }
    setConfirmed(true);
    setSuggestions(null);
  };

  return (
    <Card>
      <Col gap="sm">
        <Text variant="sectionTitle">勘定科目の判定（未分類 {unclassifiedIndexes.length}件）</Text>
        <Text variant="muted">
          カード・銀行明細の未分類の行について、自動生成ルール（正規表現）と AI
          （プロンプト）で科目を提案します。内容を確認して確定すると、科目が反映され、対応が学習されます。
        </Text>
        {error && <AlertBox variant="error">{error}</AlertBox>}
        {confirmed && (
          <AlertBox variant="notice">科目を反映し、学習履歴に記録しました。</AlertBox>
        )}
        {!suggestions && (
          <Row gap="sm" align="center">
            <Button disabled={loading} disabledReason="判定中です" onClick={() => void handleJudge()}>
              {loading ? "判定中…" : "未分類の科目を判定する"}
            </Button>
          </Row>
        )}
        {suggestions && (
          <>
            {suggestions.map((s) => (
              <div key={s.index} className={styles.row}>
                <Text variant="body">
                  <span className={styles.description}>
                    {transactions[s.index]?.description}
                  </span>{" "}
                  <Text variant="caption">
                    （{classificationSourceLabels[s.classification.source]}
                    {s.classification.confidence !== null &&
                      ` ${Math.round(s.classification.confidence * 100)}%`}
                    ）
                  </Text>
                </Text>
                <Select
                  value={s.account}
                  aria-label="勘定科目"
                  onChange={(e) =>
                    setSuggestions((prev) =>
                      prev
                        ? prev.map((p) =>
                            p.index === s.index ? { ...p, account: e.target.value } : p,
                          )
                        : prev,
                    )
                  }
                >
                  {withCurrentOption(accountChoices, s.account).map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
            <Row gap="sm" align="center">
              <Button onClick={handleConfirm}>この内容で確定（学習に記録）</Button>
              <Button variant="ghost" onClick={() => setSuggestions(null)}>
                やめる
              </Button>
            </Row>
          </>
        )}
      </Col>
    </Card>
  );
};
