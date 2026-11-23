#!/usr/bin/env bun
/**
 * cli.ts — スタンドアロン計算 CLI（旧 Python 版 main.py の計算系
 * サブコマンドの移植。本ツールが数字の計算の正本）。
 *
 * サブコマンド:
 *   aggregate   --year YYYY --csv FILE
 *       事業所得/不動産所得の集計と青色申告特別控除を表示する。
 *   consumption --year YYYY --csv FILE
 *       消費税を 本則 / 簡易課税 / 2割特例 の3方式で比較表示する。
 *   amend       --year YYYY --original ORIG.json [--corrected CORR.json] [--csv FILE]
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
  type ConsumptionMethod,
  type CorrectedFiguresDetail,
  type Transaction,
} from "@etax/shared";

const USAGE = `使い方: cli <aggregate|consumption|amend> [オプション]
  aggregate   --year YYYY --csv FILE
  consumption --year YYYY --csv FILE
  amend       --year YYYY --original ORIG.json [--corrected CORR.json] [--csv FILE]`;

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
}

function parseOptions(argv: string[]): CliOptions {
  const raw: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (!a.startsWith("--")) throw new UsageError(`不明な引数です: ${a}`);
    const key = a.slice(2);
    if (!["year", "csv", "original", "corrected"].includes(key)) {
      throw new UsageError(`不明なオプションです: ${a}`);
    }
    const val = argv[i + 1];
    if (val === undefined) throw new UsageError(`オプション ${a} に値がありません`);
    raw[key] = val;
    i++;
  }
  const opts: CliOptions = {};
  if (raw["year"] !== undefined) {
    const y = Number(raw["year"]);
    if (!Number.isInteger(y)) throw new UsageError(`--year が整数ではありません: ${raw["year"]}`);
    opts.year = y;
  }
  if (raw["csv"] !== undefined) opts.csv = raw["csv"];
  if (raw["original"] !== undefined) opts.original = raw["original"];
  if (raw["corrected"] !== undefined) opts.corrected = raw["corrected"];
  return opts;
}

function requireOpt<T>(v: T | undefined, flag: string): T {
  if (v === undefined) throw new UsageError(`必須オプションがありません: ${flag}`);
  return v;
}

async function loadYearTransactions(csvPath: string, year: number): Promise<Transaction[]> {
  const text = await Bun.file(csvPath).text();
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
    console.log(`${year}年の取引がありませんでした。`);
    return 1;
  }
  const b = aggregateIncome(tx);
  const blue = blueDeduction(b.realEstateIncome, b.businessIncome);
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
    console.log(`${year}年の取引がありませんでした。`);
    return 1;
  }
  const b = aggregateIncome(tx);
  const rent = residentialRentTotal(tx);
  const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
  const inputTax = estimateInputTax(tx);
  console.log(`== ${year}年 消費税（税込経理・税率10%） ==`);
  console.log(`課税売上（税込）  : ${yen(taxable)}`);
  console.log(`非課税売上（住宅家賃）: ${yen(nontaxable)}`);
  console.log(`仕入税額（経費からの概算）: ${yen(inputTax)}`);
  const methods: [ConsumptionMethod, string][] = [
    ["standard", "本則課税"],
    ["simplified", "簡易課税（第5種・みなし仕入率50%）"],
    ["special20", "2割特例"],
  ];
  for (const [method, label] of methods) {
    const r = consumptionTax({
      taxableSalesIncl: taxable,
      nontaxableSalesIncl: nontaxable,
      inputTax,
      method,
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
      console.log(`${year}年の取引がありませんでした。`);
      return 1;
    }
    const figs = computeCorrectedFigures(tx, year);
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
    console.log("-- 修正後（取引データから計算）--");
    console.log(
      `事業所得（控除後）  : ${yen(detail.business_income)}（控除前 ${yen(detail.business_income_before_deduction)}）`,
    );
    console.log(
      `不動産所得（控除後）: ${yen(detail.real_estate_income)}（控除前 ${yen(detail.real_estate_income_before_deduction)}）`,
    );
    console.log(
      `青色申告特別控除    : 不動産 ${yen(detail.blue_deduction_real_estate)} + 事業 ${yen(detail.blue_deduction_business)}`,
    );
    console.log(
      `消費税（修正後）    : 本則 ${yen(corrected["consumption_tax_standard"] as number)} / 簡易 ${yen(corrected["consumption_tax_simplified"] as number)} / 2割特例 ${yen(corrected["consumption_tax_special20"] as number)}`,
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
