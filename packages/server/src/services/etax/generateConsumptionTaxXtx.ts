/**
 * generateConsumptionTaxXtx.ts — 消費税申告書の XTX を生成する（services/etax）。
 * 入力は税区分まで確定した金額（税込）で受け、申告書の丸め・控除方式の判定は
 * @etax/shared の決定的な計算関数、組み立ては本則・簡易課税・2割特例の各ビルダー、
 * 最後に公式 XSD で検証する。
 */
import {
  SimplifiedCategory,
  SimplifiedConsumptionInput,
  Special20ConsumptionInput,
  buildConsumptionXtx,
  buildSimplifiedConsumptionXtx,
  buildSpecial20ConsumptionXtx,
  computeConsumptionReturn,
  computeSimplifiedConsumptionReturn,
  computeSpecial20ConsumptionReturn,
} from "@etax/shared";
import { ExportConsumptionXtxRequest } from "../../schemas/etax";
import { GeneratedXtx } from "./generateIncomeTaxXtx";
import { XtxInputError, toTaxpayer } from "./xtxInputs";
import { xsdWarningOrThrow } from "./xsdValidator";

/** 生成した消費税 XTX と、消費税及び地方消費税の合計（納付は正、還付は負）。 */
export interface GeneratedConsumptionXtx extends GeneratedXtx {
  totalPayable: number;
}

type ConsumptionMethod = NonNullable<ExportConsumptionXtxRequest["method"]>;

interface BuiltConsumptionXtx {
  xtx: string;
  totalPayable: number;
}

/** 方式に共通の申告書の見出し・修正申告の入力。 */
function commonData(body: ExportConsumptionXtxRequest) {
  return {
    taxpayer: toTaxpayer(body.taxpayer),
    periodFrom: body.period_from,
    periodTo: body.period_to,
    submissionDate: body.submission_date,
    filingKind: body.filing_kind,
    originalNational: body.original_national,
    originalLocal: body.original_local,
  };
}

/** 簡易課税・2割特例に共通の返還等・貸倒れ・中間納付の入力。 */
function adjustmentInputs(body: ExportConsumptionXtxRequest) {
  return {
    nontaxableSales: body.nontaxable_sales,
    exemptSales: body.exempt_sales,
    returnsIncl10: body.returns_incl_10 ?? 0,
    returnsIncl8: body.returns_incl_8 ?? 0,
    badDebtRecoveryTax10: body.bad_debt_recovery_tax_10 ?? 0,
    badDebtRecoveryTax8: body.bad_debt_recovery_tax_8 ?? 0,
    badDebtTax10: body.bad_debt_tax_10 ?? 0,
    badDebtTax8: body.bad_debt_tax_8 ?? 0,
    interimNational: body.interim_national,
    interimLocal: body.interim_local,
  };
}

function buildStandard(body: ExportConsumptionXtxRequest): BuiltConsumptionXtx {
  const input = {
    salesIncl10: body.sales_incl_10,
    salesIncl8: body.sales_incl_8,
    nontaxableSales: body.nontaxable_sales,
    exemptSales: body.exempt_sales,
    purchasesIncl10: body.purchases_incl_10,
    purchasesIncl8: body.purchases_incl_8,
    interimNational: body.interim_national,
    interimLocal: body.interim_local,
  };
  const result = computeConsumptionReturn(input);
  const xtx = buildConsumptionXtx({
    ...commonData(body),
    basePeriodSalesThousands: body.base_period_sales_thousands,
    input,
    result,
  });
  return { xtx, totalPayable: result.totalPayable };
}

function buildSimplified(body: ExportConsumptionXtxRequest): BuiltConsumptionXtx {
  // 事業区分ごとの売上が無ければ、全売上を business_category（既定は第5種）に寄せる
  const salesByCategory: SimplifiedConsumptionInput["salesByCategory"] = {};
  if (body.sales_by_category) {
    for (const [key, value] of Object.entries(body.sales_by_category)) {
      salesByCategory[Number(key) as SimplifiedCategory] = { incl10: value.incl_10, incl8: value.incl_8 };
    }
  } else {
    salesByCategory[body.business_category ?? 5] = { incl10: body.sales_incl_10, incl8: body.sales_incl_8 };
  }
  const input: SimplifiedConsumptionInput = { salesByCategory, ...adjustmentInputs(body) };
  const result = computeSimplifiedConsumptionReturn(input);
  const xtx = buildSimplifiedConsumptionXtx({
    ...commonData(body),
    basePeriodSales: body.base_period_sales_thousands * 1000,
    input,
    result,
  });
  return { xtx, totalPayable: result.totalPayable };
}

function buildSpecial20(body: ExportConsumptionXtxRequest): BuiltConsumptionXtx {
  const input: Special20ConsumptionInput = {
    salesIncl10: body.sales_incl_10,
    salesIncl8: body.sales_incl_8,
    ...adjustmentInputs(body),
  };
  const result = computeSpecial20ConsumptionReturn(input);
  const xtx = buildSpecial20ConsumptionXtx({
    ...commonData(body),
    basePeriodSalesThousands: body.base_period_sales_thousands,
    input,
    result,
  });
  return { xtx, totalPayable: result.totalPayable };
}

/** 方式ごとのビルダーと、ファイル名に付ける方式の印。 */
const METHOD_BUILDERS: Record<
  ConsumptionMethod,
  { build: (body: ExportConsumptionXtxRequest) => BuiltConsumptionXtx; fileSuffix: string }
> = {
  standard: { build: buildStandard, fileSuffix: "" },
  simplified: { build: buildSimplified, fileSuffix: "-kanni" },
  special20: { build: buildSpecial20, fileSuffix: "-special20" },
};

/**
 * 消費税申告書の XTX を生成して公式 XSD で検証する。入力が原因で組み立てられ
 * なければ XtxInputError、スキーマ違反なら XtxXsdInvalidError を投げる。
 */
export async function generateConsumptionTaxXtx(
  body: ExportConsumptionXtxRequest,
): Promise<GeneratedConsumptionXtx> {
  const method = METHOD_BUILDERS[body.method ?? "standard"];
  let built: BuiltConsumptionXtx;
  try {
    built = method.build(body);
  } catch (e) {
    throw new XtxInputError(e instanceof Error ? e.message : "消費税XTXの生成に失敗しました");
  }
  const year = body.period_from.slice(0, 4);
  const kind = body.filing_kind === 3 ? "-shusei" : "-kakutei";
  return {
    filename: `etax-shohi-${year}${method.fileSuffix}${kind}.xtx`,
    xtx: built.xtx,
    totalPayable: built.totalPayable,
    xsdWarning: await xsdWarningOrThrow(built.xtx),
  };
}
