import {
  DeductionState,
  IncomeTaxPaymentInputs,
  IncomeTaxResult,
  Transaction,
  agricultureToWire,
  balanceSheetToWire,
  buildTrialBalanceSheet,
  expandedIncomeToWire,
  isAgricultureEmpty,
  isBalanceSheetEmpty,
  isExpandedIncomeEmpty,
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
import { ExportXtxRequest, XtxTaxpayerInput } from "@/api";
import { space } from "@/theme";
import { declaredIncomeTax } from "../declaredIncomeTax";
import { AmountField, LoadFailedNotice, ResultRow, SectionHead } from "../fields";
import { FilingSection } from "../FilingPanel";
import { ReturnExportActions } from "../ReturnExportActions";
import { taxpayerProfileStore, todayIso } from "../taxpayerData";
import { useYearInput } from "../useYearInput";

/** 提出先の e-Tax トップページ。 */
const ETAX_URL = "https://www.e-tax.nta.go.jp";

export interface TaxpayerPanelProps {
  year: number;
  /** 対象年分の取引（帳簿）。XTXはこの取引データから生成される。 */
  transactions: Transaction[];
  /** 申告入力（控除・帳簿に載らない所得・申告の種類・貸借対照表・源泉徴収税額など） */
  deductionState: DeductionState;
  /** 青色申告特別控除前の事業所得（貸借対照表の貸借チェックに使う） */
  businessIncomeBeforeBlue: number;
  /** 所得税の計算結果。申告納税額の精算に使う。 */
  taxResult: IncomeTaxResult;
  /** 配当・株式等譲渡の入力に含まれる源泉徴収税額（XTX でも源泉徴収税額へ加算される） */
  expandedWithholding: number;
  onIncomeTaxPaymentsChange: (next: IncomeTaxPaymentInputs) => void;
  /** 納税者情報画面への遷移（確定申告画面の総合でのみ渡される）。 */
  onOpenSection?: (section: FilingSection) => void;
}

/**
 * 提出パネル（確定申告画面の総合タブ）。納税者情報は要約だけを表示し、
 * 編集は納税者情報画面で行う。ここでは出力の条件とXTX／紙イメージの出力、
 * そして e-Tax サイトへのリンク（提出の動線）を担う。
 */
export function TaxpayerPanel({
  year,
  transactions,
  deductionState,
  businessIncomeBeforeBlue,
  taxResult,
  expandedWithholding,
  onIncomeTaxPaymentsChange,
  onOpenSection,
}: TaxpayerPanelProps) {
  const { entry: profileEntry, reload: reloadProfile } = useYearInput(taxpayerProfileStore, year);
  const taxpayer = profileEntry.status === "ready" ? profileEntry.value.taxpayer : null;
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const { incomeTaxPayments, expandedIncome, balanceSheet } = deductionState;
  const { withholdingTax, prepaidTax } = incomeTaxPayments;
  const declared = declaredIncomeTax(taxResult, withholdingTax + expandedWithholding, prepaidTax);

  const buildRequest = (profile: XtxTaxpayerInput): ExportXtxRequest => ({
    year,
    amendment: false,
    submission_date: submissionDate,
    taxpayer: profile,
    transactions,
    deductions: deductionState.deductions,
    tax_credits: deductionState.taxCredits,
    misc_income: deductionState.miscIncome,
    salary_income: deductionState.salaryIncome,
    expanded_income: isExpandedIncomeEmpty(expandedIncome)
      ? undefined
      : expandedIncomeToWire(expandedIncome),
    agriculture: isAgricultureEmpty(deductionState.agriculture)
      ? undefined
      : agricultureToWire(deductionState.agriculture),
    filing_type: deductionState.filingType,
    real_estate_business_scale: deductionState.realEstateBusinessScale,
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
    const sheet = buildTrialBalanceSheet(balanceSheet, businessIncomeBeforeBlue);
    const sides: string[] = [];
    if (!sheet.opening_balanced) sides.push("期首");
    if (!sheet.closing_balanced) sides.push("期末");
    return sides.length > 0 ? sides.join("・") : null;
  }, [balanceSheet, businessIncomeBeforeBlue]);

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
        {!isExpandedIncomeEmpty(expandedIncome) ? (
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
        <ReturnExportActions
          year={year}
          taxpayer={taxpayer}
          submissionDate={submissionDate}
          buildRequest={buildRequest}
        />

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
});
