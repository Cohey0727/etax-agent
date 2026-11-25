#!/usr/bin/env bun
/**
 * cli.ts — スタンドアロン計算 CLI（計算は packages/shared の実装を使う）。
 *
 * サブコマンド:
 *   aggregate   --year YYYY --csv FILE [--filing-type blue65|blue55|blue10|white]
 *       事業所得/不動産所得の集計と青色申告特別控除を表示する。
 *   consumption --year YYYY --csv FILE [--business-kind KIND]
 *       消費税を 本則 / 簡易課税 / 2割特例 の3方式で比較表示する。
 *       KIND は簡易課税の事業区分（wholesale/retail/manufacturing/other/
 *       services/real_estate、既定は services=第5種）。
 *   amend       --year YYYY --original ORIG.json [--corrected CORR.json] [--csv FILE]
 *               [--filing-type ...]
 *       申告済みと修正後の差分（項目別＋税額の増減）を表示する。
 *       --csv を渡すと修正後の数値を取引データから計算する
 *       （所得の切り分け→青色申告特別控除→消費税3方式の比較）。
 *       --corrected も併せて渡した場合は、その値が計算結果より優先される。
 *       所得税額など取引から計算できない項目は申告済みの値を引き継ぎ、
 *       差分対象外とする。
 *
 * 計算系サブコマンドは API キー不要で動く。
 * 最終提出は本ツールでは行わない（e-Tax 提出は納税者本人の操作）。
 * 対話型エージェントは Web 版（packages/server の /api/agent/chat）が担う。
 */
import {
  SIMPLIFIED_RATES,
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  computeCorrectedFigures,
  consumptionTax,
  estimateInputTax,
  filterYear,
  importCsvText,
  residentialRentTotal,
  taxableSalesFromBreakdown,
  type BusinessKind,
  type ConsumptionMethod,
  type CorrectedFiguresDetail,
  type FilingType,
  type Transaction,
} from "@etax/shared";

const USAGE = `使い方: cli <aggregate|consumption|amend> [オプション]
  aggregate   --year YYYY --csv FILE [--filing-type blue65|blue55|blue10|white]
  consumption --year YYYY --csv FILE [--business-kind wholesale|retail|manufacturing|other|services|real_estate]
  amend       --year YYYY --original ORIG.json [--corrected CORR.json] [--csv FILE] [--filing-type ...]
  （--key=value 形式も可。--help / -h でこの使い方を表示）`;

class UsageError extends Error {}

function yen(n: number): string {
  return `${Math.trunc(n).toLocaleString("en-US")}円`;
}

/** Python の repr 風表示（非数値差分の表示用）。 */
function pyRepr(v: unknown): string {
  if (typeof v === "string") return `'${v}'`;
  if (v === null || v === undefined) return "None";
  return String(v);
}

interface CliOptions {
  year?: number;
  csv?: string;
  original?: string;
  corrected?: string;
  filingType?: FilingType;
  businessKind?: BusinessKind;
}

const FILING_TYPE_VALUES: readonly string[] = ["blue65", "blue55", "blue10", "white"];
const BUSINESS_KIND_VALUES: readonly string[] = Object.keys(SIMPLIFIED_RATES);

function parseOptions(argv: string[]): CliOptions {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) throw new UsageError(`不明な引数です: ${a}`);
    // --key=value 形式と --key value 形式の両方を受ける。
    const eq = a.indexOf("=");
    const key = eq >= 0 ? a.slice(2, eq) : a.slice(2);
    if (!["year", "csv", "original", "corrected", "filing-type", "business-kind"].includes(key)) {
      throw new UsageError(`不明なオプションです: --${key}`);
    }
    if (eq >= 0) {
      raw[key] = a.slice(eq + 1);
      continue;
    }
    const val = argv[i + 1];
    // 値が無い、または次のオプションが値の位置に来たらエラーにする
    // （フラグ文字列を値として飲み込まない）。
    if (val === undefined || val.startsWith("--")) {
      throw new UsageError(`オプション --${key} に値がありません`);
    }
    raw[key] = val;
    i++;
  }
  const opts: CliOptions = {};
  if (raw["year"] !== undefined) {
    // Number("") === 0 や負数を素通ししないよう、4桁の西暦として厳密に見る。
    if (!/^\d{4}$/.test(raw["year"])) {
      throw new UsageError(`--year は4桁の西暦で指定してください: ${raw["year"]}`);
    }
    const y = Number(raw["year"]);
    if (y < 1900 || y > 2100) throw new UsageError(`--year が範囲外です: ${raw["year"]}`);
    opts.year = y;
  }
  if (raw["csv"] !== undefined) opts.csv = raw["csv"];
  if (raw["original"] !== undefined) opts.original = raw["original"];
  if (raw["corrected"] !== undefined) opts.corrected = raw["corrected"];
  if (raw["filing-type"] !== undefined) {
    if (!FILING_TYPE_VALUES.includes(raw["filing-type"])) {
      throw new UsageError(`--filing-type が不正です: ${raw["filing-type"]}（${FILING_TYPE_VALUES.join(" / ")}）`);
    }
    opts.filingType = raw["filing-type"] as FilingType;
  }
  if (raw["business-kind"] !== undefined) {
    if (!BUSINESS_KIND_VALUES.includes(raw["business-kind"])) {
      throw new UsageError(`--business-kind が不正です: ${raw["business-kind"]}（${BUSINESS_KIND_VALUES.join(" / ")}）`);
    }
    opts.businessKind = raw["business-kind"] as BusinessKind;
  }
  return opts;
}

function requireOpt<T>(v: T | undefined, flag: string): T {
  if (v === undefined) throw new UsageError(`必須オプションがありません: ${flag}`);
  return v;
}

async function loadYearTransactions(csvPath: string, year: number): Promise<Transaction[]> {
  // 銀行CSVに多い Shift_JIS も読めるようにする（サーバー側 csvDecoding と
  // 同じ方針: UTF-8 で厳密に試し、壊れるなら Shift_JIS）。
  const bytes = new Uint8Array(await Bun.file(csvPath).arrayBuffer());
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder("shift_jis").decode(bytes);
  }
  return filterYear(importCsvText(text), year);
}

async function readJson(path: string): Promise<Record<string, unknown>> {
  const text = await Bun.file(path).text();
  const data: unknown = JSON.parse(text);
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(`${path}: JSONオブジェクトではありません`);
  }
  return data as Record<string, unknown>;
}

async function cmdAggregate(opts: CliOptions): Promise<number> {
  const year = requireOpt(opts.year, "--year");
  const csv = requireOpt(opts.csv, "--csv");
  const tx = await loadYearTransactions(csv, year);
  if (tx.length === 0) {
    console.error(`${year}年の取引がありませんでした。`);
    return 1;
  }
  const b = aggregateIncome(tx);
  const blue = blueDeduction(b.realEstateIncome, b.businessIncome, {
    filingType: opts.filingType,
  });
  console.log(`== ${year}年 所得集計（税込経理） ==`);
  console.log(`事業収入        : ${yen(b.businessRevenue)}`);
  console.log(`事業経費        : ${yen(b.businessExpenses)}`);
  console.log(`事業所得（控除前）: ${yen(b.businessIncome)}`);
  console.log(`不動産収入      : ${yen(b.realEstateRevenue)}`);
  console.log(`不動産経費      : ${yen(b.realEstateExpenses)}`);
  console.log(`不動産所得（控除前）: ${yen(b.realEstateIncome)}`);
  console.log("-- 青色申告特別控除（不動産→事業の順）--");
  console.log(`不動産分        : ${yen(blue.realEstate)}`);
  console.log(`事業分          : ${yen(blue.business)}`);
  console.log(`合計            : ${yen(blue.total)}`);
  console.log(`事業所得（控除後）: ${yen(b.businessIncome - blue.business)}`);
  console.log(`不動産所得（控除後）: ${yen(b.realEstateIncome - blue.realEstate)}`);
  return 0;
}

async function cmdConsumption(opts: CliOptions): Promise<number> {
  const year = requireOpt(opts.year, "--year");
  const csv = requireOpt(opts.csv, "--csv");
  const tx = await loadYearTransactions(csv, year);
  if (tx.length === 0) {
    console.error(`${year}年の取引がありませんでした。`);
    return 1;
  }
  const b = aggregateIncome(tx);
  const rent = residentialRentTotal(tx);
  const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
  const inputTax = estimateInputTax(tx);
  const businessKind = opts.businessKind ?? "services";
  console.log(`== ${year}年 消費税（税込経理・税率10%） ==`);
  console.log(`課税売上（税込）  : ${yen(taxable)}`);
  console.log(`非課税売上（住宅家賃）: ${yen(nontaxable)}`);
  console.log(`仕入税額（経費からの概算）: ${yen(inputTax)}`);
  const methods: [ConsumptionMethod, string][] = [
    ["standard", "本則課税"],
    [
      "simplified",
      `簡易課税（みなし仕入率${Math.round(SIMPLIFIED_RATES[businessKind] * 100)}%・事業区分 ${businessKind}）`,
    ],
    ["special20", "2割特例"],
  ];
  for (const [method, label] of methods) {
    const r = consumptionTax({
      taxableSalesIncl: taxable,
      nontaxableSalesIncl: nontaxable,
      inputTax,
      method,
      businessKind,
    });
    console.log(`${label}: 売上税額 ${yen(r.outputTax)} → 納付税額 ${yen(r.payable)}`);
  }
  console.log("※ 仕入税額は概算です。2割特例・簡易課税の適用可否は要件確認が必要です。");
  return 0;
}

async function cmdAmend(opts: CliOptions): Promise<number> {
  const year = requireOpt(opts.year, "--year");
  const originalPath = requireOpt(opts.original, "--original");
  const original = await readJson(originalPath);

  let corrected: Record<string, unknown> | null = null;
  const carried: string[] = []; // 申告済みから値を引き継いだ（差分対象外の）項目
  let detail: CorrectedFiguresDetail | null = null;

  if (opts.csv !== undefined) {
    const tx = await loadYearTransactions(opts.csv, year);
    if (tx.length === 0) {
      console.error(`${year}年の取引がありませんでした。`);
      return 1;
    }
    const figs = computeCorrectedFigures(tx, year, { filingType: opts.filingType });
    corrected = figs;
    detail = figs._detail;
  }
  if (opts.corrected !== undefined) {
    const explicit = await readJson(opts.corrected);
    if (corrected === null) {
      corrected = explicit;
    } else {
      Object.assign(corrected, explicit); // 明示指定のJSONが計算結果より優先
    }
  }
  if (corrected === null) {
    console.error("エラー: --corrected か --csv のどちらかが必要です。");
    return 2;
  }

  if (opts.csv !== undefined) {
    // 所得税額・住宅借入金等特別控除など、取引データから計算できない項目は
    // 申告済みの値を引き継いで差分対象外にする（黙って 0 との差分に
    // してしまうと、存在しない税額の増減が表示されてしまうため）。
    for (const [k, v] of Object.entries(original)) {
      if (!(k in corrected) && !k.startsWith("_")) {
        corrected[k] = v;
        carried.push(k);
      }
    }
  }

  const d = amendmentDelta(original, corrected, year);
  console.log(`== ${year}年 修正申告 差分 ==`);
  if (opts.csv !== undefined && detail !== null) {
    // 表示は差分表と同じ「マージ後の corrected」を正とする。
    // --corrected 併用時は Object.assign で上書きされた値が差分表に出るため、
    // 計算直後の _detail をそのまま出すと表示と差分が矛盾する。
    // 数値でない項目は NaN円 と出さず「（数値なし）」にする。
    const mergedNum = (key: string, fallback: number): string => {
      const v = corrected[key];
      return typeof v === "number" && Number.isFinite(v) ? yen(v) : yen(fallback);
    };
    const mergedOnly = (key: string): string => {
      const v = corrected[key];
      return typeof v === "number" && Number.isFinite(v) ? yen(v) : "（数値なし）";
    };
    console.log("-- 修正後（取引データから計算）--");
    console.log(
      `事業所得（控除後）  : ${mergedNum("business_income", detail.business_income)}（控除前 ${yen(detail.business_income_before_deduction)}）`,
    );
    console.log(
      `不動産所得（控除後）: ${mergedNum("real_estate_income", detail.real_estate_income)}（控除前 ${yen(detail.real_estate_income_before_deduction)}）`,
    );
    console.log(
      `青色申告特別控除    : 不動産 ${yen(detail.blue_deduction_real_estate)} + 事業 ${yen(detail.blue_deduction_business)}`,
    );
    console.log(
      `消費税（修正後）    : 本則 ${mergedOnly("consumption_tax_standard")} / 簡易 ${mergedOnly("consumption_tax_simplified")} / 2割特例 ${mergedOnly("consumption_tax_special20")}`,
    );
  }
  const diffEntries = Object.entries(d.fieldDiffs);
  if (diffEntries.length === 0) {
    console.log("差分はありません。");
  } else {
    for (const [fieldName, v] of diffEntries) {
      if (v.diff === null) {
        console.log(`${fieldName}: ${pyRepr(v.original)} → ${pyRepr(v.corrected)}`);
      } else {
        const sign = v.diff > 0 ? "+" : "";
        console.log(
          `${fieldName}: ${yen(v.original as number)} → ${yen(v.corrected as number)}（差分 ${sign}${yen(v.diff)}）`,
        );
      }
    }
    if (d.taxDelta !== null) {
      const sign = d.taxDelta > 0 ? "+" : "";
      const label = d.taxDelta > 0 ? "追加納付" : d.taxDelta < 0 ? "還付方向" : "増減なし";
      console.log(`税額の増減: ${sign}${yen(d.taxDelta)}（${label}）`);
    } else if (opts.csv === undefined) {
      console.log("税額フィールド（income_tax 等）が無いため、税額の増減は算出できません。");
    }
  }
  if (carried.length > 0) {
    console.log(
      `※ ${carried.join(", ")} は取引データから計算できないため、申告済みの値を引き継ぎました（差分対象外）。変更する場合は --corrected JSON で値を指定してください。`,
    );
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  // --help / -h はどこにあっても使い方を表示して正常終了する。
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return 0;
  }
  const [command, ...rest] = argv;
  if (command === undefined || !["aggregate", "consumption", "amend"].includes(command)) {
    console.error(USAGE);
    return 2;
  }
  const opts = parseOptions(rest);
  if (command === "aggregate") return cmdAggregate(opts);
  if (command === "consumption") return cmdConsumption(opts);
  return cmdAmend(opts);
}

try {
  process.exit(await main(process.argv.slice(2)));
} catch (e) {
  if (e instanceof UsageError) {
    console.error(`エラー: ${e.message}`);
    console.error(USAGE);
    process.exit(2);
  }
  console.error(`エラー: ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
}
