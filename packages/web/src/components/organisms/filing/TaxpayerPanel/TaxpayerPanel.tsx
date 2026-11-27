import {
  DeductionState,
  IncomeTaxPaymentInputs,
  Transaction,
  agricultureToWire,
  balanceSheetToWire,
  buildTrialBalanceSheet,
  expandedIncomeToWire,
  isAgricultureEmpty,
  isBalanceSheetEmpty,
  isExpandedIncomeEmpty,
  xtxSupportedYears,
} from "@etax/shared";
import { useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { LabeledAmountField } from "@components/molecules/LabeledAmountField";
import { ExportXtxRequest, XtxTaxpayerInput } from "@types";
import { exportDomicilePdfFile, exportReturnPdfFile, exportXtxFile } from "@utils/api";
import { downloadPdfFile, downloadTextFile } from "@utils/fileDownload";
import { todayIso } from "@utils/localDate";
import { EtaxImportGuide } from "@components/organisms/filing/EtaxImportGuide";
import { EtaxSubmitActions } from "@components/organisms/filing/EtaxSubmitActions";
import { FilingSection } from "../FilingPanel";
import { TaxpayerProfileSummary } from "../TaxpayerProfileSummary";
import { emptyTaxpayer, loadTaxpayer } from "../TaxpayerProfilePanel";
import styles from "./TaxpayerPanel.css";

export interface TaxpayerPanelProps {
  year: number;
  /** 対象年分の取引（帳簿）。XTXはこの取引データから生成される。 */
  transactions: Transaction[];
  /** 対象年の申告入力。控除・所得・申告の種類・貸借対照表・源泉徴収税額を出力に使う。 */
  state: DeductionState;
  /** 青色申告特別控除前の事業所得（貸借対照表の貸借チェックに使う）。 */
  incomeBeforeBlue: number;
  onIncomeTaxPaymentsChange: (next: IncomeTaxPaymentInputs) => void;
  /** 納税者情報タブへの遷移。 */
  onOpenSection: (section: FilingSection) => void;
}

/**
 * 提出パネル（確定申告画面の総合タブ）。納税者情報は要約だけを表示し、
 * 編集は納税者情報タブで行う。ここでは出力の条件とXTX／紙イメージの出力、
 * そして e-Tax サイトへのリンク（提出の動線）を担う。
 */
export const TaxpayerPanel = ({
  year,
  transactions,
  state,
  incomeBeforeBlue,
  onIncomeTaxPaymentsChange,
  onOpenSection,
}: TaxpayerPanelProps) => {
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => emptyTaxpayer());
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDomicile, setExportingDomicile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // XTX出力直後の取り込みガイドと、公式XSD検証を行えなかった場合の警告。
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [xsdWarning, setXsdWarning] = useState<string | null>(null);

  const supported = xtxSupportedYears().includes(year);
  const { incomeTaxPayments, expandedIncome, agriculture, balanceSheet } = state;

  // 納税者情報タブで編集して戻ってきた場合も、マウントし直しで最新を読む。
  useEffect(() => {
    let cancelled = false;
    void loadTaxpayer(year).then((loadedProfile) => {
      if (!cancelled && loadedProfile) setTaxpayer(loadedProfile.taxpayer);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const buildRequest = (): ExportXtxRequest => ({
    year,
    amendment: false,
    submission_date: submissionDate,
    taxpayer,
    transactions,
    deductions: state.deductions,
    tax_credits: state.taxCredits,
    misc_income: state.miscIncome,
    salary_income: state.salaryIncome,
    expanded_income: isExpandedIncomeEmpty(expandedIncome) ? undefined : expandedIncomeToWire(expandedIncome),
    agriculture: isAgricultureEmpty(agriculture) ? undefined : agricultureToWire(agriculture),
    filing_type: state.filingType,
    real_estate_business_scale: state.realEstateBusinessScale,
    withholding_tax: incomeTaxPayments.withholdingTax,
    prepaid_tax: incomeTaxPayments.prepaidTax,
    original_third_period_tax: null,
    balance_sheet:
      balanceSheet && !isBalanceSheetEmpty(balanceSheet) ? balanceSheetToWire(balanceSheet) : undefined,
  });

  // 貸借対照表の貸借チェック（警告のみ。出力ボタンは止めないが、
  // 不一致のまま出力するとサーバー側で不整合としてエラーになる）。
  const unbalancedSides = balanceSheetUnbalancedSides(balanceSheet, incomeBeforeBlue);

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    setError(null);
    setExportedFilename(null);
    setXsdWarning(null);
    try {
      const result = await exportXtxFile(buildRequest());
      downloadTextFile(result.filename, result.xtx);
      setExportedFilename(result.filename);
      setXsdWarning(result.xsd_warning);
      setMessage(
        `${result.filename} をダウンロードしました。下の手順で e-Taxソフト（WEB版）に取り込んでください。`,
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

  const handleExportDomicilePdf = async () => {
    setExportingDomicile(true);
    setMessage(null);
    setError(null);
    try {
      const result = await exportDomicilePdfFile({
        year,
        submission_date: submissionDate,
        taxpayer,
      });
      downloadPdfFile(result.filename, result.pdf_base64);
      setMessage(
        `${result.filename} をダウンロードしました。公式様式にプロフィールを記入した印刷用の申出書です。印刷して、異動後の納税地を所轄する税務署へ提出してください（郵送も可）。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "異動申出書 PDF の出力に失敗しました");
    } finally {
      setExportingDomicile(false);
    }
  };

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

        <TaxpayerProfileSummary taxpayer={taxpayer} onOpenProfile={() => onOpenSection("taxpayer")} />

        <Text className={styles.subhead}>出力の条件</Text>
        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">申告の種類</Text>
          </div>
          <Text>確定申告</Text>
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
        <LabeledAmountField
          label="源泉徴収税額"
          value={incomeTaxPayments.withholdingTax}
          onChange={(v) => onIncomeTaxPaymentsChange({ ...incomeTaxPayments, withholdingTax: v })}
        />
        {isExpandedIncomeEmpty(expandedIncome) ? null : (
          <Text variant="muted">
            配当・株式等譲渡の源泉徴収税額は、各所得の入力欄で入れた金額が自動で加算されます（ここには含めないでください）。
          </Text>
        )}
        <LabeledAmountField
          label="予定納税額"
          value={incomeTaxPayments.prepaidTax}
          onChange={(v) => onIncomeTaxPaymentsChange({ ...incomeTaxPayments, prepaidTax: v })}
        />

        {unbalancedSides ? (
          <AlertBox variant="notice">
            貸借対照表の貸借が一致していません（{unbalancedSides}）。
            このまま出力するとエラーになります。収支タブの貸借対照表で金額を確認してください。
          </AlertBox>
        ) : null}
        {error ? <AlertBox variant="error">{error}</AlertBox> : null}
        {message ? <AlertBox>{message}</AlertBox> : null}
        {xsdWarning ? (
          <AlertBox variant="notice">
            公式XMLスキーマでの検証は行えませんでした: {xsdWarning}
            XTXは出力されていますが、取り込み時に内容をよく確認してください。
          </AlertBox>
        ) : null}
        {exportedFilename ? <EtaxImportGuide filename={exportedFilename} /> : null}

        <Row gap="sm">
          <Button
            variant="primary"
            onClick={handleExport}
            disabled={!supported || exporting}
            disabledReason={exporting ? "出力中です" : "この年度はXTX出力に未対応です"}
          >
            {exporting ? "出力中…" : "e-Tax用データを出力（XTX）"}
          </Button>
          <Button onClick={handleExportPdf} disabled={exportingPdf} disabledReason="出力中です">
            {exportingPdf ? "出力中…" : "申告書の紙イメージ（PDF）"}
          </Button>
          <Button onClick={handleExportDomicilePdf} disabled={exportingDomicile} disabledReason="出力中です">
            {exportingDomicile ? "出力中…" : "納税地の異動申出書（PDF）"}
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
        <EtaxSubmitActions />
      </Col>
    </Card>
  );
};

/** 貸借対照表の貸借が一致していない側（「期首・期末」など）。入力が無い・一致していれば null。 */
function balanceSheetUnbalancedSides(
  balanceSheet: DeductionState["balanceSheet"],
  incomeBeforeBlue: number,
): string | null {
  if (!balanceSheet || isBalanceSheetEmpty(balanceSheet)) return null;
  const sheet = buildTrialBalanceSheet(balanceSheet, incomeBeforeBlue);
  const sides: string[] = [];
  if (!sheet.opening_balanced) sides.push("期首");
  if (!sheet.closing_balanced) sides.push("期末");
  return sides.length > 0 ? sides.join("・") : null;
}
