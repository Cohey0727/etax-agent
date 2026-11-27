import { BreakdownEntry } from "@etax/shared";
import { ReactNode, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppButton, AppText, BouncePressable, Field } from "@/components";
import { space } from "@/theme";
import { formatYen } from "@/utils";
import { newBreakdownEntryId } from "../deductionState";
import { MoneyInput } from "../fields";

export interface BreakdownEntriesFieldsProps {
  /** 見出し（例: 社会保険料）。見出しごと開閉できる。 */
  title: string;
  /** 内訳（名称・金額） */
  entries: BreakdownEntry[];
  /**
   * 保存済みの合計。内訳が無く合計だけが保存されているとき（エージェントや
   * MCP が合計だけを入れた場合など）は、これを1件の内訳として見せる。
   * 内訳を編集し始めたら、合計は内訳の合計に置き換わる。
   */
  savedTotal: number;
  onChange: (entries: BreakdownEntry[]) => void;
  /** 名称欄のプレースホルダ（例: 寄附先（自治体名など）） */
  namePlaceholder: string;
  /** 名称欄のラベル（例: 寄附先） */
  nameLabel: string;
  /** 追加ボタンの文言（例: ＋ 寄附を追加） */
  addLabel: string;
  /** 開いたときに合計の下に出す補足（控除の計算方法など） */
  note?: ReactNode;
}

/**
 * 「内訳があって合計が控除の元になる」入力の共通エディタ。
 * 寄附金・社会保険料・小規模企業共済等・医療費で使う。
 * 見出しは合計だけが見える開閉式で、開くと1件ずつ名称と金額を
 * 入れられる。合計は内訳の合計がそのまま控除の入力になる。
 * 入力済みの内訳がある場合は、隠れて見えないことがないよう開いた状態で始める。
 */
export function BreakdownEntriesFields({
  title,
  entries,
  savedTotal,
  onChange,
  namePlaceholder,
  nameLabel,
  addLabel,
  note,
}: BreakdownEntriesFieldsProps) {
  const [open, setOpen] = useState(() => entries.length > 0 || savedTotal > 0);
  // 内訳がまだ無い場合は、保存済みの合計を1件として見せる（消えないように）。
  // 何も無ければ空の1行から始められるようにする。
  const rows: BreakdownEntry[] =
    entries.length > 0
      ? entries
      : savedTotal > 0
        ? [{ id: "breakdown-saved-total", recipient: "", amount: savedTotal }]
        : [{ id: "breakdown-initial", recipient: "", amount: 0 }];
  const total = rows.reduce((sum, e) => sum + (e.amount || 0), 0);

  const update = (id: string, patch: Partial<BreakdownEntry>) =>
    onChange(rows.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(rows.filter((e) => e.id !== id));
  const add = () => onChange([...rows, { id: newBreakdownEntryId(), recipient: "", amount: 0 }]);

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <BouncePressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((v) => !v)}
          style={styles.toggle}
        >
          <AppText size="md" weight="semibold">
            {open ? "▾" : "▸"} {title}
          </AppText>
        </BouncePressable>
        <AppText size="sm" tone="muted">
          合計{" "}
          <AppText size="md" weight="bold">
            {formatYen(total)}
          </AppText>
        </AppText>
      </View>
      {open ? (
        <View style={styles.body}>
          {rows.map((entry) => (
            <View key={entry.id} style={styles.entry}>
              <View style={styles.entryFields}>
                <Field
                  label={nameLabel}
                  value={entry.recipient}
                  onChangeText={(recipient) => update(entry.id, { recipient })}
                  placeholder={namePlaceholder}
                />
                <View style={styles.amountRow}>
                  <AppText size="sm" weight="semibold" tone="subtle" style={styles.amountLabel}>
                    金額
                  </AppText>
                  <View style={styles.amountInput}>
                    <MoneyInput
                      accessibilityLabel="金額"
                      value={entry.amount}
                      onChange={(amount) => update(entry.id, { amount })}
                    />
                  </View>
                </View>
              </View>
              <AppButton
                label="削除"
                variant="ghost"
                size="sm"
                onPress={() => remove(entry.id)}
              />
            </View>
          ))}
          <AppButton label={addLabel} variant="ghost" size="sm" onPress={add} />
          {note ? (
            <AppText size="sm" tone="muted">
              {note}
            </AppText>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
  },
  toggle: { paddingVertical: 4, flexShrink: 1 },
  body: { gap: space.sm, paddingLeft: space.sm },
  entry: { gap: space.xs },
  entryFields: { gap: space.xs },
  amountRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  amountLabel: { width: 60 },
  amountInput: { flex: 1 },
});
