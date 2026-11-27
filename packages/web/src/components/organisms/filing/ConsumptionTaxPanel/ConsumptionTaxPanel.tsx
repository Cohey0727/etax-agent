import {
  ConsumptionFilingInputs,
  Transaction,
  computeConsumptionReturn,
  deriveBasePeriodSalesThousands,
  summarizeConsumptionTax,
} from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Input, Row, Select, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { LabeledAmountField } from "@components/molecules/LabeledAmountField";
import { ConsumptionLedgerSummary } from "@components/organisms/filing/ConsumptionLedgerSummary";
import { EtaxImportGuide } from "@components/organisms/filing/EtaxImportGuide";
import {
  emptyTaxpayer,
  loadTaxpayer,
} from "@components/organisms/filing/TaxpayerProfilePanel";
import { ExportConsumptionXtxRequest, XtxTaxpayerInput } from "@types";
import { exportConsumptionXtxFile } from "@utils/api";
import { formatNumber, formatYen } from "@utils";
import { downloadTextFile } from "@utils/fileDownload";
import { todayIso } from "@utils/localDate";
import {
  AMENDMENT_FIELDS,
  EDITABLE_FIELDS,
  EditableForm,
  EditableKey,
} from "./consumptionTaxFields";
import { ConsumptionResultUnit, buildResultRows } from "./consumptionTaxHelpers";
import styles from "./ConsumptionTaxPanel.css";

export interface ConsumptionTaxPanelProps {
  transactions: Transaction[];
  year: number;
  /** 帳簿画面をこの年度＋税区分が未設定の取引のフィルターで開く（税区分の警告からの遷移）。 */
  onOpenLedger?: (kind: "taxUnset") => void;
  /** 申告の種類と帳簿の外にある数字の手入力（申告入力に保存されたもの）。 */
  consumptionFiling: ConsumptionFilingInputs;
  onConsumptionFilingChange: (next: ConsumptionFilingInputs) => void;
}

/** 計算結果の値の単位ごとの表示。 */
const RESULT_VALUE_FORMATS: Record<ConsumptionResultUnit, (value: number) => string> = {
  percent: (value) => `${value}%`,
  yen: formatYen,
};

/**
 * 消費税申告書（一般用・本則）の作成パネル。
 * 売上・仕入の金額は自由入力ではなく、帳簿の税区分集計から決める
 * （帳簿と申告が食い違わないようにするため）。手入力するのは
 * 基準期間・中間納付・既確定税額など、帳簿の外にある数字だけ。
 * 課税売上割合95%以上は全額控除、それ以外は一括比例配分で計算される。
 */
export const ConsumptionTaxPanel = ({
  transactions,
  year,
  onOpenLedger,
  consumptionFiling,
  onConsumptionFilingChange,
}: ConsumptionTaxPanelProps) => {
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => emptyTaxpayer());

  // 納税者プロフィール（DB保存）を読み込む。出力するXTXの見出しに使う。
  useEffect(() => {
    let cancelled = false;
    loadTaxpayer(year).then((loadedProfile) => {
      if (!cancelled && loadedProfile) setTaxpayer(loadedProfile.taxpayer);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const summary = useMemo(() => summarizeConsumptionTax(transactions, year), [transactions, year]);
  const derivedBasePeriodSales = useMemo(
    () => deriveBasePeriodSalesThousands(transactions, year),
    [transactions, year],
  );
  // 基準期間の課税売上高は、手で直すまでは帳簿（2年前）から求めた値を使う。
  const form: EditableForm = {
    basePeriodSalesThousands: consumptionFiling.basePeriodSalesThousands ?? derivedBasePeriodSales,
    interimNational: consumptionFiling.interimNational,
    interimLocal: consumptionFiling.interimLocal,
    originalNational: consumptionFiling.originalNational,
    originalLocal: consumptionFiling.originalLocal,
  };
  const filingKind = consumptionFiling.filingKind;
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
        interimNational: consumptionFiling.interimNational,
        interimLocal: consumptionFiling.interimLocal,
      }),
    [summary, consumptionFiling.interimNational, consumptionFiling.interimLocal],
  );

  // 計算結果の各項目と、その裏付け（どう計算したか）を直下に並べる。
  const resultRows = buildResultRows(preview, form);

  const update = (key: EditableKey, value: number) => {
    onConsumptionFilingChange({ ...consumptionFiling, [key]: value });
  };

  const handleExport = async () => {
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
      downloadTextFile(result.filename, result.xtx);
      setExportedFilename(result.filename);
      setXsdWarning(result.xsd_warning);
      setMessage(
        `${result.filename} をダウンロードしました（合計納付税額 ${formatNumber(result.total_payable)}円）。下の手順で e-Taxソフト（WEB版）に取り込んでください。`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "消費税XTXの出力に失敗しました");
    } finally {
      setExporting(false);
    }
  };

  return (
    <Card>
      <Col gap="md">
        <Col gap="sm">
          <Text variant="sectionTitle">消費税申告書（本則）の作成</Text>
          <Text variant="muted">
            消費税及び地方消費税の確定申告書（一般用）と付表1・2を作成します。売上・仕入の
            金額は帳簿の税区分集計から自動で決まります（帳簿と食い違う入力はできません）。
            税区分の付け直しは帳簿で行ってください。納税者情報は納税者情報タブで入力した
            ものを使います。期限後申告も申告の種類は「確定」です。
          </Text>
          {taxpayer.name === "" ? (
            <Text variant="muted">
              納税者情報が未入力です。先に納税者情報タブで氏名・住所・税務署名を入力してください。
            </Text>
          ) : null}
        </Col>

        <Row gap="sm">
          <div className={styles.fieldLabel}>
            <Text variant="muted">申告の種類</Text>
          </div>
          <Select
            className={styles.fieldInput}
            value={filingKind}
            onChange={(e) =>
              onConsumptionFilingChange({
                ...consumptionFiling,
                filingKind: Number(e.target.value) === 3 ? 3 : 1,
              })
            }
            aria-label="申告の種類"
          >
            <option value={1}>確定（期限後申告を含む）</option>
            <option value={3}>修正確定</option>
          </Select>
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

        <ConsumptionLedgerSummary summary={summary} onOpenLedger={onOpenLedger} />

        <Text className={styles.subhead}>帳簿の外の数字（入力）</Text>
        {EDITABLE_FIELDS.map((field) => (
          <LabeledAmountField
            key={field.key}
            label={field.label}
            value={form[field.key]}
            onChange={(v) => update(field.key, v)}
          />
        ))}
        {filingKind === 3
          ? AMENDMENT_FIELDS.map((field) => (
              <LabeledAmountField
                key={field.key}
                label={field.label}
                value={form[field.key]}
                onChange={(v) => update(field.key, v)}
              />
            ))
          : null}

        <Text className={styles.subhead}>計算結果</Text>
        {resultRows.map((row) => (
          <Col key={row.label} gap="sm">
            <Row gap="sm">
              <div className={styles.fieldLabel}>
                <Text variant="muted">{row.label}</Text>
              </div>
              <Text className={styles.amountValue}>{RESULT_VALUE_FORMATS[row.unit](row.value)}</Text>
            </Row>
            <Row gap="sm">
              <div className={styles.backingSpacer} />
              <Text variant="muted" className={styles.resultBacking}>
                {row.backing}
              </Text>
            </Row>
          </Col>
        ))}

        {error ? <AlertBox variant="error">{error}</AlertBox> : null}
        {message ? <AlertBox>{message}</AlertBox> : null}
        {xsdWarning ? (
          <AlertBox variant="notice">
            公式XMLスキーマでの検証は行えませんでした: {xsdWarning}
            XTXは出力されていますが、取り込み時に内容をよく確認してください。
          </AlertBox>
        ) : null}

        <Row gap="sm">
          <Button variant="primary" onClick={handleExport} disabled={exporting} disabledReason="出力中です">
            {exporting ? "出力中…" : "消費税のe-Tax用データを出力（XTX）"}
          </Button>
        </Row>
        {exportedFilename ? <EtaxImportGuide filename={exportedFilename} /> : null}
      </Col>
    </Card>
  );
};
