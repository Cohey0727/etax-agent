import {
  Transaction,
  computeConsumptionReturn,
  computeCorrectedFigures,
  deriveBasePeriodSalesThousands,
  filterYear,
  summarizeConsumptionTax,
} from "@etax/shared";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AlertBox, AppButton, AppText, Card, DateField, LabeledValue, SelectField } from "@/components";
import {
  ExportConsumptionXtxRequest,
  exportConsumptionXtxFile,
  saveTextToCacheFile,
  shareFile,
} from "@/api";
import { space } from "@/theme";
import { formatNumber, formatYen } from "@/utils";
import { AmountField, LoadFailedNotice, ResultRow, SectionHead } from "../fields";
import { EtaxImportGuide } from "../EtaxImportGuide";
import { taxpayerProfileStore, todayIso } from "../taxpayerData";
import { useYearInput } from "../useYearInput";
import {
  AMENDMENT_FIELDS,
  EDITABLE_FIELDS,
  EditableForm,
  EditableKey,
  SUMMARY_ROWS,
} from "./consumptionTaxFields";
import { buildResultRows } from "./consumptionTaxHelpers";

export interface ConsumptionTaxPanelProps {
  transactions: Transaction[];
  year: number;
}

const FILING_KIND_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "1", label: "確定（期限後申告を含む）" },
  { value: "3", label: "修正確定" },
];

/**
 * 消費税申告書（一般用・本則）の作成パネル。
 * 売上・仕入の金額は自由入力ではなく、帳簿の税区分集計から決める
 * （帳簿と申告が食い違わないようにするため）。手入力するのは
 * 基準期間・中間納付・既確定税額など、帳簿の外にある数字だけ。
 * 課税売上割合95%以上は全額控除、それ以外は一括比例配分で計算される。
 * あわせて、帳簿ベースの3方式（本則・簡易・2割特例）の税額比較も出す。
 */
export function ConsumptionTaxPanel({ transactions, year }: ConsumptionTaxPanelProps) {
  // 納税者プロフィール（DB保存）。出力するXTXの見出しに使う。
  const { entry: profileEntry, reload: reloadProfile } = useYearInput(taxpayerProfileStore, year);
  const taxpayer = profileEntry.status === "ready" ? profileEntry.value.taxpayer : null;

  const summary = useMemo(() => summarizeConsumptionTax(transactions, year), [transactions, year]);
  const [form, setForm] = useState<EditableForm>(() => ({
    basePeriodSalesThousands: deriveBasePeriodSalesThousands(transactions, year),
    interimNational: 0,
    interimLocal: 0,
    originalNational: 0,
    originalLocal: 0,
  }));
  const [filingKind, setFilingKind] = useState<1 | 3>(1);
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // XTX出力直後の取り込みガイドと、公式XSD検証を行えなかった場合の警告。
  const [exportedFilename, setExportedFilename] = useState<string | null>(null);
  const [xsdWarning, setXsdWarning] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      computeConsumptionReturn({
        salesIncl10: summary.salesIncl10,
        salesIncl8: summary.salesIncl8,
        nontaxableSales: summary.nontaxableSales,
        exemptSales: summary.exemptSales,
        purchasesIncl10: summary.purchasesIncl10,
        purchasesIncl8: summary.purchasesIncl8,
        interimNational: form.interimNational,
        interimLocal: form.interimLocal,
      }),
    [summary, form],
  );

  // 計算結果の各項目と、その裏付け（どう計算したか）を直下に並べる。
  const resultRows = buildResultRows(preview, form);

  // 3方式の比較（帳簿から計算した申告数値の消費税3方式）。
  const comparison = useMemo(() => {
    const figures = computeCorrectedFigures(filterYear(transactions, year), year);
    return [
      { key: "standard", label: "本則課税", value: figures.consumption_tax_standard },
      { key: "simplified", label: "簡易課税", value: figures.consumption_tax_simplified },
      { key: "special20", label: "2割特例", value: figures.consumption_tax_special20 },
    ] as const;
  }, [transactions, year]);

  const update = (key: EditableKey, value: number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    if (!taxpayer) return;
    setExporting(true);
    setMessage(null);
    setError(null);
    setExportedFilename(null);
    setXsdWarning(null);
    try {
      const request: ExportConsumptionXtxRequest = {
        taxpayer,
        period_from: `${year}-01-01`,
        period_to: `${year}-12-31`,
        submission_date: submissionDate,
        filing_kind: filingKind,
        base_period_sales_thousands: form.basePeriodSalesThousands,
        sales_incl_10: summary.salesIncl10,
        sales_incl_8: summary.salesIncl8,
        nontaxable_sales: summary.nontaxableSales,
        exempt_sales: summary.exemptSales,
        purchases_incl_10: summary.purchasesIncl10,
        purchases_incl_8: summary.purchasesIncl8,
        interim_national: form.interimNational,
        interim_local: form.interimLocal,
        original_national: filingKind === 3 ? form.originalNational : null,
        original_local: filingKind === 3 ? form.originalLocal : null,
      };
      const result = await exportConsumptionXtxFile(request);
      const file = saveTextToCacheFile(result.filename, result.xtx);
      await shareFile(file, "application/xml");
      setExportedFilename(result.filename);
      setXsdWarning(result.xsd_warning);
      setMessage(
        `${result.filename} を保存しました（合計納付税額 ${formatNumber(result.total_payable)}円）。下の手順で e-Taxソフト（WEB版）に取り込んでください。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "消費税XTXの出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <View style={styles.wrap}>
        <SectionHead
          title="消費税申告書（本則）の作成"
          description="消費税及び地方消費税の確定申告書（一般用）と付表1・2を作成します。売上・仕入の金額は帳簿の税区分集計から自動で決まります（帳簿と食い違う入力はできません）。税区分の付け直しは帳簿で行ってください。納税者情報は納税者情報画面で入力したものを使います。期限後申告も申告の種類は「確定」です。"
        />
        {profileEntry.status === "failed" ? (
          <LoadFailedNotice message="納税者情報を取得できませんでした。" onRetry={reloadProfile} />
        ) : null}
        {taxpayer && taxpayer.name === "" ? (
          <AppText size="sm" tone="muted">
            納税者情報が未入力です。先に納税者情報画面で氏名・住所・税務署名を入力してください。
          </AppText>
        ) : null}

        <SelectField
          label="申告の種類"
          value={String(filingKind)}
          options={FILING_KIND_OPTIONS}
          onChange={(v) => setFilingKind(Number(v) === 3 ? 3 : 1)}
        />
        <DateField label="提出日" value={submissionDate} onChange={setSubmissionDate} />

        <SectionHead title="帳簿からの集計（自動）" />
        <View>
          {SUMMARY_ROWS.map((row) => (
            <ResultRow key={row.key} label={row.label} value={summary[row.key]} />
          ))}
        </View>
        {summary.unsetCount > 0 ? (
          <AlertBox
            tone="warn"
            message={`税区分が未設定の取引が ${summary.unsetCount} 件（合計 ${formatYen(summary.unsetAmount)}）あります。集計に含まれていません。帳簿で税区分を付けてください。`}
          />
        ) : null}
        {summary.excludedCount > 0 ? (
          <AlertBox
            tone="warn"
            message={`税区分と金額の符号が不一致の取引が ${summary.excludedCount} 件（合計 ${formatYen(summary.excludedAmount)}）あります。集計に含まれていません。帳簿で税区分を確認してください。`}
          />
        ) : null}

        <SectionHead title="帳簿の外の数字（入力）" />
        {EDITABLE_FIELDS.map((field) => (
          <AmountField
            key={field.key}
            label={field.label}
            value={form[field.key]}
            onChange={(v) => update(field.key, v)}
          />
        ))}
        {filingKind === 3
          ? AMENDMENT_FIELDS.map((field) => (
              <AmountField
                key={field.key}
                label={field.label}
                value={form[field.key]}
                onChange={(v) => update(field.key, v)}
              />
            ))
          : null}

        <SectionHead title="計算結果" />
        {resultRows.map((row) => (
          <View key={row.label} style={styles.resultRow}>
            <LabeledValue label={row.label} value={row.value} />
            <AppText size="sm" tone="muted">
              {row.backing}
            </AppText>
          </View>
        ))}

        <SectionHead
          title="3方式の比較（概算）"
          description="帳簿から計算した、本則・簡易・2割特例の納付税額の比較です。申告書の作成とXTX出力は上の本則で行います。"
        />
        <View>
          {comparison.map((row) => (
            <ResultRow key={row.key} label={row.label} value={row.value} />
          ))}
        </View>

        {error ? <AlertBox tone="error" message={error} /> : null}
        {message ? <AlertBox tone="success" message={message} /> : null}
        {xsdWarning ? (
          <AlertBox
            tone="warn"
            message={`公式XMLスキーマでの検証は行えませんでした: ${xsdWarning} XTXは出力されていますが、取り込み時に内容をよく確認してください。`}
          />
        ) : null}

        <AppButton
          label={exporting ? "出力中…" : "消費税のe-Tax用データを出力（XTX）"}
          disabled={exporting || !taxpayer}
          loading={exporting}
          onPress={() => void handleExport()}
        />
        {exportedFilename ? <EtaxImportGuide filename={exportedFilename} /> : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  resultRow: { gap: 2 },
});
