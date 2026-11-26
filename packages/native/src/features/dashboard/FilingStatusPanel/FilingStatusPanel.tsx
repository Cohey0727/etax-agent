import { Transaction, filterYear } from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { FilingStatus, fetchFilingStatuses } from "@/api";
import { AppButton, AppText, Card, Chip, SkeletonBar } from "@/components";
import { space } from "@/theme";
import { formatDate } from "@/utils";

type ManualKey = "confirmed" | "calculated";

const MANUAL_ITEMS: readonly { key: ManualKey; label: string }[] = [
  { key: "confirmed", label: "収支" },
  { key: "calculated", label: "控除・計算" },
];

const SKELETON_LABELS: readonly string[] = ["帳簿", ...MANUAL_ITEMS.map((item) => item.label)];

const EMPTY_STATUS: FilingStatus = {
  year: 0,
  confirmed: false,
  confirmed_at: null,
  calculated: false,
  calculated_at: null,
  submitted: false,
  submitted_at: null,
};

export interface FilingStatusPanelProps {
  transactions: Transaction[];
  year: number;
  onOpenFiling?: () => void;
}

/**
 * 申告ステータス（表示専用）。収支・控除・計算は独立した項目として
 * 一覧で示す。ステータスの変更は確定申告画面で行う。
 * DB未接続の環境では何も表示しない。
 */
export function FilingStatusPanel({ transactions, year, onOpenFiling }: FilingStatusPanelProps) {
  const [statuses, setStatuses] = useState<FilingStatus[] | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingStatuses().then((result) => {
      if (cancelled) return;
      setStatuses(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const unclassifiedCount = yearTransactions.filter((t) => t.category === "未分類").length;
  const status = statuses?.find((s) => s.year === year) ?? EMPTY_STATUS;

  if (!loaded) {
    return (
      <Card>
        <AppText size="lg" weight="bold">
          申告ステータス — {year}年分
        </AppText>
        <AppText size="sm" tone="muted">
          収支と控除・計算の進捗表示です。ステータスの変更は確定申告画面で行います。
          提出は e-Tax で行います。
        </AppText>
        {SKELETON_LABELS.map((label) => (
          <View key={label} style={styles.row}>
            <AppText size="md">{label}</AppText>
            <SkeletonBar width="45%" height={12} />
          </View>
        ))}
      </Card>
    );
  }

  if (statuses === null) return null;

  const rows: { label: string; done: boolean; state: string }[] = [
    {
      label: "帳簿",
      done: yearTransactions.length > 0,
      state: `取引 ${yearTransactions.length} 件${unclassifiedCount > 0 ? ` ・ 未分類 ${unclassifiedCount} 件` : ""}`,
    },
    ...MANUAL_ITEMS.map((item) => {
      const done = status[item.key];
      const doneAt = status[`${item.key}_at`];
      return {
        label: item.label,
        done,
        state: done && doneAt ? `${formatDate(doneAt)} 確定` : done ? "確定" : "未確定",
      };
    }),
  ];

  return (
    <Card>
      <AppText size="lg" weight="bold">
        申告ステータス — {year}年分
      </AppText>
      <AppText size="sm" tone="muted">
        収支と控除・計算の進捗表示です。ステータスの変更は確定申告画面で行います。
        提出は e-Tax で行います。
      </AppText>
      {rows.map((row) => (
        <View key={row.label} style={styles.rowBetween}>
          <View style={styles.labelRow}>
            <AppText size="md">{row.label}</AppText>
            <Chip label={row.done ? "確定" : "未確定"} tone={row.done ? "accent" : "muted"} />
          </View>
          <AppText size="sm" tone="muted">
            {row.state}
          </AppText>
        </View>
      ))}
      {onOpenFiling ? (
        <AppButton label="確定申告画面を開く →" variant="ghost" size="sm" onPress={onOpenFiling} />
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm },
  rowBetween: { gap: 2 },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
