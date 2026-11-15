import { useEffect, useState } from "react";
import { Card, Col, Text } from "@components/atoms";
import { ClassificationHistory, GeneratedRules } from "@types";
import { fetchClassificationHistory, fetchGeneratedRules } from "@utils";
import styles from "./AiMemoryPanel.css";

interface AiMemoryData {
  history: ClassificationHistory;
  rules: GeneratedRules;
}

/**
 * AIのメモリー（科目判定の学習）を確認するカード。
 * ユーザーが確定・修正した「摘要 → 科目」の対応（学習履歴）と、
 * そこから自動生成される適用ルール（正規表現＋jev用プロンプト）を出す。
 * 判定はこの順で効く: 学習履歴 → 生成ルール → jev → キーワードルール。
 */
export const AiMemoryPanel = () => {
  const [data, setData] = useState<AiMemoryData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchClassificationHistory(), fetchGeneratedRules()])
      .then(([history, rules]) => {
        if (!cancelled) setData({ history, rules });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <Col gap="md">
        <Text variant="sectionTitle">AIのメモリー（科目判定の学習）</Text>
        {failed ? (
          <Text variant="caption">⚠ メモリーの読み込みに失敗しました</Text>
        ) : !data ? (
          <Text variant="muted">読み込み中…</Text>
        ) : (
          <>
            <Col gap="sm">
              <Text variant="statLabel">学習した対応（{data.history.total}件）</Text>
              {data.history.records.length === 0 ? (
                <Text variant="muted">
                  まだ学習履歴がありません。帳簿や科目判定で科目を確定・修正すると、ここに貯まります。
                </Text>
              ) : (
                <div>
                  {data.history.records.map((record) => (
                    <div
                      key={`${record.description}-${record.account}`}
                      className={styles.recordRow}
                    >
                      <Text className={styles.recordMain}>{record.description}</Text>
                      <Text variant="muted" className={styles.recordSide}>
                        → {record.account}（{record.count}回）
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">自動生成ルール（正規表現）</Text>
              {data.rules.regexRules.length === 0 ? (
                <Text variant="muted">まだ生成されていません。</Text>
              ) : (
                <div>
                  {data.rules.regexRules.map((rule) => (
                    <div key={rule.pattern} className={styles.recordRow}>
                      <Text className={`${styles.recordMain} ${styles.mono}`}>{rule.pattern}</Text>
                      <Text variant="muted" className={styles.recordSide}>
                        → {rule.category}（例: {rule.example}）
                      </Text>
                    </div>
                  ))}
                </div>
              )}
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">jev用プロンプト</Text>
              {data.rules.jevPrompt ? (
                <pre className={styles.promptPre}>{data.rules.jevPrompt}</pre>
              ) : (
                <Text variant="muted">まだ生成されていません。</Text>
              )}
            </Col>
            <Text variant="caption">
              科目判定は「学習した対応 → 自動生成ルール → jev（科目判定の接続）→
              キーワードルール」の順に効きます。学習履歴はサーバーに保存されます。
            </Text>
          </>
        )}
      </Col>
    </Card>
  );
};
