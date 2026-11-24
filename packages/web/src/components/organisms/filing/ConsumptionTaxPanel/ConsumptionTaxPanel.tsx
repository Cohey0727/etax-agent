import {
  ConsumptionReturn,
  ConsumptionTaxSummary,
  Transaction,
  computeConsumptionReturn,
  summarizeConsumptionTax,
} from "@etax/shared";
import { useEffect, useMemo, useState } from "react";
import { Button, Card, Col, Input, Row, Select, Text } from "@components/atoms";
import { AlertBox } from "@components/molecules";
import {
  emptyTaxpayer,
  loadTaxpayer,
} from "@components/organisms/filing/TaxpayerProfilePanel";
import { ExportConsumptionXtxRequest, XtxTaxpayerInput } from "@types";
import { exportConsumptionXtxFile } from "@utils/api";
import { formatNumber, formatYen } from "@utils";
import { AmountField } from "./AmountField";
import {
  AMENDMENT_FIELDS,
  EDITABLE_FIELDS,
  EditableForm,
  EditableKey,
  SUMMARY_ROWS,
} from "./consumptionTaxFields";
import {
  deriveBasePeriodSalesThousands,
  downloadTextFile,
  outputTaxBacking,
  toAmount,
  todayIso,
} from "./consumptionTaxHelpers";
import styles from "./ConsumptionTaxPanel.css";

export interface ConsumptionTaxPanelProps {
  transactions: Transaction[];
  year: number;
  /**
   * 帳簿画面をこの年度＋警告種別のフィルターで開く（税区分の警告からの遷移）。
   * kind: "mismatch" = 税区分と符号の不一致、"taxUnset" = 税区分が未設定。
   */
  onOpenLedger?: (kind: "mismatch" | "taxUnset") => void;
}

/**
 * 消費税申告書（一般用・本則）の作成パネル。
 * 売上・仕入の金額は自由入力ではなく、帳簿の税区分集計から決める
 * （帳簿と申告が食い違わないようにするため）。手入力するのは
 * 基準期間・中間納付・既確定税額など、帳簿の外にある数字だけ。
 * 課税売上割合95%以上は全額控除、それ以外は一括比例配分で計算される。
 */
export const ConsumptionTaxPanel = ({ transactions, year, onOpenLedger }: ConsumptionTaxPanelProps) => {
  const [taxpayer, setTaxpayer] = useState<XtxTaxpayerInput>(() => emptyTaxpayer());

  // 納税者プロフィール（DB保存）を読み込む。出力するXTXの見出しに使う。
  useEffect(() => {
    let cancelled = false;
    loadTaxpayer(year).then((loadedProfile) => {
      if (!cancelled) setTaxpayer(loadedProfile.taxpayer);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

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
  const resultRows: readonly { label: string; value: string; backing: string }[] = [
    {
      label: "課税売上割合",
      value: `${preview.ratio}%`,
      backing:
        `課税売上高（税抜）${formatYen(preview.salesExcl)} ÷ 売上高の合計（税抜）` +
        `${formatYen(preview.totalSalesExcl)} ・ ${preview.fullDeduction ? "全額控除" : "一括比例配分"}`,
    },
    {
      label: "課税標準額",
      value: formatYen(preview.taxBase),
      backing: "課税売上高（税抜）の千円未満を切り捨て",
    },
    {
      label: "消費税額",
      value: formatYen(preview.outputTax),
      backing: outputTaxBacking(preview),
    },
    {
      label: "控除対象仕入税額",
      value: formatYen(preview.inputTax),
      backing: preview.fullDeduction
        ? `課税仕入にかかる消費税額 ${formatYen(preview.inputTaxRaw10 + preview.inputTaxRaw8)} の全額`
        : `課税仕入にかかる消費税額 ${formatYen(preview.inputTaxRaw10 + preview.inputTaxRaw8)} × 課税売上割合 ${preview.ratio}%`,
    },
    preview.refundNational > 0
      ? {
          label: "還付税額（国税）",
          value: formatYen(preview.refundNational),
          backing: `消費税額 ${formatYen(preview.outputTax)} − 控除対象仕入税額 ${formatYen(preview.inputTax)}`,
        }
      : {
          label: "納付税額（国税）",
          value: formatYen(preview.payableNational),
          backing:
            `消費税額 ${formatYen(preview.outputTax)} − 控除対象仕入税額 ${formatYen(preview.inputTax)}` +
            ` = ${formatYen(preview.diffNational)}` +
            (form.interimNational > 0 ? ` − 中間納付 ${formatYen(form.interimNational)}` : ""),
        },
    preview.refundLocal > 0
      ? {
          label: "還付譲渡割額（地方）",
          value: formatYen(preview.refundLocal),
          backing: `還付税額（国税）× 22/78`,
        }
      : {
          label: "納付譲渡割額（地方）",
          value: formatYen(preview.payableLocal),
          backing:
            `差引税額（国税）${formatYen(preview.diffNational)} × 22/78 = ${formatYen(preview.localTaxGross)}` +
            (form.interimLocal > 0 ? ` − 中間納付 ${formatYen(form.interimLocal)}` : ""),
        },
    {
      label: "合計",
      value: formatYen(preview.totalPayable),
      backing: `国税 ${formatYen(preview.payableNational)} ＋ 地方 ${formatYen(preview.payableLocal)}`,
    },
  ];

  const update = (key: EditableKey, value: number) => {
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

        <Text className={styles.subhead}>帳簿からの集計（自動）</Text>
        {SUMMARY_ROWS.map((row) => (
          <Row key={row.key} gap="sm">
            <div className={styles.fieldLabel}>
              <Text variant="muted">{row.label}</Text>
            </div>
            <Text className={styles.amountValue}>{formatYen(summary[row.key])}</Text>
          </Row>
        ))}
        {summary.unsetCount > 0 ? (
          <AlertBox variant="notice">
            <Row gap="sm" align="center" justify="spaceBetween" wrap>
              <Text>
                税区分が未設定の取引が {summary.unsetCount} 件（合計 {formatYen(summary.unsetAmount)}
                ）あります。集計に含まれていません。
              </Text>
              {onOpenLedger ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenLedger("taxUnset")}
                >
                  帳簿で確認する →
                </Button>
              ) : null}
            </Row>
          </AlertBox>
        ) : null}
        {summary.excludedCount > 0 ? (
          <AlertBox variant="notice">
            <Row gap="sm" align="center" justify="spaceBetween" wrap>
              <Text>
                税区分と金額の符号が不一致の取引が {summary.excludedCount} 件（合計{" "}
                {formatYen(summary.excludedAmount)}）あります。集計に含まれていません。
              </Text>
              {onOpenLedger ? (
                <Button variant="ghost" size="sm" onClick={() => onOpenLedger("mismatch")}>
                  帳簿で確認する →
                </Button>
              ) : null}
            </Row>
          </AlertBox>
        ) : null}

        <Text className={styles.subhead}>帳簿の外の数字（入力）</Text>
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

        <Text className={styles.subhead}>計算結果</Text>
        {resultRows.map((row) => (
          <Col key={row.label} gap="sm">
            <Row gap="sm">
              <div className={styles.fieldLabel}>
                <Text variant="muted">{row.label}</Text>
              </div>
              <Text className={styles.amountValue}>{row.value}</Text>
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

        <Row gap="sm">
          <Button variant="primary" onClick={handleExport} disabled={exporting} disabledReason="出力中です">
            {exporting ? "出力中…" : "消費税のe-Tax用データを出力（XTX）"}
          </Button>
        </Row>
      </Col>
    </Card>
  );
};
