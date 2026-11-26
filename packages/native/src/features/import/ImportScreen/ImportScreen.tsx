import { ACCOUNT_NAMES, guessIncomeType, sampleTransactions, Transaction } from "@etax/shared";
import * as DocumentPicker from "expo-document-picker";
import { useState } from "react";
import { View } from "react-native";
import {
  classifyAccountsBatch, createLedgerTransaction, ImportCsvResponse, importCsvBytes,
  readLocalFileBytes, recordClassificationFeedback, replaceYearLedgerTransactions,
  transactionToLedgerInput,
} from "@/api";
import { AlertBox, AppButton, AppText, Card, ScreenContainer, SelectField } from "@/components";
import { useAppState } from "@/state/AppContext";
import { formatDate, formatYen } from "@/utils";
import { MappingSummaryCard } from "../MappingSummaryCard";
import { toInput } from "../../ledger/options";

const INCOME_TYPE_LABELS: Record<string, string> = { business: "事業", real_estate: "不動産", other: "その他" };
const SOURCE_LABELS: Record<string, string> = { generated: "生成ルール", systemone: "AI判定", rules: "キーワードルール", none: "判定なし" };

interface Suggestion { index: number; account: string; source: string; confidence: number | null }

/** CSV取込画面。ファイル選択→自動マッピング→科目判定→帳簿登録までを行う。 */
export function ImportScreen() {
  const { ledgerRows, reloadLedger } = useAppState();
  const [result, setResult] = useState<ImportCsvResponse | null>(null);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [using, setUsing] = useState(false);
  const [used, setUsed] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleDone, setSampleDone] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [judging, setJudging] = useState(false);
  const [classified, setClassified] = useState(false);

  const handlePick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: ["text/csv", "text/comma-separated-values", "application/csv"],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setLoading(true); setError(null); setUsed(false); setSuggestions(null); setClassified(false);
    try {
      const bytes = await readLocalFileBytes(asset.uri);
      const res = await importCsvBytes(bytes, asset.name);
      if (res.error) throw new Error(res.error);
      setResult(res);
      setTxs(res.transactions);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResult(null);
    } finally { setLoading(false); }
  };

  const handleUse = async () => {
    if (!result || using) return;
    setUsing(true); setError(null);
    try {
      if (result.persisted) {
        // 保存済みなら取込分で置き換えず、サーバーの帳簿を正として読み直す
        await reloadLedger();
      } else {
        for (const tx of txs) {
          await createLedgerTransaction(transactionToLedgerInput(tx));
        }
        await reloadLedger();
      }
      setUsed(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setUsing(false); }
  };

  const handleLoadSample = async () => {
    if (sampleBusy) return;
    setSampleBusy(true); setError(null);
    try {
      const sample = sampleTransactions();
      const sampleYears = [...new Set(sample.map((tx) => tx.year))];
      for (const sampleYear of sampleYears) {
        const existing = (ledgerRows ?? []).filter((r) => r.fiscal_year === sampleYear).map(toInput);
        const inputs = [
          ...existing,
          ...sample.filter((tx) => tx.year === sampleYear).map(transactionToLedgerInput),
        ];
        await replaceYearLedgerTransactions(sampleYear, inputs);
      }
      await reloadLedger();
      setSampleDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setSampleBusy(false); }
  };

  const unclassifiedCount = txs.filter((tx) => tx.category === "未分類").length;

  const handleJudge = async () => {
    setJudging(true); setError(null);
    try {
      const targets = txs.map((tx, i) => (tx.category === "未分類" ? i : -1)).filter((i) => i >= 0).slice(0, 50);
      const results = await classifyAccountsBatch(targets.map((i) => txs[i]?.description ?? ""));
      setSuggestions(targets.map((index, i) => ({
        index,
        account: results[i]?.account ?? "未分類",
        source: results[i]?.source ?? "none",
        confidence: results[i]?.confidence ?? null,
      })));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setJudging(false); }
  };

  const handleConfirmSuggestions = () => {
    if (!suggestions) return;
    const byIndex = new Map(suggestions.map((s) => [s.index, s.account]));
    setTxs(txs.map((tx, i) => {
      const account = byIndex.get(i);
      if (!account || account === "未分類") return tx;
      return { ...tx, category: account, income_type: guessIncomeType(tx.description, account) };
    }));
    for (const s of suggestions) {
      if (s.account !== "未分類") void recordClassificationFeedback(txs[s.index]?.description ?? "", s.account);
    }
    setSuggestions(null);
    setClassified(true);
    // 未保存の取込では科目の反映はプレビュー上のもの。保存済みの場合は帳簿側の科目は変わらない旨は画面文言で補足する
    if (result?.persisted) {
      setError(null);
    }
  };

  return (
    <ScreenContainer>
      <AppText size="xl" weight="bold">取引・CSV取込</AppText>
      <Card>
        <AppText size="lg" weight="bold">銀行・カード明細CSVの取込</AppText>
        <AppText size="sm" tone="muted">
          銀行やカード会社の明細CSVをそのまま選んでください。列の対応付け（どの列が日付・摘要・金額か）はAIが自動で判定します（APIキーが無い場合はキーワードによる自動判定）。Shift_JIS のCSVにも対応しています。
        </AppText>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <AppButton label={loading ? "取込中…" : "CSVファイルを選ぶ"} loading={loading} onPress={() => void handlePick()} />
          <AppButton label="サンプルデータを読み込む" variant="ghost" loading={sampleBusy} onPress={() => void handleLoadSample()} />
        </View>
        {sampleDone ? <AlertBox tone="success" message="サンプルデータを帳簿に登録しました。" /> : null}
      </Card>

      {error ? <AlertBox tone="error" message={`取込エラー: ${error}`} /> : null}
      {used ? <AlertBox tone="success" message={result?.persisted ? "帳簿を読み直しました。" : "このデータを帳簿に登録しました。"} /> : null}

      {result ? (
        <>
          <MappingSummaryCard result={{ ...result, transactions: txs }} using={using} onUse={() => void handleUse()} />
          {result.persisted ? (
            <AppText size="xs" tone="muted">保存済みの取込では、科目判定の反映はプレビュー表示のみです（帳簿の科目は帳簿画面で編集できます）。</AppText>
          ) : null}
          {unclassifiedCount > 0 || suggestions ? (
            <Card>
              <AppText size="lg" weight="bold">勘定科目の判定（未分類 {unclassifiedCount}件）</AppText>
              <AppText size="sm" tone="muted">未分類の行について科目を提案します。内容を確認して確定すると、科目が反映され、対応が学習されます。</AppText>
              {classified ? <AlertBox tone="success" message="科目を反映し、学習履歴に記録しました。" /> : null}
              {!suggestions ? (
                <AppButton label={judging ? "判定中…" : "未分類の科目を判定する"} loading={judging} onPress={() => void handleJudge()} />
              ) : (
                <View style={{ gap: 10 }}>
                  {suggestions.map((s) => (
                    <View key={s.index} style={{ gap: 4 }}>
                      <AppText size="sm">
                        {txs[s.index]?.description}（{SOURCE_LABELS[s.source] ?? s.source}
                        {s.confidence !== null ? ` ${Math.round(s.confidence * 100)}%` : ""}）
                      </AppText>
                      <SelectField
                        label="勘定科目"
                        value={s.account}
                        options={[...ACCOUNT_NAMES, "未分類"].map((n) => ({ value: n, label: n }))}
                        onChange={(account) => setSuggestions((prev) => prev ? prev.map((p) => p.index === s.index ? { ...p, account } : p) : prev)}
                      />
                    </View>
                  ))}
                  <AppButton label="この内容で確定（学習に記録）" onPress={handleConfirmSuggestions} />
                  <AppButton label="やめる" variant="ghost" onPress={() => setSuggestions(null)} />
                </View>
              )}
            </Card>
          ) : null}
          <Card>
            <AppText size="lg" weight="bold">取込結果（先頭200件）</AppText>
            {txs.slice(0, 200).map((tx, i) => (
              <View key={i} style={{ gap: 2, paddingVertical: 4 }}>
                <AppText size="sm" tone="muted">{formatDate(tx.date)}／{INCOME_TYPE_LABELS[tx.income_type] ?? tx.income_type}／{tx.account}</AppText>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                  <AppText size="md" style={{ flex: 1 }}>{tx.description}（{tx.category}）</AppText>
                  <AppText size="md" weight="bold" tone={tx.amount < 0 ? "negative" : "positive"}>{formatYen(tx.amount)}</AppText>
                </View>
              </View>
            ))}
            {txs.length === 0 ? <AppText tone="muted">取り込める取引がありませんでした。</AppText> : null}
          </Card>
        </>
      ) : null}
    </ScreenContainer>
  );
}
