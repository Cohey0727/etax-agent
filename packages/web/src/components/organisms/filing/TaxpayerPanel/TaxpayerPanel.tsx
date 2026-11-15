import { DeductionInputs, TaxCreditInputs, Transaction, xtxSupportedYears } from "@etax/shared";
import { useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { ExportXtxRequest, XtxTaxpayerInput } from "@types";
import { exportReturnPdfFile, exportXtxFile } from "@utils/api";
import { loadTaxpayer, saveTaxpayer } from "./taxpayerStorage";
import styles from "./TaxpayerPanel.css";

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

export interface TaxpayerPanelProps {
  year: number;
  /** 対象年分の取引（帳簿）。XTXはこの取引データから生成される。 */
  transactions: Transaction[];
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
  /**
   * 申告済みの所得税額（過去に確定した分）。入っていれば、その確定分と
   * 比較する修正申告として出力する。null なら確定申告として出力する。
   */
  originalIncomeTax: number | null;
}

export const TaxpayerPanel = ({
  year,
  transactions,
  deductions,
  taxCredits,
  originalIncomeTax,
}: TaxpayerPanelProps) => {
  const [loaded, setLoaded] = useState(() => loadTaxpayer(year));
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => loaded.taxpayer);
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const [withholdingTax, setWithholdingTax] = useState(0);
  const [prepaidTax, setPrepaidTax] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = xtxSupportedYears().includes(year);

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

  // 申告の種類はモードとして選ぶものではなく、入力内容から決まる。
  // 申告済みの所得税額が入っていれば過去の確定分と比較する修正申告になる。
  const amendment = originalIncomeTax !== null;

  const buildRequest = (): ExportXtxRequest => ({
    year,
    amendment,
    submission_date: submissionDate,
    taxpayer,
    transactions,
    deductions,
    tax_credits: taxCredits,
    withholding_tax: withholdingTax,
    prepaid_tax: prepaidTax,
    original_third_period_tax: amendment ? originalIncomeTax : null,
  });

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await exportXtxFile(buildRequest());
      downloadTextFile(result.filename, result.xtx);
      setMessage(
        `${result.filename} をダウンロードしました。e-Taxソフト／WEB版に組み込んで内容を確認し、送信はご自身のマイナンバーカードで行ってください。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "XTXの出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    setMessage(null);
    setError(null);
    try {
      const result = await exportReturnPdfFile(buildRequest());
      downloadPdfFile(result.filename, result.pdf_base64);
      setMessage(
        `${result.filename} をダウンロードしました。公式様式に数字を重ねた確認用のイメージです（提出はXTXで行ってください）。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "紙イメージ PDF の出力に失敗しました");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">納税者情報と e-Tax 出力</Text>
          <Text variant="muted">
            申告書の見出しに入る情報です。プロフィールは年度別に、この端末にのみ保存
            されます（個人番号は出力ファイルにだけ含まれます）。XTXは取引データ
            （帳簿）と控除の入力から生成されます。
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

        <Text className={styles.subhead}>出力の条件</Text>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">申告の種類</Text>
          </div>
          <Text>{amendment ? "修正申告" : "確定申告"}</Text>
        </Row>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">提出日</Text>
          </div>
          <Input
            className={styles.fieldInput}
            type="date"
            value={submissionDate}
            onChange={(e) => setSubmissionDate(e.target.value)}
            aria-label="提出日"
          />
        </Row>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">源泉徴収税額</Text>
          </div>
          <Input
            className={styles.fieldNumber}
            type="number"
            value={withholdingTax}
            onChange={(e) => setWithholdingTax(toAmount(e.target.value))}
            aria-label="源泉徴収税額"
          />
        </Row>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">予定納税額</Text>
          </div>
          <Input
            className={styles.fieldNumber}
            type="number"
            value={prepaidTax}
            onChange={(e) => setPrepaidTax(toAmount(e.target.value))}
            aria-label="予定納税額"
          />
        </Row>

        <Text variant="muted">
          申告の種類は入力内容から決まります。申告済みの所得税額が入っている場合は
          その確定分と比較する修正申告として、入っていない場合は確定申告として
          出力します。
        </Text>

        {error ? <AlertBox variant="error">{error}</AlertBox> : null}
        {message ? <AlertBox>{message}</AlertBox> : null}

        <Row gap="sm">
          <Button variant="primary" onClick={handleExport} disabled={!supported || exporting}>
            {exporting ? "出力中…" : "e-Tax用データを出力（XTX）"}
          </Button>
          <Button onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? "出力中…" : "申告書の紙イメージ（PDF）"}
          </Button>
          {!supported ? (
            <Text variant="muted">
              {year}年分はXTX出力に未対応です（対応: {xtxSupportedYears().join("・")}年分）
            </Text>
          ) : null}
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

function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function downloadTextFile(filename: string, content: string): void {
  const blob = new Blob([content], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadPdfFile(filename: string, base64: string): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
