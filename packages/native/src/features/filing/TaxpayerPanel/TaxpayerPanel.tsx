import {
  AgricultureInput,
  DeductionInputs,
  ExpandedIncomeInput,
  FilingType,
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
import { useEffect, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton, AppText, Card, Field, LabeledValue } from "@/components";
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
import { AmountField, SectionHead } from "../fields";
import { EtaxImportGuide } from "../EtaxImportGuide";
import { FilingSection } from "../FilingPanel";
import { emptyTaxpayer, loadTaxpayer, todayIso } from "../taxpayerData";

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
  /**
   * 申告済みの所得税額（過去に確定した分）。入っていれば、その確定分と
   * 比較する修正申告として出力する。null なら確定申告として出力する。
   */
  originalIncomeTax: number | null;
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
  originalIncomeTax,
  onOpenSection,
}: TaxpayerPanelProps) {
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => emptyTaxpayer());
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const [withholdingTax, setWithholdingTax] = useState(0);
  const [prepaidTax, setPrepaidTax] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDomicile, setExportingDomicile] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // XTX出力直後の取り込みガイドと、公式XSD検証を行えなかった場合の警告。
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [xsdWarning, setXsdWarning] = useState<string | null>(null);

  const supported = xtxSupportedYears().includes(year);

  // 年度が切り替わったら、その年度のプロフィールを読み直す。
  useEffect(() => {
    let cancelled = false;
    void loadTaxpayer(year).then((loadedProfile) => {
      if (!cancelled) setTaxpayer(loadedProfile.taxpayer);
    });
    return () => {
      cancelled = true;
    };
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
    original_third_period_tax: amendment ? originalIncomeTax : null,
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
    setExporting(true);
    setMessage(null);
    setError(null);
    setExportedFilename(null);
    setXsdWarning(null);
    try {
      const result = await exportXtxFile(buildRequest());
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
    setExportingPdf(true);
    setMessage(null);
    setError(null);
    try {
      const result = await exportReturnPdfFile(buildRequest());
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
      <View style={styles.wrap}>
        <SectionHead
          title="提出"
          description="XTXは取引データ（帳簿）と控除の入力から生成されます。納税者情報の編集は納税者情報画面で行います。"
        />

        <AppText size="md" weight="bold">
          納税者情報
        </AppText>
        <View>
          {summaryRows.map((row) => (
            <LabeledValue
              key={row.label}
              label={row.label}
              value={row.value === "" ? "未入力" : row.value}
            />
          ))}
        </View>
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
        <LabeledValue label="申告の種類" value={amendment ? "修正申告" : "確定申告"} />
        <Field
          label="提出日"
          value={submissionDate}
          onChangeText={setSubmissionDate}
          placeholder="YYYY-MM-DD"
          hint="YYYY-MM-DD 形式で入力してください"
        />
        <AmountField label="源泉徴収税額" value={withholdingTax} onChange={setWithholdingTax} />
        {expandedIncome && !isExpandedIncomeEmpty(expandedIncome) ? (
          <AppText size="sm" tone="muted">
            配当・株式等譲渡の源泉徴収税額は、各所得の入力欄で入れた金額が自動で加算されます（ここには含めないでください）。
          </AppText>
        ) : null}
        <AmountField label="予定納税額" value={prepaidTax} onChange={setPrepaidTax} />

        <AppText size="sm" tone="muted">
          申告の種類は入力内容から決まります。申告済みの所得税額が入っている場合は
          その確定分と比較する修正申告として、入っていない場合は確定申告として
          出力します。
        </AppText>

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
            disabled={!supported || exporting}
            loading={exporting}
            onPress={() => void handleExport()}
          />
          <AppButton
            label={exportingPdf ? "出力中…" : "申告書の紙イメージ（PDF）"}
            variant="ghost"
            disabled={exportingPdf}
            loading={exportingPdf}
            onPress={() => void handleExportPdf()}
          />
          <AppButton
            label={exportingDomicile ? "出力中…" : "納税地の異動申出書（PDF）"}
            variant="ghost"
            disabled={exportingDomicile}
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

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  actions: { gap: space.sm },
});
