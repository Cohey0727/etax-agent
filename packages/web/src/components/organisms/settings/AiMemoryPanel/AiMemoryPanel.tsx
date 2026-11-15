import { useEffect, useState } from "react";
import { Button, Card, Col, Row, Text, Textarea } from "@components/atoms";
import { ClassificationHistory, GeneratedRules, JevPromptInfo } from "@types";
import {
  fetchClassificationHistory,
  fetchGeneratedRules,
  fetchJevPrompt,
  updateJevPrompt,
} from "@utils";
import styles from "./AiMemoryPanel.css";

interface AiMemoryData {
  history: ClassificationHistory;
  rules: GeneratedRules;
  prompt: JevPromptInfo;
}

interface StatusMessage {
  ok: boolean;
  text: string;
}

/**
 * AIのメモリー（科目判定の学習）を見るカード。
 * 学習した対応と自動生成ルールは参照のみ。jev用プロンプトだけはここで
 * 直接編集でき、保存すると自動生成より優先して判定に使われる
 * （空にして保存すると自動生成に戻る）。
 * 判定はこの順で効く: 学習履歴 → 生成ルール → jev → キーワードルール。
 */
export const AiMemoryPanel = () => {
  const [data, setData] = useState<AiMemoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  /** プロンプトの編集中テキスト。null は未編集（実効プロンプトのまま）。 */
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchClassificationHistory(), fetchGeneratedRules(), fetchJevPrompt()])
      .then(([history, rules, prompt]) => {
        if (!cancelled) setData({ history, rules, prompt });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const draftValue = data ? (draft ?? data.prompt.effectivePrompt) : "";
  const dirty = data !== null && draft !== null && draft !== data.prompt.effectivePrompt;

  const savePrompt = async (prompt: string, doneText: string) => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await updateJevPrompt(prompt);
      setData((current) => (current ? { ...current, prompt: next } : current));
      setDraft(null);
      setMessage({ ok: true, text: doneText });
    } catch {
      setMessage({ ok: false, text: "プロンプトの保存に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

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
                  まだ学習履歴がありません。帳簿や科目判定で科目を確定・修正すると、ここに貯まっていきます。
                </Text>
              ) : (
                <div>
                  {data.history.records.map((record) => (
                    <div
                      key={`${record.description}__${record.account}`}
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
              <Text variant="caption">
                {data.prompt.customPrompt
                  ? "カスタムプロンプトを使用中です（自動生成より優先されます）"
                  : "自動生成のプロンプトを使用中です。編集して保存するとカスタムプロンプトになります"}
              </Text>
              <Textarea
                value={draftValue}
                rows={9}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="jev用プロンプト"
                placeholder="（自動生成のプロンプトはまだありません。ここに書いて保存すると、そのまま判定に使われます）"
              />
              <Row gap="sm" align="center">
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || !dirty}
                  disabledReason={busy ? "処理中です" : "変更がありません"}
                  onClick={() => void savePrompt(draftValue, "プロンプトを保存しました")}
                >
                  保存
                </Button>
                {data.prompt.customPrompt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    disabledReason="処理中です"
                    onClick={() => void savePrompt("", "自動生成のプロンプトに戻しました")}
                  >
                    自動生成に戻す
                  </Button>
                ) : null}
                {message ? (
                  <Text variant="caption">
                    {message.ok ? "✓ " : "⚠ "}
                    {message.text}
                  </Text>
                ) : null}
              </Row>
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
