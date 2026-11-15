import {
  NON_TAXABLE_EXPENSE_CATEGORIES,
  Transaction,
  computeConsumptionReturn,
  filterYear,
} from "@etax/shared";
import { useMemo, useState } from "react";
import { Button, Card, Col, Input, Row, Select, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import { loadTaxpayer } from "@components/organisms/filing/TaxpayerProfilePanel";
import { ExportConsumptionXtxRequest } from "@types";
import { exportConsumptionXtxFile } from "@utils/api";
import { formatNumber } from "@utils";
import styles from "./ConsumptionTaxPanel.css";

interface ConsumptionForm {
  salesIncl10: number;
  salesIncl8: number;
  nontaxableSales: number;
  exemptSales: number;
  purchasesIncl10: number;
  purchasesIncl8: number;
  basePeriodSalesThousands: number;
  interimNational: number;
  interimLocal: number;
  originalNational: number;
  originalLocal: number;
}

type FormKey = keyof ConsumptionForm;

const AMOUNT_FIELDS: readonly { key: FormKey; label: string }[] = [
  { key: "salesIncl10", label: "課税売上（税込）・10%" },
  { key: "salesIncl8", label: "課税売上（税込）・軽減8%" },
  { key: "nontaxableSales", label: "非課税売上（対価の額）" },
  { key: "exemptSales", label: "免税売上（対価の額）" },
  { key: "purchasesIncl10", label: "課税仕入（税込）・10%" },
  { key: "purchasesIncl8", label: "課税仕入（税込）・軽減8%" },
  { key: "basePeriodSalesThousands", label: "基準期間の課税売上高（千円）" },
  { key: "interimNational", label: "中間納付税額（国税）" },
  { key: "interimLocal", label: "中間納付譲渡割額（地方）" },
];

const AMENDMENT_FIELDS: readonly { key: FormKey; label: string }[] = [
  { key: "originalNational", label: "既確定税額（国税）" },
  { key: "originalLocal", label: "既確定譲渡割額（地方）" },
];

export interface ConsumptionTaxPanelProps {
  transactions: Transaction[];
  year: number;
}

/**
 * 消費税申告書（一般用・本則）の作成パネル。
 * 初期値は帳簿からの概算（課税売上＝事業収入、課税仕入＝課税対象の経費）
 * で、税区分まで確定した金額に直してから出力するのが前提。
 * 課税売上割合95%以上は全額控除、それ以外は一括比例配分で計算される。
 */
export const ConsumptionTaxPanel = ({ transactions, year }: ConsumptionTaxPanelProps) => {
  const [taxpayer] = useState(() => loadTaxpayer(year).taxpayer);
  const [form, setForm] = useState<ConsumptionForm>(() =>
    estimateInitialValues(transactions, year),
  );
  const [filingKind, setFilingKind] = useState<1 | 3>(1);
  const [submissionDate, setSubmissionDate] = useState<string>(() => todayIso());
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preview = useMemo(
    () =>
      computeConsumptionReturn({
        salesIncl10: form.salesIncl10,
        salesIncl8: form.salesIncl8,
        nontaxableSales: form.nontaxableSales,
        exemptSales: form.exemptSales,
        purchasesIncl10: form.purchasesIncl10,
        purchasesIncl8: form.purchasesIncl8,
        interimNational: form.interimNational,
        interimLocal: form.interimLocal,
      }),
    [form],
  );

  const update = (key: FormKey, value: number) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleExport = async () => {
    setExporting(true);
    setMessage(null);
    setError(null);
    try {
      const request: ExportConsumptionXtxRequest = {
        taxpayer,
        period_from: `${year}-01-01`,
        period_to: `${year}-12-31`,
        submission_date: submissionDate,
        filing_kind: filingKind,
        base_period_sales_thousands: form.basePeriodSalesThousands,
        sales_incl_10: form.salesIncl10,
        sales_incl_8: form.salesIncl8,
        nontaxable_sales: form.nontaxableSales,
        exempt_sales: form.exemptSales,
        purchases_incl_10: form.purchasesIncl10,
        purchases_incl_8: form.purchasesIncl8,
        interim_national: form.interimNational,
        interim_local: form.interimLocal,
        original_national: filingKind === 3 ? form.originalNational : null,
        original_local: filingKind === 3 ? form.originalLocal : null,
      };
      const result = await exportConsumptionXtxFile(request);
      downloadTextFile(result.filename, result.xtx);
      setMessage(
        `${result.filename} をダウンロードしました（合計納付税額 ${formatNumber(result.total_payable)}円）。e-Taxソフト／WEB版に組み込んで内容を確認し、送信はご自身のマイナンバーカードで行ってください。`,
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
            消費税及び地方消費税の確定申告書（一般用）と付表1・2を作成します。初期値は帳簿
            からの概算です。出力前に、税区分ごとの確定金額（課税売上・課税仕入の税込合計）
            に必ず直してください。納税者情報は修正申告の画面で入力したものを使います。
            期限後申告も申告の種類は「確定」です。
          </Text>
          {taxpayer.name === "" ? (
            <Text variant="muted">
              納税者情報が未入力です。先に修正申告の画面の「納税者情報と e-Tax 出力」で
              氏名・住所・税務署名を入力してください。
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
            onChange={(e) => setFilingKind(Number(e.target.value) === 3 ? 3 : 1)}
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

        {AMOUNT_FIELDS.map((field) => (
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

        <Text>
          課税売上割合 {preview.ratio}%（{preview.fullDeduction ? "全額控除" : "一括比例配分"}）
          ・ 納付税額（国税）{formatNumber(preview.payableNational)}円 ・ 納付譲渡割額{" "}
          {formatNumber(preview.payableLocal)}円 ・ 合計 {formatNumber(preview.totalPayable)}円
        </Text>

        {error ? <AlertBox variant="error">{error}</AlertBox> : null}
        {message ? <AlertBox>{message}</AlertBox> : null}

        <Row gap="sm">
          <Button variant="primary" onClick={handleExport} disabled={exporting}>
            {exporting ? "出力中…" : "消費税のe-Tax用データを出力（XTX）"}
          </Button>
        </Row>
      </Col>
    </Card>
  );
};

interface AmountFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

const AmountField = ({ label, value, onChange }: AmountFieldProps) => (
  <Row gap="sm">
    <div className={styles.fieldLabel}>
      <Text variant="muted">{label}</Text>
    </div>
    <Input
      className={styles.fieldNumber}
      type="number"
      value={value}
      onChange={(e) => onChange(toAmount(e.target.value))}
      aria-label={label}
    />
  </Row>
);

/** 帳簿からの概算初期値。課税売上＝事業収入、非課税売上＝不動産収入、課税仕入＝課税対象経費。 */
function estimateInitialValues(transactions: Transaction[], year: number): ConsumptionForm {
  const yearTransactions = filterYear(transactions, year);
  let sales = 0;
  let nontaxable = 0;
  let purchases = 0;
  for (const t of yearTransactions) {
    const amount = Math.trunc(t.amount || 0);
    if (amount > 0 && t.income_type === "business") sales += amount;
    if (amount > 0 && t.income_type === "real_estate") nontaxable += amount;
    if (amount < 0 && !NON_TAXABLE_EXPENSE_CATEGORIES.has(t.category || "")) {
      purchases += -amount;
    }
  }
  return {
    salesIncl10: sales,
    salesIncl8: 0,
    nontaxableSales: nontaxable,
    exemptSales: 0,
    purchasesIncl10: purchases,
    purchasesIncl8: 0,
    basePeriodSalesThousands: 0,
    interimNational: 0,
    interimLocal: 0,
    originalNational: 0,
    originalLocal: 0,
  };
}

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
