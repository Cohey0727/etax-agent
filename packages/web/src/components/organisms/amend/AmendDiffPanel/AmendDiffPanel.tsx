import {
  amendmentDelta,
  computeCorrectedFigures,
  computeIncomeTax,
  DeductionInputs,
  filterYear,
  SAMPLE_ORIGINAL_2024,
  TaxCreditInputs,
  Transaction,
} from "@etax/shared";
import { useMemo, useState } from "react";
import { Button, Card, Col, Input, Row, Table, TableCell, TableHeaderCell, Text } from "@components/atoms";
import { DeductionPanel } from "@components/organisms/filing/DeductionPanel";
import {
  DeductionState,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { TaxCreditPanel } from "@components/organisms/filing/TaxCreditPanel";
import { TaxpayerPanel } from "@components/organisms/filing/TaxpayerPanel";
import { formatNumber } from "@utils";
import styles from "./AmendDiffPanel.css";

/** フォームで扱う金額項目（所得税額だけは未入力があり得るため別扱い）。 */
type FigureKey =
  | "business_revenue"
  | "business_expenses"
  | "real_estate_revenue"
  | "real_estate_expenses"
  | "blue_deduction"
  | "housing_loan_credit";

interface FigureForm {
  business_revenue: number;
  business_expenses: number;
  real_estate_revenue: number;
  real_estate_expenses: number;
  blue_deduction: number;
  housing_loan_credit: number;
  /** 所得税額。null は未入力（未計算）。 */
  income_tax: number | null;
}

const FIELD_SECTIONS: readonly {
  title: string;
  fields: readonly { key: FigureKey; label: string }[];
}[] = [
  {
    title: "収入・経費",
    fields: [
      { key: "business_revenue", label: "事業収入" },
      { key: "business_expenses", label: "事業経費" },
      { key: "real_estate_revenue", label: "不動産収入" },
      { key: "real_estate_expenses", label: "不動産経費" },
    ],
  },
  {
    title: "控除",
    fields: [
      { key: "blue_deduction", label: "青色申告特別控除" },
      { key: "housing_loan_credit", label: "住宅ローン控除" },
    ],
  },
];

export interface AmendDiffPanelProps {
  transactions: Transaction[];
  year: number;
}

export const AmendDiffPanel = ({ transactions, year }: AmendDiffPanelProps) => {
  const yearTransactions = useMemo(() => filterYear(transactions, year), [transactions, year]);
  const computed = useMemo(
    () => computeCorrectedFigures(yearTransactions, year),
    [yearTransactions, year],
  );
  const [original, setOriginal] = useState<FigureForm>(() => loadOriginal(year));
  const [correctedEdits, setCorrectedEdits] = useState<Partial<Record<FigureKey, number>>>({});
  const [correctedTax, setCorrectedTax] = useState<number | null>(null);
  const [diffOnly, setDiffOnly] = useState(true);
  const [deductionState, setDeductionState] = useState<DeductionState>(() =>
    loadDeductionState(year),
  );

  const updateDeductions = (next: DeductionInputs) => {
    const state = { ...deductionState, deductions: next };
    setDeductionState(state);
    saveDeductionState(year, state);
  };
  const updateTaxCredits = (next: TaxCreditInputs) => {
    const state = { ...deductionState, taxCredits: next };
    setDeductionState(state);
    saveDeductionState(year, state);
  };

  // 所得税額（修正後）は、青色控除後の所得合計に控除・税額控除を適用して自動計算する。
  const totalIncome = computed._detail.business_income + computed._detail.real_estate_income;
  const taxResult = useMemo(
    () =>
      computeIncomeTax({
        year,
        totalIncome,
        deductions: deductionState.deductions,
        taxCredits: deductionState.taxCredits,
      }),
    [year, totalIncome, deductionState],
  );

  // 修正後は取引データからの自動計算が既定値。欄を書き換えた項目だけ上書きされる。
  const corrected: FigureForm = {
    business_revenue: correctedEdits.business_revenue ?? computed.business_revenue,
    business_expenses: correctedEdits.business_expenses ?? computed.business_expenses,
    real_estate_revenue: correctedEdits.real_estate_revenue ?? computed.real_estate_revenue,
    real_estate_expenses: correctedEdits.real_estate_expenses ?? computed.real_estate_expenses,
    blue_deduction: correctedEdits.blue_deduction ?? computed.blue_deduction,
    housing_loan_credit: correctedEdits.housing_loan_credit ?? taxResult.taxCredits.housingLoan,
    income_tax: correctedTax ?? taxResult.finalTax,
  };

  const delta = amendmentDelta(toRecord(original, year), toRecord(corrected, year), year);
  const changedCount = Object.keys(delta.fieldDiffs).length;

  const updateOriginal = (key: FigureKey, value: number) => {
    const next = { ...original, [key]: value };
    setOriginal(next);
    saveOriginal(year, next);
  };
  const updateOriginalTax = (value: number | null) => {
    const next = { ...original, income_tax: value };
    setOriginal(next);
    saveOriginal(year, next);
  };

  const derivedRows: readonly { label: string; original: number; corrected: number }[] = [
    {
      label: "事業所得（収入−経費）",
      original: original.business_revenue - original.business_expenses,
      corrected: corrected.business_revenue - corrected.business_expenses,
    },
    {
      label: "不動産所得（収入−経費）",
      original: original.real_estate_revenue - original.real_estate_expenses,
      corrected: corrected.real_estate_revenue - corrected.real_estate_expenses,
    },
    {
      label: "所得合計（青色控除後）",
      original:
        original.business_revenue -
        original.business_expenses +
        (original.real_estate_revenue - original.real_estate_expenses) -
        original.blue_deduction,
      corrected:
        corrected.business_revenue -
        corrected.business_expenses +
        (corrected.real_estate_revenue - corrected.real_estate_expenses) -
        corrected.blue_deduction,
    },
  ];

  return (
    <Col gap="md">
      <Card>
        <Col gap="md">
          <Col gap="sm">
            <Text variant="sectionTitle">{year}年分 修正申告 — 申告済み vs 修正後</Text>
            <Text variant="muted">
              申告済みの数字を左の欄に入力してください。修正後は現在の取引データから自動計算されます
              （違う場合はそのまま書き換えられます）。所得控除・税額控除はこの下のパネルで入力し、
              所得税額（修正後）と住宅ローン控除（修正後）はそこから自動計算されます。住宅ローン控除が
              対象外の年は、税額控除パネルの住宅借入金等特別控除を空欄（0）のままにしてください。
              入力内容はこの端末に保存されます。
            </Text>
          </Col>

          {delta.taxDelta !== null ? (
            <Text variant="sectionTitle">
              税額の増減: {formatDiff(delta.taxDelta)}円（
              {delta.taxDelta > 0 ? "追加で納める方向" : delta.taxDelta < 0 ? "還付の方向" : "増減なし"}
              ）・ 差分のある項目 {changedCount}件
            </Text>
          ) : (
            <Text variant="muted">
              所得税額（申告済み）を入力すると、税額の増減がここに出ます。・ 差分のある項目{" "}
              {changedCount}件
            </Text>
          )}

          <Row gap="sm">
            <Button variant={diffOnly ? "tab" : "tabActive"} size="sm" onClick={() => setDiffOnly(false)}>
              すべて表示
            </Button>
            <Button variant={diffOnly ? "tabActive" : "tab"} size="sm" onClick={() => setDiffOnly(true)}>
              差分のみ
            </Button>
          </Row>

          <Table>
            <thead>
              <tr>
                <TableHeaderCell>項目</TableHeaderCell>
                <TableHeaderCell align="right">申告済み（入力）</TableHeaderCell>
                <TableHeaderCell align="right">修正後（自動計算）</TableHeaderCell>
                <TableHeaderCell align="right">差分</TableHeaderCell>
              </tr>
            </thead>
            <tbody>
              {FIELD_SECTIONS.map((section) => {
                const rows = section.fields
                  .map((field) => ({
                    ...field,
                    originalValue: original[field.key],
                    correctedValue: corrected[field.key],
                    diff: corrected[field.key] - original[field.key],
                  }))
                  .filter((row) => !diffOnly || row.diff !== 0);
                if (rows.length === 0) return null;
                return [
                  <tr key={`section-${section.title}`}>
                    <TableCell colSpan={4} className={styles.sectionCell}>
                      {section.title}
                    </TableCell>
                  </tr>,
                  ...rows.map((row) => (
                    <tr key={row.key} className={row.diff !== 0 ? styles.rowChanged : undefined}>
                      <TableCell>{row.label}</TableCell>
                      <TableCell align="right">
                        <Input
                          className={styles.numberInput}
                          type="number"
                          value={row.originalValue}
                          onChange={(e) => updateOriginal(row.key, toAmount(e.target.value))}
                          aria-label={`${row.label}（申告済み）`}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Input
                          className={styles.numberInput}
                          type="number"
                          value={row.correctedValue}
                          onChange={(e) =>
                            setCorrectedEdits((edits) => ({
                              ...edits,
                              [row.key]: toAmount(e.target.value),
                            }))
                          }
                          aria-label={`${row.label}（修正後）`}
                        />
                      </TableCell>
                      <TableCell
                        align="right"
                        tone={row.diff > 0 ? "negative" : row.diff < 0 ? "positive" : "default"}
                      >
                        {formatDiff(row.diff)}
                      </TableCell>
                    </tr>
                  )),
                ];
              })}
              {(() => {
                const rows = derivedRows.filter(
                  (row) => !diffOnly || row.corrected - row.original !== 0,
                );
                if (rows.length === 0) return null;
                return [
                  <tr key="section-income">
                    <TableCell colSpan={4} className={styles.sectionCell}>
                      所得（自動計算）
                    </TableCell>
                  </tr>,
                  ...rows.map((row) => {
                    const diff = row.corrected - row.original;
                    return (
                      <tr key={row.label} className={diff !== 0 ? styles.rowChanged : undefined}>
                        <TableCell>{row.label}</TableCell>
                        <TableCell align="right">{formatNumber(row.original)}</TableCell>
                        <TableCell align="right">{formatNumber(row.corrected)}</TableCell>
                        <TableCell
                          align="right"
                          tone={diff > 0 ? "negative" : diff < 0 ? "positive" : "default"}
                        >
                          {formatDiff(diff)}
                        </TableCell>
                      </tr>
                    );
                  }),
                ];
              })()}
              <tr>
                <TableCell colSpan={4} className={styles.sectionCell}>
                  税額
                </TableCell>
              </tr>
              <tr
                className={
                  original.income_tax !== null &&
                  corrected.income_tax !== null &&
                  corrected.income_tax - original.income_tax !== 0
                    ? styles.rowChanged
                    : undefined
                }
              >
                <TableCell>所得税額</TableCell>
                <TableCell align="right">
                  <Input
                    className={styles.numberInput}
                    type="number"
                    value={original.income_tax ?? ""}
                    onChange={(e) =>
                      updateOriginalTax(e.target.value === "" ? null : toAmount(e.target.value))
                    }
                    aria-label="所得税額（申告済み）"
                  />
                </TableCell>
                <TableCell align="right">
                  <Input
                    className={styles.numberInput}
                    type="number"
                    value={corrected.income_tax ?? ""}
                    onChange={(e) =>
                      setCorrectedTax(e.target.value === "" ? null : toAmount(e.target.value))
                    }
                    aria-label="所得税額（修正後）"
                  />
                </TableCell>
                <TableCell
                  align="right"
                  tone={
                    delta.taxDelta !== null && delta.taxDelta > 0
                      ? "negative"
                      : delta.taxDelta !== null && delta.taxDelta < 0
                        ? "positive"
                        : "default"
                  }
                >
                  {delta.taxDelta === null ? "—" : formatDiff(delta.taxDelta)}
                </TableCell>
              </tr>
            </tbody>
          </Table>

          <Text variant="muted">
            消費税（修正後の取引から計算・参考）: 本則 {formatNumber(computed.consumption_tax_standard)}
            円 / 簡易課税 {formatNumber(computed.consumption_tax_simplified)}円 / 2割特例{" "}
            {formatNumber(computed.consumption_tax_special20)}円
          </Text>
        </Col>
      </Card>

      <DeductionPanel
        year={year}
        deductions={deductionState.deductions}
        breakdown={taxResult.deductions}
        onChange={updateDeductions}
      />
      <TaxCreditPanel
        taxCredits={deductionState.taxCredits}
        result={taxResult}
        onChange={updateTaxCredits}
      />
      <TaxpayerPanel
        year={year}
        transactions={yearTransactions}
        deductions={deductionState.deductions}
        taxCredits={deductionState.taxCredits}
        originalIncomeTax={original.income_tax}
      />
    </Col>
  );
};

function toRecord(form: FigureForm, year: number): Record<string, unknown> {
  const record: Record<string, unknown> = {
    year,
    business_revenue: form.business_revenue,
    business_expenses: form.business_expenses,
    real_estate_revenue: form.real_estate_revenue,
    real_estate_expenses: form.real_estate_expenses,
    blue_deduction: form.blue_deduction,
    housing_loan_credit: form.housing_loan_credit,
  };
  if (form.income_tax !== null) record.income_tax = form.income_tax;
  return record;
}

function toAmount(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function storageKey(year: number): string {
  return `etax-amend-original-${year}`;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0;
}

function loadOriginal(year: number): FigureForm {
  try {
    const raw = localStorage.getItem(storageKey(year));
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        business_revenue: num(parsed.business_revenue),
        business_expenses: num(parsed.business_expenses),
        real_estate_revenue: num(parsed.real_estate_revenue),
        real_estate_expenses: num(parsed.real_estate_expenses),
        blue_deduction: num(parsed.blue_deduction),
        housing_loan_credit: num(parsed.housing_loan_credit),
        income_tax:
          typeof parsed.income_tax === "number" && Number.isFinite(parsed.income_tax)
            ? Math.trunc(parsed.income_tax)
            : null,
      };
    }
  } catch {
    // 保存値が読めない場合は初期値にフォールバックする。
  }
  if (year === 2024) {
    return {
      business_revenue: num(SAMPLE_ORIGINAL_2024.business_revenue),
      business_expenses: num(SAMPLE_ORIGINAL_2024.business_expenses),
      real_estate_revenue: num(SAMPLE_ORIGINAL_2024.real_estate_revenue),
      real_estate_expenses: num(SAMPLE_ORIGINAL_2024.real_estate_expenses),
      blue_deduction: num(SAMPLE_ORIGINAL_2024.blue_deduction),
      housing_loan_credit: num(SAMPLE_ORIGINAL_2024.housing_loan_credit),
      income_tax: num(SAMPLE_ORIGINAL_2024.income_tax),
    };
  }
  return {
    business_revenue: 0,
    business_expenses: 0,
    real_estate_revenue: 0,
    real_estate_expenses: 0,
    blue_deduction: 0,
    housing_loan_credit: 0,
    income_tax: null,
  };
}

function saveOriginal(year: number, form: FigureForm): void {
  try {
    localStorage.setItem(storageKey(year), JSON.stringify(form));
  } catch {
    // 保存できない環境ではそのまま編集を続ける。
  }
}

function formatDiff(d: number): string {
  return `${d > 0 ? "+" : ""}${formatNumber(d)}`;
}
