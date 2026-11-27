import { StyleSheet, View } from "react-native";
import { AppText, Field, SelectField } from "@/components";
import { SalarySituationRow } from "@/api";
import { space } from "@/theme";
import { parseOptionalNumber } from "@/utils";

/**
 * businessStartFields.tsx — 開業届・青色申告承認申請書パネルの入力部品。
 * ラベル付きの有無の選択欄と、期限表示の行、提出のしかたの案内。
 */

/** YYYY-MM-DD を「YYYY年M月D日」へ整形する。 */
export function formatJapaneseDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

export interface DeadlineRowProps {
  name: string;
  deadline: { date: string; rule: string };
}

/** 届出1件分の期限表示行。 */
export function DeadlineRow({ name, deadline }: DeadlineRowProps) {
  return (
    <View style={styles.deadline}>
      <AppText size="sm" tone="muted">
        {name}
      </AppText>
      <AppText size="md">
        {formatJapaneseDate(deadline.date)}まで（{deadline.rule}）
      </AppText>
    </View>
  );
}

export interface NullableBoolFieldProps {
  label: string;
  value: boolean | null;
  onChange: (value: boolean | null) => void;
}

const nullableBoolOptions: readonly { value: "" | "yes" | "no"; label: string }[] = [
  { value: "", label: "未選択" },
  { value: "yes", label: "有" },
  { value: "no", label: "無" },
];

/** 有・無・未選択の3値選択（様式の「有無」欄用）。 */
export function NullableBoolField({ label, value, onChange }: NullableBoolFieldProps) {
  return (
    <SelectField
      label={label}
      value={value === null ? "" : value ? "yes" : "no"}
      options={nullableBoolOptions}
      onChange={(v) => onChange(v === "" ? null : v === "yes")}
    />
  );
}

export interface SalaryRowFieldsProps {
  label: string;
  row: SalarySituationRow;
  onChange: (row: SalarySituationRow) => void;
}

const hasTaxOptions: readonly { value: "" | "yes" | "no"; label: string }[] = [
  { value: "", label: "税額の有無" },
  { value: "yes", label: "有" },
  { value: "no", label: "無" },
];

/** 給与等の支払の状況の1行（人数・給与の定め方・税額の有無）。 */
export function SalaryRowFields({ label, row, onChange }: SalaryRowFieldsProps) {
  return (
    <View style={styles.salaryRow}>
      <AppText size="md" weight="bold">
        給与等の支払（{label}）
      </AppText>
      <Field
        label="従事員数"
        value={row.count === null ? "" : String(row.count)}
        onChangeText={(text) => onChange({ ...row, count: parseOptionalNumber(text) })}
        placeholder="人数"
        keyboardType="number-pad"
        inputMode="numeric"
      />
      <Field
        label="給与の定め方"
        value={row.terms}
        onChangeText={(terms) => onChange({ ...row, terms })}
        placeholder="給与の定め方（月給など）"
      />
      <SelectField
        label="税額の有無"
        value={row.has_tax === null ? "" : row.has_tax ? "yes" : "no"}
        options={hasTaxOptions}
        onChange={(v) => onChange({ ...row, has_tax: v === "" ? null : v === "yes" })}
      />
    </View>
  );
}

/** 提出のしかた（e-Tax 等での提出導線と、受信通知の保管の案内）。 */
export function SubmissionGuide() {
  return (
    <View style={styles.guide}>
      <AppText size="lg" weight="bold">
        提出のしかた
      </AppText>
      <AppText size="sm" tone="muted">
        提出は e-Tax ソフト（WEB版）またはマイナポータルのワンストップサービスで、
        この PDF と同じ内容を入力して送信します（この PDF は紙で提出する場合と、
        送信前の記入内容の確認用です）。紙の場合は、住所地を所轄する税務署へ
        持参または郵送してください。
      </AppText>
      <AppText size="sm" tone="muted">
        2025年1月から、税務署が控えに収受日付印を押す取扱いは廃止されています。
        提出の証跡は e-Tax の受信通知（PDF）です。受信通知は印刷した届出書と
        一緒に必ず保管してください。
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  deadline: { gap: 2 },
  salaryRow: { gap: space.sm },
  guide: { gap: space.sm },
});
