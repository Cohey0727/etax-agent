import { Transaction, filterYear } from "@etax/shared";
import { Href } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { fetchFilingInputs, fetchTaxpayerProfile } from "@/api";
import { AppButton, AppText, Card, Chip } from "@/components";
import { space } from "@/theme";

export interface SetupChecklistPanelProps {
  transactions: Transaction[];
  year: number;
  onNavigate?: (href: Href) => void;
}

interface SetupItem {
  label: string;
  done: boolean;
  detail: string;
  href: Href;
  action: string;
}

/**
 * 初期設定チェックリスト。納税者情報・帳簿データ・申告入力の3項目は
 * それぞれ独立しており、各項目から直接その画面へ移動できる。
 * 全部そろったら表示しない。
 */
export function SetupChecklistPanel({ transactions, year, onNavigate }: SetupChecklistPanelProps) {
  // 取得した設定状況は取得した年度と組にして持ち、表示中の年度のものだけを使う。
  const [setupStatus, setSetupStatus] = useState<{
    year: number;
    profileDone: boolean;
    inputsDone: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([fetchTaxpayerProfile(year), fetchFilingInputs(year)]).then(
      ([profile, inputs]) => {
        if (cancelled) return;
        setSetupStatus({
          year,
          profileDone: Boolean(profile?.taxpayer.name),
          inputsDone: inputs !== null,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [year]);

  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);

  if (setupStatus === null || setupStatus.year !== year) return null;
  const { profileDone, inputsDone } = setupStatus;

  const items: SetupItem[] = [
    {
      label: "納税者情報",
      done: profileDone,
      detail: profileDone ? "氏名などが登録されています" : "氏名・住所・マイナンバーなどを登録します",
      href: "/taxpayer",
      action: "納税者情報を開く →",
    },
    {
      label: "帳簿データ",
      done: yearTransactions.length > 0,
      detail:
        yearTransactions.length > 0
          ? `${year}年分の取引 ${yearTransactions.length} 件`
          : "銀行・カードのCSVを取り込みます",
      href: "/import",
      action: "CSV取込を開く →",
    },
    {
      label: "申告の種類と控除",
      done: inputsDone,
      detail: inputsDone
        ? "申告入力が保存されています"
        : "青色/白色の選択と、控除・雑所得の入力をします",
      href: "/filing",
      action: "確定申告画面を開く →",
    },
  ];

  if (items.every((item) => item.done)) return null;

  return (
    <Card>
      <AppText size="lg" weight="bold">
        初期設定 — {year}年分
      </AppText>
      <AppText size="sm" tone="muted">
        申告に必要な設定の一覧です。各項目は独立しているので、どれからでも始められます。
      </AppText>
      {items.map((item) => (
        <View key={item.label} style={styles.item}>
          <View style={styles.labelRow}>
            <AppText size="md">{item.label}</AppText>
            <Chip label={item.done ? "設定済み" : "未設定"} tone={item.done ? "accent" : "muted"} />
          </View>
          <AppText size="sm" tone="muted">
            {item.detail}
          </AppText>
          {!item.done && onNavigate ? (
            <AppButton
              label={item.action}
              variant="ghost"
              size="sm"
              onPress={() => onNavigate(item.href)}
            />
          ) : null}
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  item: { gap: space.xs },
  labelRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
