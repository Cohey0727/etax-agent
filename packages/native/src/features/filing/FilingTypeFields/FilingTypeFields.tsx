import { FilingType } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, SelectField } from "@/components";
import { space } from "@/theme";

export interface FilingTypeFieldsProps {
  filingType: FilingType;
  /** 不動産貸付けが事業的規模か（青色65万円・55万円のときだけ意味を持つ） */
  realEstateBusinessScale: boolean;
  onChange: (filingType: FilingType, realEstateBusinessScale: boolean) => void;
}

const FILING_TYPE_LABELS: Record<FilingType, string> = {
  blue65: "青色申告（65万円控除）",
  blue55: "青色申告（55万円控除）",
  blue10: "青色申告（10万円控除）",
  white: "白色申告（控除なし）",
};

const FILING_TYPE_OPTIONS: readonly { value: FilingType; label: string }[] = (
  Object.keys(FILING_TYPE_LABELS) as FilingType[]
).map((type) => ({ value: type, label: FILING_TYPE_LABELS[type] }));

const SCALE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "non-scale", label: "事業的規模でない（不動産分は10万円まで）" },
  { value: "scale", label: "事業的規模（不動産も事業と同じ上限）" },
];

const FILING_TYPE_NOTES: Partial<Record<FilingType, string>> = {
  blue10: "事業・不動産を合わせた所得の範囲内で、10万円まで控除します。",
  white: "白色申告では青色申告特別控除はありません。",
};

/**
 * 申告の種類（青色申告特別控除の区分）と不動産貸付けの規模の選択。
 * 納税者情報画面で管理する（保存先は確定申告・ダッシュボードと共有）。
 */
export function FilingTypeFields({
  filingType,
  realEstateBusinessScale,
  onChange,
}: FilingTypeFieldsProps) {
  const showScale = filingType === "blue65" || filingType === "blue55";
  const note = FILING_TYPE_NOTES[filingType];
  return (
    <View style={styles.wrap}>
      <SelectField
        label="申告の種類"
        value={filingType}
        options={FILING_TYPE_OPTIONS}
        onChange={(v) => onChange(v, realEstateBusinessScale)}
      />
      {showScale ? (
        <SelectField
          label="不動産貸付けの規模"
          value={realEstateBusinessScale ? "scale" : "non-scale"}
          options={SCALE_OPTIONS}
          onChange={(v) => onChange(filingType, v === "scale")}
        />
      ) : null}
      {note ? (
        <AppText size="sm" tone="muted">
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
});
