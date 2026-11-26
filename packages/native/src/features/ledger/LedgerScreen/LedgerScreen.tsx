import { normalizeSearchText } from "@etax/shared";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  createLedgerTransaction,
  deleteLedgerTransaction,
  LedgerTransaction,
  LedgerTransactionInput,
  recordClassificationFeedback,
  updateLedgerTransaction,
} from "@/api";
import {
  AlertBox, AppButton, AppText, BouncePressable, Card, Field, LabeledValue,
  ScreenContainer, SelectField, Sheet, SkeletonCard,
} from "@/components";
import { useAppState } from "@/state/AppContext";
import { colors, radius, space } from "@/theme";
import { formatYen } from "@/utils";
import { LedgerForm } from "../LedgerForm";
import { LedgerRow } from "../LedgerRow";
import { TransactionHistory } from "../TransactionHistory";
import { emptyDraft, INCOME_TYPE_OPTIONS, toInput } from "../options";

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <BouncePressable
      onPress={onPress}
      pressScale={0.94}
      style={[styles.filterChip, active ? styles.filterChipActive : styles.filterChipIdle]}
    >
      <AppText numberOfLines={1} size="sm" weight="bold" style={{ color: active ? colors.onAccent : colors.textSubtle }}>
        {label}
      </AppText>
    </BouncePressable>
  );
}

export interface LedgerScreenProps {
  /** 初期表示で絞り込む勘定科目（試算表からのドリルダウンで渡る）。空なら絞らない。 */
  initialCategories?: string[];
  /** 初期表示で絞り込む所得区分（試算表からのドリルダウンで渡る）。 */
  initialIncomeType?: string;
}

const VALID_INCOME_TYPES: readonly string[] = INCOME_TYPE_OPTIONS.map((o) => o.value);

/** 帳簿画面。選択年度の取引を検索・絞り込みし、追加・編集・削除・履歴確認ができる。 */
export function LedgerScreen({ initialCategories, initialIncomeType }: LedgerScreenProps) {
  const { year, years, setYear, ledgerRows, ledgerLoading, reloadLedger } = useAppState();
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>(() =>
    (initialCategories ?? []).filter((c) => c !== ""),
  );
  const [typeFilter, setTypeFilter] = useState<string>(() =>
    initialIncomeType && VALID_INCOME_TYPES.includes(initialIncomeType) ? initialIncomeType : "すべて",
  );
  const [signFilter, setSignFilter] = useState<string>("すべて");
  const [selected, setSelected] = useState<LedgerTransaction | null>(null);
  const [edit, setEdit] = useState<LedgerTransactionInput | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<LedgerTransactionInput>(() => emptyDraft(year));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const yearRows = useMemo(
    () => (ledgerRows ?? []).filter((r) => r.fiscal_year === year).sort((a, b) => a.date.localeCompare(b.date)),
    [ledgerRows, year],
  );
  const categories = useMemo(
    () => [...new Set(yearRows.map((r) => r.category))].sort(),
    [yearRows],
  );
  const visible = useMemo(() => {
    const q = normalizeSearchText(query.trim());
    return yearRows.filter((row) => {
      if (categoryFilter.length > 0 && !categoryFilter.includes(row.category)) return false;
      if (typeFilter !== "すべて" && row.income_type !== typeFilter) return false;
      if (signFilter === "収入" && row.amount <= 0) return false;
      if (signFilter === "支出" && row.amount >= 0) return false;
      if (!q) return true;
      return [row.description, row.category, row.account, row.tax_category].some((v) =>
        normalizeSearchText(v).includes(q),
      );
    });
  }, [yearRows, query, categoryFilter, typeFilter, signFilter]);

  const incomeTotal = visible.reduce((s, r) => (r.amount > 0 ? s + r.amount : s), 0);
  const expenseTotal = visible.reduce((s, r) => (r.amount < 0 ? s - r.amount : s), 0);

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
      </Card>
      <Field label="検索" value={query} onChangeText={setQuery} placeholder="摘要・勘定科目・出所・税区分で検索" />
      <View style={{ gap: 6 }}>
        <AppText size="sm" weight="semibold" tone="subtle">勘定科目</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <FilterChip
              label="すべて"
              active={categoryFilter.length === 0}
              onPress={() => setCategoryFilter([])}
            />
            {categories.map((c) => (
              <FilterChip
                key={c}
                label={c}
                active={categoryFilter.includes(c)}
                onPress={() =>
                  setCategoryFilter((prev) =>
                    prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c],
                  )
                }
              />
            ))}
          </View>
        </ScrollView>
      </View>
      <View style={{ gap: 6 }}>
        <AppText size="sm" weight="semibold" tone="subtle">区分・収支</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chipRow}>
            <FilterChip label="すべての区分" active={typeFilter === "すべて"} onPress={() => setTypeFilter("すべて")} />
            {INCOME_TYPE_OPTIONS.map((o) => (
              <FilterChip key={o.value} label={o.label} active={typeFilter === o.value} onPress={() => setTypeFilter(o.value)} />
            ))}
            {["すべて", "収入", "支出"].map((s) => (
              <FilterChip key={s} label={s === "すべて" ? "収支すべて" : s} active={signFilter === s} onPress={() => setSignFilter(s)} />
            ))}
          </View>
        </ScrollView>
      </View>
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
  chipRow: { flexDirection: "row", gap: 6 },
  filterChip: { borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1 },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterChipIdle: { backgroundColor: colors.surface, borderColor: colors.borderStrong },
});
