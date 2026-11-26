import { ACCOUNT_NAMES, guessIncomeType } from "@etax/shared";
import * as ImagePicker from "expo-image-picker";
import { useCallback, useEffect, useState } from "react";
import { Image, View } from "react-native";
import {
  AnalyzeReceiptResponse, analyzeReceiptImage, createLedgerTransaction, fetchReceipts,
  linkReceipt, ReceiptRecord, recordClassificationFeedback, transactionToLedgerInput, unlinkReceipt,
} from "@/api";
import { AlertBox, AppButton, AppText, Card, Field, ScreenContainer, SelectField, SkeletonCard } from "@/components";
import { useAppState } from "@/state/AppContext";
import { parseAmount } from "@/utils";
import { ReceiptLibrary } from "../ReceiptLibrary";

const SOURCE_LABELS: Record<string, string> = {
  generated: "生成ルール", systemone: "AI判定", rules: "キーワードルール", none: "判定なし",
};

interface ReceiptDraft {
  date: string;
  amount: string;
  description: string;
  account: string;
  classification: AnalyzeReceiptResponse["classification"];
}

/** 領収書画面。撮影/選択→解析→確認・修正→帳簿登録＋証憑紐付けと、証憑ライブラリ。 */
export function ReceiptScreen() {
  const { year, ledgerRows, reloadLedger } = useAppState();
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<ReceiptRecord[] | null>(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const reloadLibrary = useCallback(async () => {
    const list = await fetchReceipts().catch(() => null);
    setReceipts(list);
    setLibraryLoading(false);
  }, []);

  useEffect(() => { void reloadLibrary(); }, [reloadLibrary, year]);

  const yearLedger = (ledgerRows ?? []).filter((r) => r.fiscal_year === year);

  const handleAsset = async (asset: ImagePicker.ImagePickerAsset) => {
    setLoading(true); setError(null); setAdded(false); setLinkNote(null); setDraft(null);
    setPreviewUri(asset.uri);
    try {
      const res = await analyzeReceiptImage(asset.uri, asset.mimeType ?? "image/jpeg");
      const description = [res.payee, res.description].filter(Boolean).join(" ");
      setDraft({
        date: res.date ?? "",
        amount: res.amount !== null ? String(res.amount) : "",
        description,
        account: res.classification.account,
        classification: res.classification,
      });
      await reloadLibrary();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(false); }
  };

  const pickFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setError("カメラの許可が必要です"); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) void handleAsset(result.assets[0]);
  };

  const pickFromLibrary = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setError("写真ライブラリの許可が必要です"); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (!result.canceled && result.assets[0]) void handleAsset(result.assets[0]);
  };

  const handleAdd = async () => {
    if (!draft || busy) return;
    const amount = parseAmount(draft.amount);
    if (!draft.date || !Number.isFinite(amount) || amount === 0) {
      setError("日付と金額を確認してください");
      return;
    }
    setBusy(true); setError(null);
    try {
      const created = await createLedgerTransaction(transactionToLedgerInput({
        date: draft.date,
        year: Number(draft.date.slice(0, 4)),
        description: draft.description,
        amount: -Math.abs(Math.trunc(amount)),
        account: "領収書画像",
        category: draft.account,
        income_type: guessIncomeType(draft.description, draft.account),
        tax_category: "課対仕入10%",
        business_ratio_percent: 100,
      }));
      void recordClassificationFeedback(draft.description, draft.account);
      // 解析時に証憑台帳へ記録された未紐付けの最新証憑を、この取引へ紐付ける
      const list = await fetchReceipts().catch(() => null);
      const candidate = (list ?? [])
        .filter((r) => r.transaction_id === null)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      if (candidate) {
        try {
          await linkReceipt(candidate.file_id, created.id);
          setLinkNote("証憑を取引に紐付けました。");
        } catch {
          setLinkNote("証憑の紐付けに失敗しました。下の一覧から手動で紐付けてください。");
        }
      } else {
        setLinkNote("紐付け対象の証憑が見つかりませんでした（Base64経路では証憑台帳に残らない場合があります）。");
      }
      await reloadLedger();
      await reloadLibrary();
      setAdded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  const handleLink = async (receipt: ReceiptRecord, transactionId: number) => {
    setBusy(true); setError(null);
    try { await linkReceipt(receipt.file_id, transactionId); await reloadLibrary(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const handleUnlink = async (receipt: ReceiptRecord) => {
    setBusy(true); setError(null);
    try { await unlinkReceipt(receipt.file_id); await reloadLibrary(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <ScreenContainer>
      <AppText size="xl" weight="bold">領収書から帳簿</AppText>
      <Card>
        <AppText size="lg" weight="bold">領収書・レシート画像から帳簿付け</AppText>
        <AppText size="sm" tone="muted">
          画像を選ぶと、AIが日付・金額・支払先を読み取り、勘定科目は自動生成ルールとAI判定で提案します。内容を確認して「帳簿に追加」を押すと取引に加わり、確定した科目は学習されて、生成ルールとプロンプトに反映されます。
        </AppText>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <AppButton label={loading ? "読み取り中…" : "撮影する"} loading={loading} onPress={() => void pickFromCamera()} />
          <AppButton label="画像を選ぶ" variant="ghost" loading={loading} onPress={() => void pickFromLibrary()} />
        </View>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={{ width: "100%", height: 220, borderRadius: 14 }} resizeMode="contain" />
        ) : null}
      </Card>

      {error ? <AlertBox tone="error" message={error} /> : null}
      {added ? (
        <View style={{ gap: 8 }}>
          <AlertBox tone="success" message="帳簿に追加しました。科目は学習履歴に記録しました。" />
          {linkNote ? <AppText size="sm" tone="muted">{linkNote}</AppText> : null}
          <AppButton label="続けて撮影する" onPress={() => void pickFromCamera()} />
        </View>
      ) : null}

      {draft ? (
        <Card>
          <AppText size="lg" weight="bold">読み取り結果（帳簿ドラフト）</AppText>
          <Field label="日付" value={draft.date} onChangeText={(date) => setDraft({ ...draft, date })} placeholder="2026-01-01" />
          <Field label="金額（税込・円）" value={draft.amount} onChangeText={(amount) => setDraft({ ...draft, amount })} keyboardType="number-pad" inputMode="numeric" />
          <Field label="摘要" value={draft.description} onChangeText={(description) => setDraft({ ...draft, description })} />
          <SelectField
            label="勘定科目"
            value={draft.account}
            options={[...ACCOUNT_NAMES, "未分類"].map((n) => ({ value: n, label: n }))}
            onChange={(account) => setDraft({ ...draft, account })}
          />
          <AppText size="sm" tone="muted">
            科目の根拠: {SOURCE_LABELS[draft.classification.source] ?? draft.classification.source}
            {draft.classification.confidence !== null ? `（確信度 ${Math.round(draft.classification.confidence * 100)}%）` : ""}
            {draft.classification.candidates.length > 1
              ? ` ／ 候補: ${draft.classification.candidates.map((c) => `${c.account} ${Math.round(c.probability * 100)}%`).join("、")}`
              : ""}
          </AppText>
          <AppButton label={busy ? "追加中…" : "帳簿に追加"} loading={busy} onPress={() => void handleAdd()} />
          <AppText size="xs" tone="muted">支出として登録します（金額はマイナスで計上）。</AppText>
        </Card>
      ) : null}

      {libraryLoading ? <SkeletonCard /> : (
        <ReceiptLibrary receipts={receipts} ledger={yearLedger} busy={busy} onLink={handleLink} onUnlink={handleUnlink} />
      )}
    </ScreenContainer>
  );
}
