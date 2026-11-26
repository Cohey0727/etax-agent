import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { FreeeTrialBalance, fetchFreeeTrialBalance } from "@/api";
import { AppText, Card } from "@/components";
import { colors, space } from "@/theme";
import { formatYen } from "@/utils";

export interface FreeeTrialBalanceCardProps {
  year: number;
}

/**
 * 損益計算書（実績）の表示。サーバーに取り込み済みデータが無い場合は
 * 何も表示しない。
 */
export function FreeeTrialBalanceCard({ year }: FreeeTrialBalanceCardProps) {
  const [data, setData] = useState<FreeeTrialBalance | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchFreeeTrialBalance().then((result) => {
      if (!cancelled) setData(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const yearData = data?.years.find((y) => y.year === year);
  if (!data || !yearData) return null;

  return (
    <Card>
      <AppText size="lg" weight="bold">
        損益計算書（実績）— {year}年
      </AppText>
      <AppText size="sm" tone="muted">
        取り込み済みの実際の金額です（税込経理）。上の集計（サンプル／取込CSV）とは別の数字です。
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, styles.headRow]}>
            <AppText size="sm" weight="bold" style={styles.name}>勘定科目</AppText>
            <AppText size="sm" weight="bold" style={styles.category}>区分</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>借方</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>貸方</AppText>
            <AppText size="sm" weight="bold" style={styles.cell}>残高</AppText>
          </View>
          {yearData.accounts.map((account) => (
            <View key={account.name} style={styles.row}>
              <AppText size="sm" style={styles.name}>{account.name}</AppText>
              <AppText size="sm" style={styles.category}>{account.category}</AppText>
              <AppText size="sm" style={styles.cell}>{formatYen(account.debit)}</AppText>
              <AppText size="sm" style={styles.cell}>{formatYen(account.credit)}</AppText>
              <AppText size="sm" style={styles.cell}>{formatYen(account.balance)}</AppText>
            </View>
          ))}
        </View>
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    gap: space.sm,
  },
  headRow: { borderBottomColor: colors.borderStrong },
  name: { width: 150 },
  category: { width: 90 },
  cell: { width: 110, textAlign: "right" },
});
