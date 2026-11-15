import { useEffect, useState } from "react";
import { ACCOUNT_NAMES } from "@etax/shared";
import { Button, Card, Col, Input, Row, Select, Text } from "@components/atoms";
import { ClassificationHistory, ClassificationHistoryEntry, GeneratedRules } from "@types";
import {
  addClassificationHistoryEntry,
  deleteClassificationHistoryEntry,
  fetchClassificationHistory,
  fetchGeneratedRules,
  updateClassificationHistoryEntry,
} from "@utils";
import styles from "./AiMemoryPanel.css";

interface AiMemoryData {
  history: ClassificationHistory;
  rules: GeneratedRules;
}

interface StatusMessage {
  ok: boolean;
  text: string;
}

const entryKey = (record: ClassificationHistoryEntry): string =>
  `${record.description}__${record.account}`;

/**
 * AIのメモリー（科目判定の学習）を確認・編集するカード。
 * ユーザーが確定・修正した「摘要 → 科目」の対応（学習履歴）はここで
 * 科目の付け替え・削除・追加ができる。自動生成ルールと jev 用プロンプトは
 * 学習履歴から都度作られるため、履歴を直せば追随する（直接は編集しない）。
 * 判定はこの順で効く: 学習履歴 → 生成ルール → jev → キーワードルール。
 */
export const AiMemoryPanel = () => {
  const [data, setData] = useState<AiMemoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [addDescription, setAddDescription] = useState("");
  const [addAccount, setAddAccount] = useState<string>("雑費");

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

  /** 履歴が変わったら生成ルールも読み直して、表示を最新にそろえる。 */
  const applyHistory = async (history: ClassificationHistory) => {
    const rules = await fetchGeneratedRules();
    setData({ history, rules });
  };

  const handleChangeAccount = async (record: ClassificationHistoryEntry, newAccount: string) => {
    if (newAccount === record.account) return;
    setBusy(true);
    setMessage(null);
    setArmedKey(null);
    try {
      const history = await updateClassificationHistoryEntry(
        record.description,
        record.account,
        newAccount,
      );
      await applyHistory(history);
      setMessage({ ok: true, text: `「${record.description}」を${newAccount}に変更しました` });
    } catch {
      setMessage({ ok: false, text: "変更に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (record: ClassificationHistoryEntry) => {
    if (armedKey !== entryKey(record)) {
      setArmedKey(entryKey(record));
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const history = await deleteClassificationHistoryEntry(record.description, record.account);
      await applyHistory(history);
      setArmedKey(null);
      setMessage({ ok: true, text: `「${record.description}」を削除しました` });
    } catch {
      setMessage({ ok: false, text: "削除に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async () => {
    const description = addDescription.trim();
    if (!description) return;
    setBusy(true);
    setMessage(null);
    setArmedKey(null);
    try {
      await addClassificationHistoryEntry(description, addAccount);
      const history = await fetchClassificationHistory();
      await applyHistory(history);
      setAddDescription("");
      setMessage({ ok: true, text: `「${description}」→ ${addAccount} を覚えました` });
    } catch {
      setMessage({ ok: false, text: "追加に失敗しました" });
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
                  まだ学習履歴がありません。帳簿や科目判定で科目を確定・修正するか、下のフォームから追加できます。
                </Text>
              ) : (
                <div>
                  {data.history.records.map((record) => (
                    <div key={entryKey(record)} className={styles.recordRow}>
                      <Text className={styles.recordMain}>{record.description}</Text>
                      <Row gap="sm" align="center" className={styles.recordSide}>
                        <Select
                          value={record.account}
                          disabled={busy}
                          onChange={(e) => void handleChangeAccount(record, e.target.value)}
                          aria-label={`「${record.description}」の勘定科目`}
                        >
                          {ACCOUNT_NAMES.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </Select>
                        <Text variant="muted">{record.count}回</Text>
                        <Button
                          variant={armedKey === entryKey(record) ? "danger" : "ghost"}
                          size="sm"
                          disabled={busy}
                          disabledReason="処理中です"
                          onClick={() => void handleDelete(record)}
                        >
                          {armedKey === entryKey(record) ? "本当に削除" : "削除"}
                        </Button>
                      </Row>
                    </div>
                  ))}
                </div>
              )}
              <Row gap="sm" align="center">
                <Input
                  value={addDescription}
                  onChange={(e) => setAddDescription(e.target.value)}
                  placeholder="摘要（例: セブン-イレブン）"
                  autoComplete="off"
                />
                <Select
                  value={addAccount}
                  disabled={busy}
                  onChange={(e) => setAddAccount(e.target.value)}
                  aria-label="追加する対応の勘定科目"
                >
                  {ACCOUNT_NAMES.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={busy || !addDescription.trim()}
                  disabledReason={!addDescription.trim() ? "摘要を入力してください" : "処理中です"}
                  onClick={() => void handleAdd()}
                >
                  追加
                </Button>
              </Row>
              {message ? (
                <Text variant="caption">
                  {message.ok ? "✓ " : "⚠ "}
                  {message.text}
                </Text>
              ) : null}
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
              キーワードルール」の順に効きます。自動生成ルールとjev用プロンプトは学習履歴から作られるため、直すときは学習した対応を編集してください。学習履歴はサーバーに保存されます。
            </Text>
          </>
        )}
      </Col>
    </Card>
  );
};
