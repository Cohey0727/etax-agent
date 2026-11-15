import { useEffect, useState } from "react";
import { Card, Col, Input, Row, Text } from "@components/atoms";
import { XtxTaxpayerInput } from "@types";
import { loadTaxpayer, saveTaxpayer } from "./taxpayerStorage";
import styles from "./TaxpayerProfilePanel.css";

/** テキスト入力の項目定義（ラベル列つきで並べる）。 */
const TEXT_FIELDS: readonly {
  key: keyof XtxTaxpayerInput;
  label: string;
  placeholder?: string;
}[] = [
  { key: "name", label: "氏名" },
  { key: "name_kana", label: "フリガナ" },
  { key: "zip_code", label: "郵便番号", placeholder: "7220062" },
  { key: "address", label: "住所" },
  { key: "address_line2", label: "住所（下段）", placeholder: "建物名・部屋番号など" },
  { key: "phone", label: "電話番号", placeholder: "080-2500-7879" },
  { key: "tax_office_name", label: "提出先の税務署名", placeholder: "尾道（「税務署」は付けない）" },
  { key: "tax_office_code", label: "税務署コード（任意）", placeholder: "5桁" },
  { key: "occupation", label: "職業" },
  { key: "shop_name", label: "屋号（任意）" },
  { key: "jan1_address", label: "1月1日の住所（任意）", placeholder: "現住所と違う場合のみ" },
  { key: "invoice_number", label: "インボイス登録番号", placeholder: "T9810103628696" },
  { key: "my_number", label: "個人番号（任意）", placeholder: "マイナンバー12桁" },
];

export interface TaxpayerProfilePanelProps {
  year: number;
}

/**
 * 納税者情報の編集パネル（確定申告画面の「納税者情報」タブ）。
 * 申告書の見出しに入る情報で、プロフィールは年度別にこの端末にのみ保存される
 * （個人番号は出力ファイルにだけ含まれる）。入力はその場で保存され、
 * 総合タブの提出パネルが同じ保存値を読み直して出力に使う。
 */
export const TaxpayerProfilePanel = ({ year }: TaxpayerProfilePanelProps) => {
  const [loaded, setLoaded] = useState(() => loadTaxpayer(year));
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => loaded.taxpayer);

  // 年度が切り替わったら、その年度のプロフィール（無ければ引き継ぎ）を読み直す。
  useEffect(() => {
    const next = loadTaxpayer(year);
    setLoaded(next);
    setTaxpayer(next.taxpayer);
  }, [year]);

  const update = (key: keyof XtxTaxpayerInput, value: string) => {
    const next = { ...taxpayer, [key]: value };
    setTaxpayer(next);
    saveTaxpayer(year, next);
  };

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">納税者情報</Text>
          <Text variant="muted">
            申告書の見出しに入る情報です。プロフィールは年度別に、この端末にのみ保存
            されます（個人番号は出力ファイルにだけ含まれます）。
          </Text>
          {loaded.carriedFrom !== null ? (
            <Text variant="muted">
              {loaded.carriedFrom}年分のプロフィールを引き継いでいます。変更すると
              {year}年分として保存されます。
            </Text>
          ) : loaded.carriedFromLegacy ? (
            <Text variant="muted">
              これまでのプロフィールを引き継いでいます。変更すると{year}年分として
              保存されます。
            </Text>
          ) : null}
        </Col>

        {TEXT_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            placeholder={field.placeholder}
            value={taxpayer[field.key]}
            onChange={(v) => update(field.key, v)}
          />
        ))}
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">生年月日</Text>
          </div>
          <Input
            className={styles.fieldInput}
            type="date"
            value={taxpayer.birth_date}
            onChange={(e) => update("birth_date", e.target.value)}
            aria-label="生年月日"
          />
        </Row>
      </Col>
    </Card>
  );
};

interface TextFieldProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
}

const TextField = ({ label, placeholder, value, onChange }: TextFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldInput}
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    />
  </Row>
);
