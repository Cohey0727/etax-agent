import { StyleSheet, View } from "react-native";
import { AppText, Card, DateField, Field, SkeletonBar } from "@/components";
import { XtxTaxpayerInput } from "@/api";
import { space } from "@/theme";
import { LoadFailedNotice } from "../fields";
import { taxpayerProfileStore } from "../taxpayerData";
import { useYearInput } from "../useYearInput";

/** テキスト入力の項目定義。 */
const textFields: readonly {
  key: keyof XtxTaxpayerInput;
  label: string;
  placeholder?: string;
}[] = [
  { key: "name", label: "氏名", placeholder: "山田太郎" },
  { key: "name_kana", label: "フリガナ", placeholder: "ヤマダタロウ" },
  { key: "zip_code", label: "郵便番号", placeholder: "1000001" },
  { key: "address", label: "住所", placeholder: "東京都千代田区千代田1-1" },
  { key: "address_line2", label: "住所（下段）", placeholder: "建物名・部屋番号など" },
  { key: "phone", label: "電話番号", placeholder: "090-1234-5678" },
  { key: "tax_office_name", label: "提出先の税務署名", placeholder: "麹町（「税務署」は付けない）" },
  { key: "tax_office_code", label: "税務署コード（任意）", placeholder: "5桁" },
  { key: "occupation", label: "職業", placeholder: "ソフトウェア開発" },
  { key: "shop_name", label: "屋号（任意）" },
  { key: "jan1_address", label: "1月1日の住所（任意）", placeholder: "現住所と違う場合のみ" },
  { key: "invoice_number", label: "インボイス登録番号", placeholder: "T1234567890123" },
  { key: "my_number", label: "個人番号（任意）", placeholder: "マイナンバー12桁" },
  { key: "user_id", label: "利用者識別番号", placeholder: "e-Taxの16桁" },
];

/** 異動・変更前の納税地（納税地の異動申出書の出力に使う）。 */
const previousFields: readonly {
  key: keyof XtxTaxpayerInput;
  label: string;
  placeholder?: string;
}[] = [
  { key: "previous_zip_code", label: "異動前の郵便番号", placeholder: "1000001" },
  { key: "previous_address", label: "異動前の住所", placeholder: "東京都千代田区千代田1-1" },
];

/** 読み込み中にフォームの代わりへ出すスケルトンの行数。 */
const skeletonRows: readonly number[] = [1, 2, 3, 4, 5, 6];

export interface TaxpayerProfilePanelProps {
  year: number;
}

/**
 * 納税者情報の編集パネル（独立画面「納税者情報」の本体）。
 * 申告書の見出しに入る情報で、プロフィールは年度別にサーバー（帳簿DB）へ
 * 保存される。入力は少し待ってから自動で保存され、総合タブの提出パネルや
 * 消費税タブが同じ保存値を読み直して出力に使う。
 */
export function TaxpayerProfilePanel({ year }: TaxpayerProfilePanelProps) {
  const { entry, update: updateProfile, reload } = useYearInput(taxpayerProfileStore, year);

  const update = (key: keyof XtxTaxpayerInput, value: string) =>
    updateProfile((current) => ({ ...current, taxpayer: { ...current.taxpayer, [key]: value } }));

  // 保存済みプロフィールの読み込みが終わるまでは、空のフォームではなくスケルトンを出す
  // （空欄を「未保存」と見せないため。読み込み前に入力すると上書きされる事故も防ぐ）。
  if (entry.status !== "ready") {
    return (
      <Card>
        <View style={styles.wrap}>
          <AppText size="lg" weight="bold">
            納税者情報
          </AppText>
          {entry.status === "failed" ? (
            <LoadFailedNotice message="納税者情報を取得できませんでした。" onRetry={reload} />
          ) : (
            skeletonRows.map((row) => (
              <View key={row} style={styles.skeletonRow}>
                <SkeletonBar width="30%" height={14} />
                <SkeletonBar height={36} />
              </View>
            ))
          )}
        </View>
      </Card>
    );
  }
  const { taxpayer, carriedFrom } = entry.value;

  return (
    <Card>
      <View style={styles.wrap}>
        <AppText size="lg" weight="bold">
          納税者情報
        </AppText>
        <AppText size="sm" tone="muted">
          申告書の見出しに入る情報です。プロフィールは年度別にサーバー（この
          アプリのDB）へ保存されます。
        </AppText>
        {carriedFrom != null ? (
          <AppText size="sm" tone="muted">
            {carriedFrom}年分のプロフィールを引き継いでいます。変更すると
            {year}年分として保存されます。
          </AppText>
        ) : null}

        {textFields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={taxpayer[field.key]}
            onChangeText={(v) => update(field.key, v)}
          />
        ))}
        <DateField
          label="生年月日"
          clearable
          value={taxpayer.birth_date}
          onChange={(v) => update("birth_date", v)}
        />

        <AppText size="sm" tone="muted">
          異動・変更前の納税地は、納税地の異動申出書（印刷用PDF）の出力に使います。
          転居前の住所を入れておくと、提出パネルから記入済みの申出書を出力できます。
        </AppText>
        {previousFields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={taxpayer[field.key]}
            onChangeText={(v) => update(field.key, v)}
          />
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  skeletonRow: { gap: 6 },
});
