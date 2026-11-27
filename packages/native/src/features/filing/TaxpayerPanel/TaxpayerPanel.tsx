import {
  AgricultureInput,
  DeductionInputs,
  ExpandedIncomeInput,
  FilingType,
  IncomeTaxPaymentInputs,
  IncomeTaxResult,
  MiscIncomeInput,
  SalaryIncomeInput,
  TaxCreditInputs,
  Transaction,
  XtxBalanceSheetInput,
  agricultureToWire,
  balanceSheetToWire,
  buildTrialBalanceSheet,
  computeCorrectedFigures,
  expandedIncomeToWire,
  isAgricultureEmpty,
  isBalanceSheetEmpty,
  isExpandedIncomeEmpty,
  xtxSupportedYears,
} from "@etax/shared";
import * as Linking from "expo-linking";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  AlertBox,
  AppButton,
  AppText,
  Card,
  DateField,
  LabeledValue,
  SkeletonBar,
} from "@/components";
import {
  ExportXtxRequest,
  XtxTaxpayerInput,
  exportDomicilePdfFile,
  exportReturnPdfFile,
  exportXtxFile,
  saveBase64ToCacheFile,
  saveTextToCacheFile,
  shareFile,
} from "@/api";
import { space } from "@/theme";
import { declaredIncomeTax } from "../declaredIncomeTax";
import { AmountField, LoadFailedNotice, ResultRow, SectionHead } from "../fields";
import { EtaxImportGuide } from "../EtaxImportGuide";
import { FilingSection } from "../FilingPanel";
import { taxpayerProfileStore, todayIso } from "../taxpayerData";
import { useYearInput } from "../useYearInput";

/** 提出先の e-Tax トップページ。 */
const ETAX_URL = "https://www.e-tax.nta.go.jp";

export interface TaxpayerPanelProps {
  year: number;
  /** 対象年分の取引（帳簿）。XTXはこの取引データから生成される。 */
  transactions: Transaction[];
  deductions: DeductionInputs;
  taxCredits: TaxCreditInputs;
  /** 雑所得（その他）。帳簿に載らない所得として申告数値に含める。 */
  miscIncome?: MiscIncomeInput;
  /** 給与所得。帳簿に載らない給与として申告数値に含める。 */
  salaryIncome?: SalaryIncomeInput;
  /** 配当・一時・株式等譲渡。申告数値とXTX（第三表・計算明細書）に含める。 */
  expandedIncome?: ExpandedIncomeInput;
  /** 農業所得。申告数値とXTX（農業所得用の決算書）に含める。 */
  agriculture?: AgricultureInput;
  /** 申告の種類（青色申告特別控除の区分）。出力する申告数値の計算に使う。 */
  filingType?: FilingType;
  /** 不動産貸付けが事業的規模か */
  realEstateBusinessScale?: boolean;
  /** 貸借対照表の入力（申告入力に保存されたもの）。XTXの決算書4面に反映する。 */
  balanceSheet?: XtxBalanceSheetInput | null;
  /** 所得税の計算結果。申告納税額の精算に使う。 */
  taxResult: IncomeTaxResult;
  /** 源泉徴収税額・予定納税額（申告入力として年度別に保存される） */
  incomeTaxPayments: IncomeTaxPaymentInputs;
  onIncomeTaxPaymentsChange: (next: IncomeTaxPaymentInputs) => void;
  /** 配当・株式等譲渡の入力に含まれる源泉徴収税額（XTX でも源泉徴収税額へ加算される） */
  expandedWithholding: number;
  /** 納税者情報画面への遷移（確定申告画面の総合でのみ渡される）。 */
  onOpenSection?: (section: FilingSection) => void;
}

/**
 * 提出パネル（確定申告画面の総合タブ）。納税者情報は要約だけを表示し、
 * 編集は納税者情報画面で行う。ここでは出力の条件とXTX／紙イメージの出力、
 * そして e-Tax サイトへのリンク（提出の動線）を担う。
 * 生成ファイルは端末に保存して共有シートで渡す。
 */
export function TaxpayerPanel({
  year,
  transactions,
  deductions,
  taxCredits,
  miscIncome,
  salaryIncome,
  expandedIncome,
  agriculture,
  filingType,
  realEstateBusinessScale,
  balanceSheet,
  taxResult,
  incomeTaxPayments,
  onIncomeTaxPaymentsChange,
  expandedWithholding,
  onOpenSection,
}: TaxpayerPanelProps) {
  const { entry: profileEntry, reload: reloadProfile } = useYearInput(taxpayerProfileStore, year);
  const taxpayer = profileEntry.status === "ready" ? profileEntry.value.taxpayer : null;
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const { withholdingTax, prepaidTax } = incomeTaxPayments;
  const declared = declaredIncomeTax(taxResult, withholdingTax + expandedWithholding, prepaidTax);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDomicile, setExportingDomicile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // XTX出力直後の取り込みガイドと、公式XSD検証を行えなかった場合の警告。
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [xsdWarning, setXsdWarning] = useState<string | null>(null);

  const supported = xtxSupportedYears().includes(year);

  const buildRequest = (taxpayer: XtxTaxpayerInput): ExportXtxRequest => ({
    year,
    amendment: false,
    submission_date: submissionDate,
    taxpayer,
    transactions,
    deductions,
    tax_credits: taxCredits,
    misc_income: miscIncome,
    salary_income: salaryIncome,
    expanded_income:
      expandedIncome && !isExpandedIncomeEmpty(expandedIncome)
        ? expandedIncomeToWire(expandedIncome)
        : undefined,
    agriculture:
      agriculture && !isAgricultureEmpty(agriculture)
        ? agricultureToWire(agriculture)
        : undefined,
    filing_type: filingType,
    real_estate_business_scale: realEstateBusinessScale,
    withholding_tax: withholdingTax,
    prepaid_tax: prepaidTax,
    original_third_period_tax: null,
    balance_sheet:
      balanceSheet && !isBalanceSheetEmpty(balanceSheet)
        ? balanceSheetToWire(balanceSheet)
        : undefined,
  });

  // 貸借対照表の貸借チェック（警告のみ。出力ボタンは止めないが、
  // 不一致のまま出力するとサーバー側で不整合としてエラーになる）。
  const balanceSheetCheck = useMemo(() => {
    if (!balanceSheet || isBalanceSheetEmpty(balanceSheet)) return null;
    const figures = computeCorrectedFigures(transactions, year, {
      filingType,
      realEstateBusinessScale,
    });
    const sheet = buildTrialBalanceSheet(
      balanceSheet,
      figures._detail.business_income_before_deduction,
    );
    const sides: string[] = [];
    if (!sheet.opening_balanced) sides.push("期首");
    if (!sheet.closing_balanced) sides.push("期末");
    return sides.length > 0 ? sides.join("・") : null;
  }, [balanceSheet, transactions, year, filingType, realEstateBusinessScale]);

  const handleExport = async () => {
    if (!taxpayer) return;
    setExporting(true);
    setMessage(null);
    setError(null);
    setExportedFilename(null);
    setXsdWarning(null);
    try {
      const result = await exportXtxFile(buildRequest(taxpayer));
      const file = saveTextToCacheFile(result.filename, result.xtx);
      await shareFile(file, "application/xml");
      setExportedFilename(result.filename);
      setXsdWarning(result.xsd_warning);
      setMessage(
        `${result.filename} を保存しました。下の手順で e-Taxソフト（WEB版）に取り込んでください。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "XTXの出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  const handleExportPdf = async () => {
    if (!taxpayer) return;
    setExportingPdf(true);
    setMessage(null);
    setError(null);
    try {
      const result = await exportReturnPdfFile(buildRequest(taxpayer));
      const file = saveBase64ToCacheFile(result.filename, result.pdf_base64);
      await shareFile(file, "application/pdf");
      setMessage(
        `${result.filename} を保存しました。公式様式に数字を重ねた確認用のイメージです（提出はXTXで行ってください）。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "紙イメージ PDF の出力に失敗しました");
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportDomicilePdf = async () => {
    if (!taxpayer) return;
    setExportingDomicile(true);
    setMessage(null);
    setError(null);
    try {
      const result = await exportDomicilePdfFile({
        year,
        submission_date: submissionDate,
        taxpayer,
      });
      const file = saveBase64ToCacheFile(result.filename, result.pdf_base64);
      await shareFile(file, "application/pdf");
      setMessage(
        `${result.filename} を保存しました。公式様式にプロフィールを記入した印刷用の申出書です。印刷して、異動後の納税地を所轄する税務署へ提出してください（郵送も可）。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "異動申出書 PDF の出力に失敗しました");
    } finally {
      setExportingDomicile(false);
    }
  };

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="提出"
          description="XTXは取引データ（帳簿）と控除の入力から生成されます。納税者情報の編集は納税者情報画面で行います。"
        />

        <AppText size="md" weight="bold">
          納税者情報
        </AppText>
        {taxpayer ? (
          <View>
            {taxpayerSummaryRows(taxpayer).map((row) => (
              <LabeledValue
                key={row.label}
                label={row.label}
                value={row.value === "" ? "未入力" : row.value}
              />
            ))}
          </View>
        ) : profileEntry.status === "failed" ? (
          <LoadFailedNotice message="納税者情報を取得できませんでした。" onRetry={reloadProfile} />
        ) : (
          <SkeletonBar height={96} />
        )}
        {onOpenSection ? (
          <AppButton
            label="納税者情報を開く"
            variant="ghost"
            size="sm"
            onPress={() => onOpenSection("taxpayer")}
          />
        ) : null}

        <AppText size="md" weight="bold">
          出力の条件
        </AppText>
        <LabeledValue label="申告の種類" value="確定申告" />
        <DateField label="提出日" value={submissionDate} onChange={setSubmissionDate} />
        <AmountField
          label="源泉徴収税額"
          value={withholdingTax}
          onChange={(v) => onIncomeTaxPaymentsChange({ ...incomeTaxPayments, withholdingTax: v })}
        />
        {expandedIncome && !isExpandedIncomeEmpty(expandedIncome) ? (
          <AppText size="sm" tone="muted">
            配当・株式等譲渡の源泉徴収税額は、各所得の入力欄で入れた金額が自動で加算されます（ここには含めないでください）。
          </AppText>
        ) : null}
        <AmountField
          label="予定納税額"
          value={prepaidTax}
          onChange={(v) => onIncomeTaxPaymentsChange({ ...incomeTaxPayments, prepaidTax: v })}
        />
        <View>
          <ResultRow label="申告納税額" value={declared.declaredTax} />
          <ResultRow
            label={
              declared.thirdPeriodTax < 0
                ? "第3期分の税額（還付される税金）"
                : "第3期分の税額（納める税金）"
            }
            value={Math.abs(declared.thirdPeriodTax)}
            strong
          />
        </View>

        {balanceSheetCheck ? (
          <AlertBox
            tone="warn"
            message={`貸借対照表の貸借が一致していません（${balanceSheetCheck}）。このまま出力するとエラーになります。収支タブの貸借対照表で金額を確認してください。`}
          />
        ) : null}
        {error ? <AlertBox tone="error" message={error} /> : null}
        {message ? <AlertBox tone="success" message={message} /> : null}
        {xsdWarning ? (
          <AlertBox
            tone="warn"
            message={`公式XMLスキーマでの検証は行えませんでした: ${xsdWarning} XTXは出力されていますが、取り込み時に内容をよく確認してください。`}
          />
        ) : null}
        {exportedFilename ? <EtaxImportGuide filename={exportedFilename} /> : null}

        <View style={styles.actions}>
          <AppButton
            label={exporting ? "出力中…" : "e-Tax用データを出力（XTX）"}
            disabled={!supported || exporting || !taxpayer}
            loading={exporting}
            onPress={() => void handleExport()}
          />
          <AppButton
            label={exportingPdf ? "出力中…" : "申告書の紙イメージ（PDF）"}
            variant="ghost"
            disabled={exportingPdf || !taxpayer}
            loading={exportingPdf}
            onPress={() => void handleExportPdf()}
          />
          <AppButton
            label={exportingDomicile ? "出力中…" : "納税地の異動申出書（PDF）"}
            variant="ghost"
            disabled={exportingDomicile || !taxpayer}
            loading={exportingDomicile}
            onPress={() => void handleExportDomicilePdf()}
          />
        </View>
        {!supported ? (
          <AppText size="sm" tone="muted">
            {year}年分はXTX出力に未対応です（対応: {xtxSupportedYears().join("・")}年分）
          </AppText>
        ) : null}

        <AppText size="md" weight="bold">
          提出
        </AppText>
        <AppText size="sm" tone="muted">
          提出は e-Tax サイト（e-Taxソフト（WEB版））で行います。出力したXTXを取り込み、
          内容を確認して送信してください。送信にはマイナンバーカードが必要です。
        </AppText>
        <AppButton
          label="提出する（e-Taxを開く）"
          variant="navy"
          onPress={() => void Linking.openURL(ETAX_URL)}
        />
      </View>
    </Card>
  );
}

/** 提出パネルに出す納税者情報の要約（未入力の項目は空文字）。 */
function taxpayerSummaryRows(taxpayer: XtxTaxpayerInput): readonly { label: string; value: string }[] {
  return [
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
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  actions: { gap: space.sm },
});
