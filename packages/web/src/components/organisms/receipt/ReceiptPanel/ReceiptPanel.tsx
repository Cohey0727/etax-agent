import { ACCOUNT_NAMES, guessIncomeType, Transaction } from "@etax/shared";
import { ChangeEvent, useRef, useState } from "react";
import { Button, Card, Col, Icon, Input, Row, Select, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { AccountClassification, ClassificationSource } from "@types";
import { analyzeReceiptImage, recordClassificationFeedback } from "@utils";
import styles from "./ReceiptPanel.css";
import { registerReceiptTransaction } from "./ReceiptPanel.utils";

export interface ReceiptPanelProps {
  /** 画像を解析した（証憑台帳に記録された）。 */
  onAnalyzed: () => void;
  /** 帳簿へ登録した取引を画面の取引へ加える。 */
  onRegistered: (transaction: Transaction) => void;
}

const sourceLabels = {
  generated: "生成ルール",
  systemone: "AI判定",
  rules: "キーワードルール",
  none: "判定なし",
} as const satisfies Record<ClassificationSource, string>;

interface ReceiptDraft {
  date: string;
  amount: string;
  description: string;
  account: string;
  classification: AccountClassification;
  /** 証憑台帳に記録された証憑。登録した取引へ紐付ける（Base64 で解析した場合は null）。 */
  fileId: string | null;
}

export const ReceiptPanel = ({ onAnalyzed, onRegistered }: ReceiptPanelProps) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<{ linked: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 撮影専用の受け口。capture を付けるとスマホではカメラが直接開く
  // （PCでは通常のファイル選択として振る舞う）。
  const cameraRef = useRef<HTMLInputElement>(null);

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleFile(f);
    e.target.value = "";
  };

  const handleFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setAdded(null);
    setDraft(null);
    setPreviewUrl(URL.createObjectURL(file));
    try {
      const { result: res, fileId } = await analyzeReceiptImage(file);
      const description = [res.payee, res.description].filter(Boolean).join(" ");
      setDraft({
        date: res.date ?? "",
        amount: res.amount !== null ? String(res.amount) : "",
        description,
        account: res.classification.account,
        classification: res.classification,
        fileId,
      });
      onAnalyzed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!draft || saving) return;
    const amount = Number(draft.amount);
    if (!draft.date || !Number.isFinite(amount) || amount === 0) {
      setError("日付と金額を確認してください");
      return;
    }
    const tx: Transaction = {
      date: draft.date,
      year: Number(draft.date.slice(0, 4)),
      description: draft.description,
      amount: -Math.abs(Math.trunc(amount)),
      account: "領収書画像",
      category: draft.account,
      income_type: guessIncomeType(draft.description, draft.account),
      // 領収書は仕入・経費なので、既定は課税仕入10%（帳簿で直せる）
      tax_category: "課対仕入10%",
    };
    setSaving(true);
    setError(null);
    try {
      const registered = await registerReceiptTransaction(tx, draft.fileId);
      onRegistered(registered.transaction);
      // 確定した科目は学習履歴に記録し、生成ルールとプロンプトの材料にする
      void recordClassificationFeedback(draft.description, draft.account);
      setAdded({ linked: registered.linked });
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Col gap="md">
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">領収書・レシート画像から帳簿付け</Text>
          <Text variant="muted">
            画像を選ぶと、AIが日付・金額・支払先を読み取り、勘定科目は自動生成ルールと
            AI判定で提案します。スマホでは「撮影する」からその場で撮影できます。
            内容を確認して「帳簿に追加」を押すと取引に加わり、
            確定した科目は学習されて、生成ルールとプロンプトに反映されます。
          </Text>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className={styles.hiddenInput}
            onChange={handleFileInput}
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className={styles.hiddenInput}
            onChange={handleFileInput}
          />
          <Row gap="sm" align="center" wrap>
            <Button
              size="md"
              disabled={loading}
              disabledReason="読み取り中です"
              onClick={() => cameraRef.current?.click()}
            >
              <Icon name="camera" />
              {loading ? "読み取り中…" : "撮影する"}
            </Button>
            <Button
              variant="ghost"
              size="md"
              disabled={loading}
              disabledReason="読み取り中です"
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="image" />
              画像を選ぶ
            </Button>
          </Row>
          {previewUrl && <img src={previewUrl} alt="領収書のプレビュー" className={styles.preview} />}
        </Col>
      </Card>

      {error && <AlertBox variant="error">{error}</AlertBox>}
      {added && (
        <Col gap="sm">
          <AlertBox variant="notice">
            帳簿に追加しました。ダッシュボードで集計に反映されています。科目は学習履歴に記録しました。
            {added.linked ? "証憑を取引に紐付けました。" : ""}
          </AlertBox>
          <Row gap="sm" align="center">
            <Button size="md" onClick={() => cameraRef.current?.click()}>
              <Icon name="camera" />
              続けて撮影する
            </Button>
          </Row>
        </Col>
      )}

      {draft && (
        <Card>
          <Col gap="sm">
            <Text variant="sectionTitle">読み取り結果（帳簿ドラフト）</Text>
            <div className={styles.fieldRow}>
              <Text variant="statLabel">日付</Text>
              <Input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
              />
            </div>
            <div className={styles.fieldRow}>
              <Text variant="statLabel">金額（税込・円）</Text>
              <Input
                type="number"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
              />
            </div>
            <div className={styles.fieldRow}>
              <Text variant="statLabel">摘要</Text>
              <Input
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </div>
            <div className={styles.fieldRow}>
              <Text variant="statLabel">勘定科目</Text>
              <Select
                value={draft.account}
                onChange={(e) => setDraft({ ...draft, account: e.target.value })}
                aria-label="勘定科目"
              >
                {[...ACCOUNT_NAMES, "未分類"].map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>
            <Text variant="muted">
              科目の根拠: {sourceLabels[draft.classification.source]}
              {draft.classification.confidence !== null &&
                `（確信度 ${Math.round(draft.classification.confidence * 100)}%）`}
              {draft.classification.candidates.length > 1 &&
                ` ／ 候補: ${draft.classification.candidates
                  .map((c) => `${c.account} ${Math.round(c.probability * 100)}%`)
                  .join("、")}`}
            </Text>
            <Row gap="sm" align="center" wrap>
              <Button
                size="md"
                className={styles.addButton}
                disabled={saving}
                disabledReason="登録中です"
                onClick={() => void handleAdd()}
              >
                {saving ? "登録中…" : "帳簿に追加"}
              </Button>
              <Text variant="caption">支出として登録します（金額はマイナスで計上）。</Text>
            </Row>
          </Col>
        </Card>
      )}
    </Col>
  );
};
