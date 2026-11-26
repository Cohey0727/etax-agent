import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { FixedAssetInput } from "@/api";
import { AppButton, DateField, Field, MoneyField, SelectField, SwitchRow } from "@/components";
import { space } from "@/theme";
import { parseAmount, parseOptionalNumber } from "@/utils";
import { INCOME_TYPE_OPTIONS, METHOD_OPTIONS, USEFUL_LIFE_PRESETS } from "../assetOptions";

export interface FixedAssetFormProps {
  submitLabel: string;
  value: FixedAssetInput;
  busy: boolean;
  onChange: (input: FixedAssetInput) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/** 固定資産の登録・編集フォーム（制御コンポーネント。状態は親が持つ）。 */
export function FixedAssetForm({
  submitLabel,
  value,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: FixedAssetFormProps) {
  const patch = (next: Partial<FixedAssetInput>) => onChange({ ...value, ...next });
  const dateOrNull = (raw: string): string | null => (raw ? raw : null);

  // 耐用年数は既定では候補セレクト。「選択肢にない」をオンにすると数値入力に切り替わる。
  // 初期値が候補にない年数（編集時）なら、最初から数値入力で開く。
  const [lifeCustom, setLifeCustom] = useState(
    () => !USEFUL_LIFE_PRESETS.includes(value.useful_life_years),
  );
  const [lastPreset, setLastPreset] = useState(() =>
    USEFUL_LIFE_PRESETS.includes(value.useful_life_years) ? value.useful_life_years : 5,
  );
  const toggleLifeCustom = (checked: boolean) => {
    setLifeCustom(checked);
    if (!checked && !USEFUL_LIFE_PRESETS.includes(value.useful_life_years)) {
      patch({ useful_life_years: lastPreset });
    }
  };

  return (
    <View style={styles.form}>
      <Field
        label="名称"
        onChangeText={(text) => patch({ name: text })}
        placeholder="例: ノートパソコン 14インチ"
        value={value.name}
      />
      <Field
        label="数量"
        onChangeText={(text) => patch({ quantity: text })}
        placeholder="例: 1台"
        value={value.quantity}
      />
      <SelectField
        label="所得区分"
        onChange={(next) => patch({ income_type: next })}
        options={INCOME_TYPE_OPTIONS}
        value={value.income_type}
      />
      <DateField
        label="取得日"
        onChange={(date) => patch({ acquisition_date: date })}
        value={value.acquisition_date}
      />
      <DateField
        label="事業供用日（空欄なら取得日）"
        clearable
        onChange={(date) => patch({ service_start_date: dateOrNull(date) })}
        value={value.service_start_date ?? ""}
      />
      <MoneyField
        label="取得価額（円）"
        onChangeValue={(text) => patch({ cost: parseAmount(text) })}
        placeholder="例: 446400"
        value={value.cost === 0 ? "" : String(value.cost)}
      />
      {lifeCustom ? (
        <Field
          label="耐用年数（年）"
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={(text) => patch({ useful_life_years: parseOptionalNumber(text) ?? 0 })}
          value={String(value.useful_life_years)}
        />
      ) : (
        <SelectField
          label="耐用年数（年）"
          onChange={(next) => {
            const years = Number(next);
            setLastPreset(years);
            patch({ useful_life_years: years });
          }}
          options={USEFUL_LIFE_PRESETS.map((years) => ({
            value: String(years),
            label: `${years}年`,
          }))}
          value={String(
            USEFUL_LIFE_PRESETS.includes(value.useful_life_years)
              ? value.useful_life_years
              : lastPreset,
          )}
        />
      )}
      <SwitchRow
        label="耐用年数は選択肢にない"
        onChange={toggleLifeCustom}
        value={lifeCustom}
      />
      <SelectField
        label="償却方法"
        onChange={(next) => patch({ method: next })}
        options={METHOD_OPTIONS}
        value={value.method}
      />
      <Field
        label="事業専用割合（%）"
        inputMode="numeric"
        keyboardType="number-pad"
        onChangeText={(text) =>
          patch({ business_ratio_percent: parseOptionalNumber(text) ?? 0 })
        }
        value={String(value.business_ratio_percent)}
      />
      <DateField
        label="除却日（除却した場合のみ）"
        clearable
        onChange={(date) => patch({ disposed_date: dateOrNull(date) })}
        value={value.disposed_date ?? ""}
      />
      <View style={styles.actions}>
        <AppButton label="キャンセル" variant="ghost" disabled={busy} onPress={onCancel} />
        <AppButton label={submitLabel} disabled={busy} loading={busy} onPress={onSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space.md },
  actions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
});
