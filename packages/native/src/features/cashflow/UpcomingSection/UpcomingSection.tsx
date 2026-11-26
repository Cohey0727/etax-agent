import { StyleSheet, View } from "react-native";
import { CashFlowReceipt, CashFlowScheduledReceipt } from "@/api";
import { AlertBox, AppText, Card, Chip } from "@/components";
import { colors, space } from "@/theme";
import { formatDate, formatYen } from "@/utils";
import { monthLabel } from "../format";

export interface UpcomingSectionProps {
  upcoming: CashFlowScheduledReceipt[];
  undated: CashFlowReceipt[];
  overdueAmount: number;
}

/**
 * 入金予定の内訳。期日つきは予定月ごとに積み上げの元になった請求書を
 * 並べ、期日超過にはその旨を示す。期日未設定は別枠で明示する。
 */
export function UpcomingSection({ upcoming, undated, overdueAmount }: UpcomingSectionProps) {
  if (upcoming.length === 0 && undated.length === 0) {
    return (
      <Card>
        <AppText size="sm" weight="semibold" tone="subtle">
          入金予定
        </AppText>
        <AppText size="sm" tone="muted">
          未入金の請求書はありません。請求書を発行すると、ここに入金予定が並びます。
        </AppText>
      </Card>
    );
  }
  return (
    <Card>
      <AppText size="sm" weight="semibold" tone="subtle">
        入金予定（未入金の請求書）
      </AppText>
      {overdueAmount > 0 ? (
        <AlertBox
          tone="warn"
          message={`期日を過ぎた未入金が ${formatYen(overdueAmount)} あります。当月に入金される予定として試算に含めています。`}
        />
      ) : null}
      {upcoming.map((receipt) => (
        <ReceiptRow
          key={receipt.document_id}
          title={`${monthLabel(receipt.scheduled_month)} ・ ${receipt.counterparty_name}`}
          receipt={receipt}
          statusLabel={receipt.overdue ? "期日超過" : receipt.status === "partial" ? "一部入金" : "未入金"}
          overdue={receipt.overdue}
        />
      ))}
      {undated.length > 0 ? (
        <>
          <AppText size="sm" weight="semibold" tone="subtle">
            期日未設定（月次には未計上）
          </AppText>
          {undated.map((receipt) => (
            <ReceiptRow
              key={receipt.document_id}
              title={receipt.counterparty_name}
              receipt={receipt}
              statusLabel={receipt.status === "partial" ? "一部入金" : "未入金"}
              overdue={false}
            />
          ))}
          <AppText size="xs" tone="muted">
            支払期日が未設定の請求書は、入金月が決められないため月次表には含めていません。
          </AppText>
        </>
      ) : null}
    </Card>
  );
}

interface ReceiptRowProps {
  title: string;
  receipt: CashFlowReceipt;
  statusLabel: string;
  overdue: boolean;
}

function ReceiptRow({ title, receipt, statusLabel, overdue }: ReceiptRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <AppText size="sm" weight="semibold" style={styles.title}>
            {title}
          </AppText>
          <Chip label={statusLabel} tone={overdue ? "negative" : "muted"} />
        </View>
        <AppText size="xs" tone="muted">
          帳票番号 {receipt.document_number ?? "―"} ／ 支払期日 {receipt.due_date ? formatDate(receipt.due_date) : "未設定"}
        </AppText>
      </View>
      <AppText size="sm" weight="semibold">
        {formatYen(receipt.remaining_amount)}
      </AppText>
    </View>
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
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  title: { flexShrink: 1 },
});
