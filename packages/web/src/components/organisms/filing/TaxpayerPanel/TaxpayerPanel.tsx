import { DeductionInputs, TaxCreditInputs, Transaction, xtxSupportedYears } from "@etax/shared";
import { useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { ExportXtxRequest, XtxTaxpayerInput } from "@types";
import { exportReturnPdfFile, exportXtxFile } from "@utils/api";
import { FilingSection } from "../FilingPanel";
import { loadTaxpayer } from "../TaxpayerProfilePanel";
import styles from "./TaxpayerPanel.css";

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
  /** 納税者情報タブへの遷移（確定申告画面の総合でのみ渡される）。 */
  onOpenSection?: (section: FilingSection) => void;
}

/**
 * 提出パネル（確定申告画面の総合タブ）。納税者情報は要約だけを表示し、
 * 編集は納税者情報タブで行う。ここでは出力の条件とXTX／紙イメージの出力、
 * そして e-Tax サイトへのリンク（提出の動線）を担う。
 */
export const TaxpayerPanel = ({
  year,
  transactions,
  deductions,
  taxCredits,
  originalIncomeTax,
  onOpenSection,
}: TaxpayerPanelProps) => {
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => loadTaxpayer(year).taxpayer);
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const [withholdingTax, setWithholdingTax] = useState(0);
  const [prepaidTax, setPrepaidTax] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const supported = xtxSupportedYears().includes(year);

  // 年度が切り替わったら、その年度のプロフィールを読み直す。
  // 納税者情報タブで編集して戻ってきた場合も、マウントし直しで最新を読む。
  useEffect(() => {
    setTaxpayer(loadTaxpayer(year).taxpayer);
  }, [year]);

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

  const summaryRows: readonly { label: string; value: string }[] = [
    {
      label: "氏名",
      value: taxpayer.name
        ? taxpayer.name_kana
          ? `${taxpayer.name}（${taxpayer.name_kana}）`
          : taxpayer.name
        : "",
    },
    {
      label: "住所",
      value: [
        taxpayer.zip_code ? `〒${taxpayer.zip_code}` : "",
        taxpayer.address,
        taxpayer.address_line2,
      ]
        .filter((part) => part.length > 0)
        .join(" "),
    },
    { label: "電話番号", value: taxpayer.phone },
    {
      label: "提出先の税務署",
      value: taxpayer.tax_office_name ? `${taxpayer.tax_office_name}税務署` : "",
    },
    { label: "インボイス登録番号", value: taxpayer.invoice_number },
  ];

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">提出</Text>
          <Text variant="muted">
            XTXは取引データ（帳簿）と控除の入力から生成されます。納税者情報の編集は
            納税者情報タブで行います。
          </Text>
        </Col>

        <Text className={styles.subhead}>納税者情報</Text>
        {summaryRows.map((row) => (
          <Row key={row.label} gap="sm">
            <div className={styles.fieldLabel}>
              <Text variant="muted">{row.label}</Text>
            </div>
            {row.value ? <Text>{row.value}</Text> : <Text variant="muted">未入力</Text>}
          </Row>
        ))}
        {onOpenSection ? (
          <Row gap="sm">
            <Button variant="ghost" size="sm" onClick={() => onOpenSection("taxpayer")}>
              納税者情報タブを開く
            </Button>
          </Row>
        ) : null}

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

        <Text className={styles.subhead}>提出</Text>
        <Text variant="muted">
          提出は e-Tax サイト（e-Taxソフト（WEB版））で行います。出力したXTXを取り込み、
          内容を確認して送信してください。送信にはマイナンバーカードが必要です。
        </Text>
        <Row gap="sm">
          <a
            className={styles.etaxLink}
            href="https://www.e-tax.nta.go.jp"
            target="_blank"
            rel="noreferrer"
          >
            e-Taxサイトを開く
          </a>
        </Row>
      </Col>
    </Card>
  );
};

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
