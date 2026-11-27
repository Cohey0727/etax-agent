import { Button, Col, Row, Text } from "@components/atoms";
import { XtxTaxpayerInput } from "@types";
import styles from "./TaxpayerProfileSummary.css";

export interface TaxpayerProfileSummaryProps {
  taxpayer: XtxTaxpayerInput;
  /** 納税者情報の画面を開く（編集はそちらで行う）。 */
  onOpenProfile: () => void;
}

/** 提出パネルに出す納税者情報の要約（申告書の見出しに入る項目）。 */
export const TaxpayerProfileSummary = ({ taxpayer, onOpenProfile }: TaxpayerProfileSummaryProps) => (
  <Col gap="md">
    <Text className={styles.subhead}>納税者情報</Text>
    {summaryRows(taxpayer).map((row) => (
      <Row key={row.label} gap="sm">
        <Row align="center" className={styles.label}>
          <Text variant="muted">{row.label}</Text>
        </Row>
        {row.value ? <Text>{row.value}</Text> : <Text variant="muted">未入力</Text>}
      </Row>
    ))}
    <Row gap="sm">
      <Button variant="ghost" size="sm" onClick={onOpenProfile}>
        納税者情報タブを開く
      </Button>
    </Row>
  </Col>
);

/** 要約の行。未入力の項目は空文字（表示で「未入力」にする）。 */
function summaryRows(taxpayer: XtxTaxpayerInput): readonly { label: string; value: string }[] {
  const name = taxpayer.name && taxpayer.name_kana ? `${taxpayer.name}（${taxpayer.name_kana}）` : taxpayer.name;
  const address = [taxpayer.zip_code ? `〒${taxpayer.zip_code}` : "", taxpayer.address, taxpayer.address_line2]
    .filter((part) => part.length > 0)
    .join(" ");
  return [
    { label: "氏名", value: name },
    { label: "住所", value: address },
    { label: "電話番号", value: taxpayer.phone },
    {
      label: "提出先の税務署",
      value: taxpayer.tax_office_name ? `${taxpayer.tax_office_name}税務署` : "",
    },
    { label: "インボイス登録番号", value: taxpayer.invoice_number },
  ];
}
