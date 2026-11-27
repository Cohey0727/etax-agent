import { IncomeType, Transaction } from "@etax/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppButton, AppText, Card, Chip } from "@/components";
import { colors, space } from "@/theme";
import { formatYen } from "@/utils";
import { SectionHead } from "../fields";

/** 1ページの件数。帳簿と同じく100件（全件描画すると画面が重くなるため）。 */
const PAGE_SIZE = 100;

const incomeTypeLabels: Record<IncomeType, string> = {
  business: "事業",
  real_estate: "不動産",
  other: "その他",
};

export interface BalanceRecordsProps {
  /** その年の収支の対象になっている取引（割り当て年度で絞り込み済み）。 */
  transactions: Transaction[];
}

/**
 * 収支タブの「対象の取引」。集計の元になっている帳簿の取引そのものを
 * 日付順に並べる。数字だけでは裏付けにならないため、収支の末尾に置く。
 * 編集は帳簿側で行う前提の読み取り専用一覧。
 */
export function BalanceRecords({ transactions }: BalanceRecordsProps) {
  const [page, setPage] = useState(1);
  const sorted = useMemo(
    () => [...transactions].sort((a, b) => a.date.localeCompare(b.date)),
    [transactions],
  );
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const displayed = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  if (sorted.length === 0) return null;

  return (
    <Card>
      <SectionHead title={`対象の取引（${sorted.length}件）`} />
      <View>
        {displayed.map((t, index) => (
          <View key={`${t.date}-${t.description}-${t.amount}-${index}`} style={styles.record}>
            <View style={styles.recordMain}>
              <AppText size="sm" weight="medium">
                {t.description}
              </AppText>
              <AppText size="xs" tone="muted">
                {t.date} ・ {t.category} ・ {t.tax_category || "税区分 ―"}
              </AppText>
            </View>
            <View style={styles.recordSide}>
              <Chip label={incomeTypeLabels[t.income_type]} tone="muted" />
              <AppText
                size="sm"
                weight="semibold"
                style={t.amount < 0 ? { color: colors.negative } : undefined}
              >
                {formatYen(t.amount)}
              </AppText>
            </View>
          </View>
        ))}
      </View>
      {totalPages > 1 ? (
        <View style={styles.pager}>
          <AppText size="sm" tone="muted">
            全{sorted.length}件中 {(currentPage - 1) * PAGE_SIZE + 1}–
            {(currentPage - 1) * PAGE_SIZE + displayed.length}件目（{currentPage} / {totalPages}
            ページ）
          </AppText>
          <View style={styles.pagerButtons}>
            <AppButton
              label="前へ"
              variant="ghost"
              size="sm"
              disabled={currentPage <= 1}
              onPress={() => setPage(currentPage - 1)}
            />
            <AppButton
              label="次へ"
              variant="ghost"
              size="sm"
              disabled={currentPage >= totalPages}
              onPress={() => setPage(currentPage + 1)}
            />
          </View>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  record: {
    flexDirection: "row",
    gap: space.sm,
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
  },
  recordMain: { flex: 1, gap: 2 },
  recordSide: { alignItems: "flex-end", gap: 4 },
  pager: { gap: space.sm, marginTop: space.sm },
  pagerButtons: { flexDirection: "row", gap: space.sm, justifyContent: "center" },
});
