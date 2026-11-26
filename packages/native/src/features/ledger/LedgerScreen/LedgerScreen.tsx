import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  createLedgerTransaction,
  deleteLedgerTransaction,
  downloadApiFile,
  LedgerTransaction,
  LedgerTransactionInput,
  recordClassificationFeedback,
  saveTextToCacheFile,
  shareFile,
  updateLedgerTransaction,
} from "@/api";
import {
  AlertBox, AppButton, AppText, Card, LabeledValue,
  ScreenContainer, SelectField, Sheet, SkeletonCard,
} from "@/components";
import { useAppState } from "@/state/AppContext";
import { space } from "@/theme";
import { formatYen } from "@/utils";
import { LedgerFilters } from "../LedgerFilters";
import { LedgerForm } from "../LedgerForm";
import { LedgerRow } from "../LedgerRow";
import { TransactionHistory } from "../TransactionHistory";
import { buildLedgerCsv } from "../ledgerCsv";
import { emptyDraft, toInput } from "../options";
import { applyLedgerFilters, useLedgerFilters } from "./useLedgerFilters";

export interface LedgerScreenProps {
  /** 初期表示で絞り込む勘定科目（試算表からのドリルダウンで渡る）。空なら絞らない。 */
  initialCategories?: string[];
  /** 初期表示で絞り込む所得区分（試算表からのドリルダウンで渡る）。 */
  initialIncomeType?: string;
}

/** 帳簿画面。選択年度の取引を検索・絞り込みし、追加・編集・削除・履歴確認ができる。 */
export function LedgerScreen({ initialCategories, initialIncomeType }: LedgerScreenProps) {
  const router = useRouter();
  const { year, years, setYear, ledgerRows, ledgerLoading, reloadLedger } = useAppState();
  const { filters, patchFilters } = useLedgerFilters(initialCategories, initialIncomeType);
  const [selected, setSelected] = useState<LedgerTransaction | null>(null);
  const [edit, setEdit] = useState<LedgerTransactionInput | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<LedgerTransactionInput>(() => emptyDraft(year));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "csv" | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const yearRows = useMemo(
    () => (ledgerRows ?? []).filter((r) => r.fiscal_year === year).sort((a, b) => a.date.localeCompare(b.date)),
    [ledgerRows, year],
  );
  const categories = useMemo(
    () => [...new Set(yearRows.map((r) => r.category))].sort(),
    [yearRows],
  );
  const taxCategories = useMemo(
    () => [...new Set(yearRows.map((r) => r.tax_category))].sort(),
    [yearRows],
  );
  const visible = useMemo(
    () => applyLedgerFilters(yearRows, filters),
    [yearRows, filters],
  );

  const incomeTotal = visible.reduce((s, r) => (r.amount > 0 ? s + r.amount : s), 0);
  const expenseTotal = visible.reduce((s, r) => (r.amount < 0 ? s - r.amount : s), 0);

  const handleExportPdf = async () => {
    if (exporting) return;
    setExporting("pdf");
    setError(null);
    try {
      const file = await downloadApiFile(`/api/transactions/pdf?year=${year}`, `帳簿_${year}.pdf`);
      await shareFile(file, "application/pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDFの出力に失敗しました");
    } finally {
      setExporting(null);
    }
  };

  const handleExportCsv = async () => {
    if (exporting) return;
    setExporting("csv");
    setError(null);
    try {
      const file = saveTextToCacheFile(`ledger-${year}.csv`, buildLedgerCsv(visible));
      await shareFile(file, "text/csv");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CSVの出力に失敗しました");
    } finally {
      setExporting(null);
    }
  };

  const openRow = (row: LedgerTransaction) => {
    setSelected(row);
    setEdit(toInput(row));
    setDeleteArmed(false);
    setError(null);
  };
  const closeSheet = () => { setSelected(null); setEdit(null); };

  const handleSave = async () => {
    if (!selected || !edit || busy) return;
    setBusy(true); setError(null);
    try {
      const updated = await updateLedgerTransaction(selected.id, edit);
      if (updated.category !== selected.category && updated.category !== "未分類") {
        void recordClassificationFeedback(updated.description, updated.category);
      }
      await reloadLedger();
      closeSheet();
    } catch (e) { setError(e instanceof Error ? e.message : "保存に失敗しました"); }
    finally { setBusy(false); }
  };

  const handleDelete = async () => {
    if (!selected || busy) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    setBusy(true); setError(null);
    try {
      await deleteLedgerTransaction(selected.id);
      await reloadLedger();
      closeSheet();
    } catch (e) { setError(e instanceof Error ? e.message : "削除に失敗しました"); }
    finally { setBusy(false); }
  };

  const handleAdd = async () => {
    if (busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) { setError("日付を入力してください"); return; }
    if (!draft.description.trim()) { setError("摘要を入力してください"); return; }
    if (draft.amount === 0) { setError("金額を入力してください（支出はマイナス）"); return; }
    setBusy(true); setError(null);
    try {
      const created = await createLedgerTransaction(draft);
      if (created.category !== "未分類") void recordClassificationFeedback(created.description, created.category);
      await reloadLedger();
      setDraft(emptyDraft(created.fiscal_year));
      setAddOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : "追加に失敗しました"); }
    finally { setBusy(false); }
  };

  if (ledgerLoading) {
    return (
      <ScreenContainer>
        <SkeletonCard /><SkeletonCard /><SkeletonCard />
      </ScreenContainer>
    );
  }
  if (ledgerRows === null) {
    return (
      <ScreenContainer>
        <AlertBox tone="warn" message="帳簿データベースに接続できません。サーバー側のデータベースが起動していない可能性があります。接続されると、この画面で取引の保存・編集ができるようになります。" />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <AppText size="xl" weight="bold">帳簿</AppText>
        <AppButton label="＋ 取引を追加" size="sm" onPress={() => { setDraft(emptyDraft(year)); setError(null); setAddOpen(true); }} />
      </View>
      <View style={styles.exportRow}>
        <AppButton label="取引・CSV取込" variant="ghost" size="sm" onPress={() => router.navigate("/import")} />
        <AppButton label="領収書から帳簿" variant="ghost" size="sm" onPress={() => router.navigate("/receipt")} />
      </View>
      <SelectField
        label="年度"
        value={String(year)}
        options={years.map((y) => ({ value: String(y), label: `${y}年` }))}
        onChange={(v) => setYear(Number(v))}
      />
      <Card>
        <LabeledValue label="取引件数" value={`${visible.length}件`} />
        <LabeledValue label="収入" value={formatYen(incomeTotal)} />
        <LabeledValue label="支出" value={formatYen(expenseTotal)} />
        <LabeledValue label="差引" value={formatYen(incomeTotal - expenseTotal)} strong />
        <View style={styles.exportRow}>
          <AppButton
            label={exporting === "pdf" ? "出力中…" : "PDFで出す"}
            variant="ghost"
            size="sm"
            loading={exporting === "pdf"}
            onPress={() => void handleExportPdf()}
          />
          <AppButton
            label={exporting === "csv" ? "出力中…" : "CSVで出す"}
            variant="ghost"
            size="sm"
            loading={exporting === "csv"}
            onPress={() => void handleExportCsv()}
          />
          <AppButton
            label="訂正・削除履歴"
            variant="ghost"
            size="sm"
            onPress={() => setHistoryOpen(true)}
          />
        </View>
      </Card>
      <LedgerFilters
        filters={filters}
        onPatch={patchFilters}
        categories={categories}
        taxCategories={taxCategories}
      />
      {error && !selected && !addOpen ? <AlertBox tone="error" message={error} /> : null}
      {yearRows.length === 0 ? (
        <AppText tone="muted">まだ取引がありません。「取引を追加」から追加するか、CSV取込・領収書から取り込むと自動で帳簿に保存されます。</AppText>
      ) : visible.length === 0 ? (
        <AppText tone="muted">条件に一致する取引はありません。</AppText>
      ) : (
        <View style={{ gap: space.sm }}>
          {visible.map((row) => <LedgerRow key={row.id} row={row} onPress={openRow} />)}
        </View>
      )}

      <Sheet visible={selected !== null} title="取引の詳細" onClose={closeSheet} scroll>
        {selected && edit ? (
          <View style={{ gap: space.md }}>
            {error ? <AlertBox tone="error" message={error} /> : null}
            <LedgerForm value={edit} yearOptions={years} onChange={setEdit} />
            <AppButton label={busy ? "保存中…" : "保存"} loading={busy} onPress={() => void handleSave()} />
            <AppButton
              label={deleteArmed ? "本当に削除する（もう一度タップ）" : "削除"}
              variant="danger"
              onPress={() => void handleDelete()}
            />
            <AppText size="sm" weight="semibold" tone="subtle">変更履歴</AppText>
            <TransactionHistory transactionId={selected.id} />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={historyOpen} title="訂正・削除履歴" onClose={() => setHistoryOpen(false)} scroll>
        {historyOpen ? <TransactionHistory /> : null}
      </Sheet>

      <Sheet visible={addOpen} title="取引を追加（手動）" onClose={() => setAddOpen(false)} scroll>
        <View style={{ gap: space.md }}>
          {error ? <AlertBox tone="error" message={error} /> : null}
          <LedgerForm value={draft} yearOptions={years} onChange={setDraft} />
          <AppButton label={busy ? "追加中…" : "帳簿に追加"} loading={busy} onPress={() => void handleAdd()} />
          <AppText size="xs" tone="muted">追加・保存・削除はそのまま帳簿データベースに記録されます。</AppText>
        </View>
      </Sheet>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  exportRow: { flexDirection: "row", gap: space.sm, flexWrap: "wrap" },
});
