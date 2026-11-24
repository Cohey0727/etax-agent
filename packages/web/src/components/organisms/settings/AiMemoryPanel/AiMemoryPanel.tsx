import { useEffect, useState } from "react";
import { ACCOUNT_NAMES } from "@etax/shared";
import { Button, Card, Col, Input, Row, Select, Text, Textarea } from "@components/atoms";
import { JevPromptInfo, RegexRuleItem, RegexRulesInfo } from "@types";
import { fetchJevPrompt, fetchRegexRules, updateJevPrompt, updateRegexRules } from "@utils";
import styles from "./AiMemoryPanel.css";

interface AiMemoryData {
  rules: RegexRulesInfo;
  prompt: JevPromptInfo;
}

interface StatusMessage {
  ok: boolean;
  text: string;
}

/** 正規表現として成立するか（保存前の画面側チェック）。 */
const isValidPattern = (pattern: string): boolean => {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
};

/**
 * AIのメモリー（科目判定の学習）を見る・編集するカード。表示するのは2つだけ:
 * 科目判定の正規表現ルールと、判定用プロンプト。どちらもここで直接編集でき、
 * 保存すると自動生成より優先して判定に使われる（ルールは空にして保存、
 * プロンプトは空文字で保存すると自動生成に戻る）。
 */
export const AiMemoryPanel = () => {
  const [data, setData] = useState<AiMemoryData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rulesMessage, setRulesMessage] = useState<StatusMessage | null>(null);
  const [promptMessage, setPromptMessage] = useState<StatusMessage | null>(null);
  /** ルールの編集中リスト。null は未編集（実効ルールのまま）。 */
  const [ruleDraft, setRuleDraft] = useState<RegexRuleItem[] | null>(null);
  /** プロンプトの編集中テキスト。null は未編集（実効プロンプトのまま）。 */
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchRegexRules(), fetchJevPrompt()])
      .then(([rules, prompt]) => {
        if (!cancelled) setData({ rules, prompt });
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 編集対象は実効ルール（カスタムがあればカスタム、なければ自動生成）。
  const baseRules: RegexRuleItem[] = data
    ? data.rules.usingCustom
      ? data.rules.customRules
      : data.rules.generatedRules.map((r) => ({ pattern: r.pattern, category: r.category }))
    : [];
  const editingRules = ruleDraft ?? baseRules;
  const rulesDirty =
    data !== null && ruleDraft !== null && JSON.stringify(ruleDraft) !== JSON.stringify(baseRules);
  const invalidRuleIndex = editingRules.findIndex(
    (r) => r.pattern.trim() !== "" && !isValidPattern(r.pattern),
  );

  const editRule = (index: number, patch: Partial<RegexRuleItem>) => {
    setRuleDraft(editingRules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const saveRules = async (rules: RegexRuleItem[], doneText: string) => {
    setBusy(true);
    setRulesMessage(null);
    try {
      const next = await updateRegexRules(rules);
      setData((current) => (current ? { ...current, rules: next } : current));
      setRuleDraft(null);
      setRulesMessage({ ok: true, text: doneText });
    } catch {
      setRulesMessage({ ok: false, text: "ルールの保存に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const draftValue = data ? (draft ?? data.prompt.effectivePrompt) : "";
  const dirty = data !== null && draft !== null && draft !== data.prompt.effectivePrompt;

  const savePrompt = async (prompt: string, doneText: string) => {
    setBusy(true);
    setPromptMessage(null);
    try {
      const next = await updateJevPrompt(prompt);
      setData((current) => (current ? { ...current, prompt: next } : current));
      setDraft(null);
      setPromptMessage({ ok: true, text: doneText });
    } catch {
      setPromptMessage({ ok: false, text: "プロンプトの保存に失敗しました" });
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
              <Text variant="statLabel">正規表現ルール（自動分類）</Text>
              <Text variant="caption">
                {data.rules.usingCustom
                  ? "カスタムルールを使用中です（自動生成より優先されます）"
                  : "自動生成のルールを使用中です。編集して保存するとカスタムルールになります"}
                。摘要は正規化（英数字は半角・小文字化、カタカナは全角化）してから照合されます。上から順に照合され、最初に当たったルールが使われます。
              </Text>
              {editingRules.length === 0 ? (
                <Text variant="muted">ルールはまだありません。「ルールを追加」から作れます。</Text>
              ) : (
                editingRules.map((rule, index) => (
                  <Row key={index} gap="sm" align="center">
                    <Input
                      className={`${styles.rulePatternInput} ${styles.mono}`}
                      value={rule.pattern}
                      onChange={(e) => editRule(index, { pattern: e.target.value })}
                      aria-label={`正規表現 ${index + 1}`}
                      placeholder="正規表現"
                    />
                    <Select
                      value={rule.category}
                      onChange={(e) => editRule(index, { category: e.target.value })}
                      aria-label={`科目 ${index + 1}`}
                    >
                      {ACCOUNT_NAMES.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      disabledReason="処理中です"
                      onClick={() => setRuleDraft(editingRules.filter((_, i) => i !== index))}
                    >
                      削除
                    </Button>
                  </Row>
                ))
              )}
              {invalidRuleIndex >= 0 ? (
                <Text variant="caption">
                  ⚠ {invalidRuleIndex + 1}行目の正規表現が不正です:
                  {editingRules[invalidRuleIndex]?.pattern}
                </Text>
              ) : null}
              <Row gap="sm" align="center" justify="spaceBetween">
                {rulesMessage ? (
                  <Text variant="caption">
                    {rulesMessage.ok ? "✓ " : "⚠ "}
                    {rulesMessage.text}
                  </Text>
                ) : (
                  <span />
                )}
                <Row gap="sm" align="center">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    disabledReason="処理中です"
                    onClick={() =>
                      setRuleDraft([...editingRules, { pattern: "", category: "雑費" }])
                    }
                  >
                    ルールを追加
                  </Button>
                  {data.rules.usingCustom ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      disabledReason="処理中です"
                      onClick={() => void saveRules([], "自動生成のルールに戻しました")}
                    >
                      自動生成に戻す
                    </Button>
                  ) : null}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || !rulesDirty || invalidRuleIndex >= 0}
                    disabledReason={
                      busy
                        ? "処理中です"
                        : invalidRuleIndex >= 0
                          ? "正規表現が不正な行があります"
                          : "変更がありません"
                    }
                    onClick={() =>
                      void saveRules(
                        editingRules.filter((r) => r.pattern.trim() !== ""),
                        "ルールを保存しました",
                      )
                    }
                  >
                    保存
                  </Button>
                </Row>
              </Row>
              {data.rules.usingCustom && data.rules.generatedRules.length > 0 ? (
                <Col gap="sm">
                  <Text variant="statLabel">自動生成ルール（参考・現在は未使用）</Text>
                  <div>
                    {data.rules.generatedRules.map((rule) => (
                      <div key={rule.pattern} className={styles.recordRow}>
                        <Text className={`${styles.recordMain} ${styles.mono}`}>{rule.pattern}</Text>
                        <Text variant="muted" className={styles.recordSide}>
                          → {rule.category}
                        </Text>
                      </div>
                    ))}
                  </div>
                </Col>
              ) : null}
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">判定用プロンプト</Text>
              <Text variant="caption">
                {data.prompt.customPrompt
                  ? "カスタムプロンプトを使用中です（自動生成より優先されます）"
                  : "自動生成のプロンプトを使用中です。編集して保存するとカスタムプロンプトになります"}
              </Text>
              <Textarea
                value={draftValue}
                rows={9}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="判定用プロンプト"
                placeholder="（自動生成のプロンプトはまだありません。ここに書いて保存すると、そのまま判定に使われます）"
              />
              <Row gap="sm" align="center" justify="spaceBetween">
                {promptMessage ? (
                  <Text variant="caption">
                    {promptMessage.ok ? "✓ " : "⚠ "}
                    {promptMessage.text}
                  </Text>
                ) : (
                  <span />
                )}
                <Row gap="sm" align="center">
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
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={busy || !dirty}
                    disabledReason={busy ? "処理中です" : "変更がありません"}
                    onClick={() => void savePrompt(draftValue, "プロンプトを保存しました")}
                  >
                    保存
                  </Button>
                </Row>
              </Row>
            </Col>
            <Text variant="caption">
              科目判定は「正規表現ルール → AI（プロンプト）→
              キーワードルール」の順に効きます。正規表現に引っ掛かれば自動で対応し、
              決められないものはプロンプトで判定します。ルールとプロンプトはサーバーに保存されます。
            </Text>
          </>
        )}
      </Col>
    </Card>
  );
};
