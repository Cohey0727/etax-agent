import { BLUE_BOOK_OPTIONS } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, DateField, Field, SelectField, SwitchRow } from "@/components";
import { BusinessStartInputs } from "@/api";
import { space } from "@/theme";
import { NullableBoolField, SalaryRowFields } from "./businessStartFields";

/**
 * BusinessStartSections.tsx — 開業届の項目と青色申告承認申請書の項目の
 * 入力セクション。状態の保持と保存は BusinessStartPanel が担い、
 * ここは patch を渡すだけの表示・入力部品。
 */

type SalaryRowKey = "salary_family" | "salary_employee" | "salary_other";

const SALARY_ROWS: readonly { key: SalaryRowKey; label: string }[] = [
  { key: "salary_family", label: "専従者" },
  { key: "salary_employee", label: "使用人" },
  { key: "salary_other", label: "その他" },
];

const BOOKKEEPING_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "", label: "未選択" },
  { value: "double", label: "複式簿記" },
  { value: "simple", label: "簡易簿記" },
  { value: "other", label: "その他" },
];

export interface BusinessStartSectionsProps {
  inputs: BusinessStartInputs;
  update: (patch: Partial<BusinessStartInputs>) => void;
}

/** 開業届（個人事業の開業・廃業等届出書）の項目。 */
export function OpeningNoticeFields({ inputs, update }: BusinessStartSectionsProps) {
  return (
    <>
      <AppText size="lg" weight="bold">
        開業届の項目
      </AppText>
      <SwitchRow
        label="「青色申告承認申請書」をあわせて提出する"
        value={inputs.submits_blue_application}
        onChange={(checked) => update({ submits_blue_application: checked })}
      />
      <SwitchRow
        label="消費税の「課税事業者選択届出書」をあわせて提出する"
        value={inputs.submits_consumption_election}
        onChange={(checked) => update({ submits_consumption_election: checked })}
      />
      <Field
        label="納税地以外の郵便番号"
        placeholder="1000001"
        value={inputs.other_zip_code}
        onChangeText={(v) => update({ other_zip_code: v })}
      />
      <Field
        label="納税地以外の住所地・事業所等"
        placeholder="東京都千代田区千代田1-1"
        value={inputs.other_address}
        onChangeText={(v) => update({ other_address: v })}
      />
      <Field
        label="納税地以外の電話番号"
        placeholder="03-1234-5678"
        value={inputs.other_phone}
        onChangeText={(v) => update({ other_phone: v })}
      />
      {SALARY_ROWS.map((row) => (
        <SalaryRowFields
          key={row.key}
          label={
            row.key === "salary_other" && inputs.salary_other_label
              ? inputs.salary_other_label
              : row.label
          }
          row={inputs[row.key]}
          onChange={(next) => update({ [row.key]: next } as Partial<BusinessStartInputs>)}
        />
      ))}
      <Field
        label="給与の状況・3行目の区分名"
        placeholder="その他行の区分名（任意）"
        value={inputs.salary_other_label}
        onChangeText={(v) => update({ salary_other_label: v })}
      />
      <NullableBoolField
        label="源泉所得税の納期の特例の申請書を提出する"
        value={inputs.withholding_special}
        onChange={(v) => update({ withholding_special: v })}
      />
      <DateField
        label="給与支払を開始する年月日"
        clearable
        value={inputs.salary_start_date}
        onChange={(v) => update({ salary_start_date: v })}
      />
      <Field
        label="その他参考事項（開業届）"
        value={inputs.other_notes}
        onChangeText={(v) => update({ other_notes: v })}
      />
    </>
  );
}

/** 所得税の青色申告承認申請書の項目。 */
export function BlueReturnFields({ inputs, update }: BusinessStartSectionsProps) {
  const toggleBook = (key: string, checked: boolean) => {
    const next = checked ? [...inputs.books, key] : inputs.books.filter((book) => book !== key);
    update({ books: next });
  };
  const updateOffice = (index: number, patch: Partial<{ name: string; location: string }>) => {
    const offices = inputs.offices.map((office, i) =>
      i === index ? { ...office, ...patch } : office,
    );
    update({ offices });
  };

  return (
    <>
      <AppText size="lg" weight="bold">
        青色申告承認申請書の項目
      </AppText>
      <Field
        label="青色申告を開始する年分"
        value={inputs.blue_start_year === 0 ? "" : String(inputs.blue_start_year)}
        placeholder="空欄なら開業年"
        onChangeText={(v) => update({ blue_start_year: v === "" ? 0 : Number(v) || 0 })}
        keyboardType="number-pad"
        inputMode="numeric"
      />
      {inputs.offices.map((office, index) => (
        <View key={index} style={styles.office}>
          <Field
            label={`事業所${index + 1}の名称`}
            placeholder="ヤマダシステム"
            value={office.name}
            onChangeText={(v) => updateOffice(index, { name: v })}
          />
          <Field
            label={`事業所${index + 1}の所在地`}
            placeholder="東京都千代田区千代田1-1"
            value={office.location}
            onChangeText={(v) => updateOffice(index, { location: v })}
          />
        </View>
      ))}
      <NullableBoolField
        label="青色申告承認の取消し・取りやめを受けたことがある"
        value={inputs.blue_cancellation_has}
        onChange={(v) => update({ blue_cancellation_has: v })}
      />
      <DateField
        label="取消し・取りやめの日"
        clearable
        value={inputs.blue_cancellation_date}
        onChange={(v) => update({ blue_cancellation_date: v })}
      />
      <NullableBoolField
        label="相続による事業承継がある"
        value={inputs.inheritance_has}
        onChange={(v) => update({ inheritance_has: v })}
      />
      <DateField
        label="相続開始年月日"
        clearable
        value={inputs.inheritance_date}
        onChange={(v) => update({ inheritance_date: v })}
      />
      <Field
        label="被相続人の氏名"
        value={inputs.predecessor_name}
        onChangeText={(v) => update({ predecessor_name: v })}
      />
      <SelectField
        label="簿記方式"
        value={inputs.bookkeeping ?? ""}
        options={BOOKKEEPING_OPTIONS}
        onChange={(v) =>
          update({ bookkeeping: v === "" ? null : (v as BusinessStartInputs["bookkeeping"]) })
        }
      />
      {inputs.bookkeeping === "other" ? (
        <Field
          label="簿記方式（その他）"
          value={inputs.bookkeeping_other}
          onChangeText={(v) => update({ bookkeeping_other: v })}
        />
      ) : null}
      <AppText size="sm" weight="semibold" tone="subtle">
        備付帳簿名
      </AppText>
      {BLUE_BOOK_OPTIONS.map((option) => (
        <SwitchRow
          key={option.key}
          label={option.label}
          value={inputs.books.includes(option.key)}
          onChange={(checked) => toggleBook(option.key, checked)}
        />
      ))}
      <Field
        label="その他参考事項（青色）"
        value={inputs.blue_other_notes}
        onChangeText={(v) => update({ blue_other_notes: v })}
      />
    </>
  );
}

const styles = StyleSheet.create({
  office: { gap: space.sm },
});
