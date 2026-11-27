import { yearMonthLabel } from "@etax/shared";
import { ScrollView, StyleSheet, View } from "react-native";
import { CashFlowMonth } from "@/api";
import { AppText, Card, Chip, ChipTone } from "@/components";
import { colors, space } from "@/theme";
import { formatYen } from "@/utils";

export interface MonthlyTableProps {
  months: CashFlowMonth[];
  openingBalance: number;
}

const PHASE_LABELS: Record<CashFlowMonth["phase"], string> = {
  past: "実績",
  current: "当月",
  future: "予定",
};

const PHASE_TONES: Record<CashFlowMonth["phase"], ChipTone> = {
  past: "muted",
  current: "accent",
  future: "warn",
};

const HEADERS: readonly string[] = ["入金（実績）", "出金（実績）", "入金予定", "増減", "月末残高"];

/**
 * 資金繰りの月次表。過去月は実績のみ、当月以降は実績に入金予定を
 * 積み上げ、月末残高の推移を示す。
 */
export function MonthlyTable({ months, openingBalance }: MonthlyTableProps) {
  const totals = {
    actualInflow: months.reduce((sum, m) => sum + m.actual_inflow, 0),
    actualOutflow: months.reduce((sum, m) => sum + m.actual_outflow, 0),
    scheduledInflow: months.reduce((sum, m) => sum + m.scheduled_inflow, 0),
  };
  const last = months[months.length - 1];
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        月次資金繰り表
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.row, styles.headRow]}>
            <AppText size="sm" weight="bold" style={styles.month}>月</AppText>
            {HEADERS.map((header) => (
              <AppText key={header} size="sm" weight="bold" style={styles.cell}>
                {header}
              </AppText>
            ))}
          </View>
          <View style={styles.row}>
            <AppText size="sm" style={styles.month}>期首残高</AppText>
            {HEADERS.slice(0, 4).map((header) => (
              <AppText key={header} size="sm" style={styles.cell}>―</AppText>
            ))}
            <AppText size="sm" style={styles.cell}>{formatYen(openingBalance)}</AppText>
          </View>
          {months.map((row) => {
            const values = [row.actual_inflow, row.actual_outflow, row.scheduled_inflow, row.net_change, row.closing_balance];
            return (
              <View key={row.month} style={styles.row}>
                <View style={styles.monthCell}>
                  <AppText size="sm">{yearMonthLabel(row.month)}</AppText>
                  <Chip label={PHASE_LABELS[row.phase]} tone={PHASE_TONES[row.phase]} />
                </View>
                {values.map((value, index) => (
                  <AppText
                    key={HEADERS[index]}
                    size="sm"
                    tone={(index === 3 || index === 4) && value < 0 ? "negative" : "text"}
                    style={styles.cell}
                  >
                    {formatYen(value)}
                  </AppText>
                ))}
              </View>
            );
          })}
          <View style={[styles.row, styles.totalRow]}>
            <AppText size="sm" weight="bold" style={styles.month}>合計</AppText>
            {[totals.actualInflow, totals.actualOutflow, totals.scheduledInflow, null, last ? last.closing_balance : null].map(
              (value, index) => (
                <AppText key={HEADERS[index]} size="sm" weight="bold" style={styles.cell}>
                  {value === null ? "―" : formatYen(value)}
                </AppText>
              ),
            )}
          </View>
        </View>
      </ScrollView>
      <AppText size="xs" tone="muted">
        入金予定は、未入金の請求書が支払期日どおりに入金される前提の試算です。期日を過ぎた
        未入金分は当月に入金される予定として数えています。
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  headRow: { borderBottomColor: colors.borderStrong },
  totalRow: { borderBottomWidth: 0, borderTopWidth: 1, borderTopColor: colors.borderStrong },
  month: { width: 132 },
  monthCell: { width: 132, flexDirection: "row", alignItems: "center", gap: space.xs },
  cell: { width: 104, textAlign: "right" },
});
