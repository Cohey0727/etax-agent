/**
 * csvMapping.ts — 銀行・カード明細CSVの「列マッピング」の自動判定（services/csvImport）。
 *
 * ユーザー要件: 列マッピングはユーザーが手でやるのではなくシステムが自動で行う。
 *   1. AGENT_API_KEY があれば、ヘッダー＋先頭行を LLM に渡してマッピングJSONを得る（AIマッピング）。
 *   2. AIが使えない/失敗した場合は、キーワードのヒューリスティクスで自動判定する。
 * どちらでもユーザー操作は不要で、結果には mappingSource（"ai" | "heuristic"）が付く。
 */
import { createLlmClient } from "../../gateways/llmGateway";
import { loadAgentConfig } from "../../lib/config";
import { AmountSign, CsvMapping, MappingSource } from "../../schemas/importCsv";
import { detectDateFormat, parseDateCell } from "./csvCellParsing";

// ---------------------------------------------------------------------------
// ヒューリスティクス・マッピング（キーが無い/ AI失敗時の自動判定）
// ---------------------------------------------------------------------------

/** ヘッダー比較用に空白を除き小文字化する。 */
const normalizeHeader = (h: string) => h.replace(/[\s　]+/g, "").toLowerCase();

const dateKeywords = ["お取引日", "取引日", "ご利用日", "利用日", "日付", "年月日", "お支払日", "支払日", "明細日", "date"];
const creditKeywords = ["お預かり金額", "お預り金額", "お預入金額", "預かり金額", "預り金額", "預入金額", "入金金額", "お預かり", "お預り", "入金", "credit", "貸方"];
const debitKeywords = ["お支払い金額", "お支払金額", "支払金額", "出金金額", "引落金額", "ご利用金額", "利用金額", "出金", "お支払い", "支払い", "debit", "借方"];
const balanceKeywords = ["差引残高", "お預り金残高", "残高", "balance"];
const accountKeywords = ["口座名", "口座番号", "口座", "カード名", "account"];
const descriptionKeywords = ["ご利用内容", "お取引内容", "取引内容", "ご利用先", "摘要欄", "摘要", "内容", "加盟店", "店舗名", "項目", "description"];
const amountKeywords = ["金額", "入出金", "ご利用代金", "amount"];
const categoryKeywords = ["勘定科目", "科目", "費目", "category"];
const incomeTypeKeywords = ["収入区分", "所得区分", "income_type", "incometype"];
const taxCategoryKeywords = ["税区分", "消費税区分", "tax_category", "taxcategory"];

/**
 * 入金と出金の両方を表す見出し（入出金・入払区分など）か。符号付きの金額1列
 * または区分の列であり、出金列・入金列のどちらでもない（「入出金」は
 * 「出金」を部分文字列に含むため、除かないと出金列と誤判定する）。
 */
function isCombinedInOutHeader(h: string): boolean {
  const nh = normalizeHeader(h);
  return nh.includes("入") && (nh.includes("出") || nh.includes("払"));
}

/**
 * キーワード一致で最適な列を選ぶ。キーワードが長い（具体的）ほど高スコア。
 * used に入っている列は選ばない（1列は1項目だけに使う）。
 */
function pickColumn(
  headers: string[],
  keywords: string[],
  used: Set<string>,
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  for (const h of headers) {
    if (used.has(h)) continue;
    const nh = normalizeHeader(h);
    for (const kw of keywords) {
      if (nh.includes(normalizeHeader(kw))) {
        const score = kw.length;
        if (score > bestScore) {
          bestScore = score;
          best = h;
        }
      }
    }
  }
  return best;
}

/** キーワード・ヒューリスティクスによる自動マッピング。 */
export function heuristicMapping(headers: string[], dataRows: string[][]): CsvMapping {
  const used = new Set<string>();
  const take = (kws: string[], candidates: string[] = headers) => {
    const col = pickColumn(candidates, kws, used);
    if (col) used.add(col);
    return col;
  };

  let dateColumn = take(dateKeywords);
  // キーワードで日付列が決まらなければ、値が日付らしい列を探す
  if (!dateColumn) {
    for (const h of headers) {
      if (used.has(h)) continue;
      const j = headers.indexOf(h);
      const sample = dataRows.slice(0, 5).map((r) => r[j] ?? "");
      if (sample.some((v) => parseDateCell(v) !== null)) {
        dateColumn = h;
        used.add(h);
        break;
      }
    }
  }

  const splitCandidates = headers.filter((h) => !isCombinedInOutHeader(h));
  const creditColumn = take(creditKeywords, splitCandidates);
  const debitColumn = take(debitKeywords, splitCandidates);
  const balanceColumn = take(balanceKeywords);
  const accountColumn = take(accountKeywords);
  const descriptionColumn = take(descriptionKeywords);
  let amountColumn: string | null = null;
  let amountSign: AmountSign;
  if (creditColumn || debitColumn) {
    amountSign = "split";
  } else {
    amountColumn = take(amountKeywords);
    amountSign = "as-is";
  }
  // 明示の分類列（あれば分類で推定より優先される。銀行明細には通常は無い）
  const categoryColumn = take(categoryKeywords);
  const incomeTypeColumn = take(incomeTypeKeywords);
  const taxCategoryColumn = take(taxCategoryKeywords);

  // 日付書式は実データから検出する
  let dateFormat = "不明";
  if (dateColumn) {
    const j = headers.indexOf(dateColumn);
    for (const r of dataRows.slice(0, 10)) {
      const v = r[j] ?? "";
      if (parseDateCell(v) !== null) {
        dateFormat = detectDateFormat(v);
        break;
      }
    }
  }

  return {
    dateColumn,
    descriptionColumn,
    amountColumn,
    debitColumn,
    creditColumn,
    balanceColumn,
    accountColumn,
    categoryColumn,
    incomeTypeColumn,
    taxCategoryColumn,
    dateFormat,
    amountSign,
  };
}

// ---------------------------------------------------------------------------
// AI マッピング（LLMにヘッダー＋先頭行を渡して対応付けさせる）
// ---------------------------------------------------------------------------

const MAPPING_SYSTEM_PROMPT = `あなたは銀行・カード明細CSVの「列マッピング」を行うアシスタントです。
ヘッダーと先頭行のサンプルが与えられます。各項目に対応する列を「ヘッダー文字列そのもの」で選んでください。該当する列が無ければ null にしてください。

項目の意味:
- dateColumn: 取引日・利用日の列
- descriptionColumn: 摘要・利用内容の列
- amountColumn: 収入が正・支出が負のように符号つき金額が1列にまとまっている場合の列（出金/入金が分かれている場合は null）
- debitColumn: 出金・支払金額の列（金額列が1つにまとまっている場合は null）
- creditColumn: 入金・預入金額の列（金額列が1つにまとまっている場合は null）
- balanceColumn: 残高の列
- accountColumn: 口座名・口座番号の列
- categoryColumn: 勘定科目が明示されている列（無ければ null）
- incomeTypeColumn: 収入区分（business / real_estate / other）が明示されている列（無ければ null）
- taxCategoryColumn: 消費税の税区分（課税売上10% / 課対仕入10% / 非課売上 / 対象外 など）が明示されている列（無ければ null）
- dateFormat: 日付の書式（例 "YYYY/MM/DD"、"YYYY-MM-DD"、"YYYYMMDD"、"YY/MM/DD"、"YYYY年M月D日"）
- amountSign: amountColumn を使う場合の符号の約束。"as-is"（収入が正、そのまま使える）/ "inverted"（支出が正・収入が負など反転が必要）/ "split"（debitColumn と creditColumn を使う）

回答は次の JSON オブジェクトのみを出力してください。説明文やコードフェンスは不要です:
{"dateColumn":null,"descriptionColumn":null,"amountColumn":null,"debitColumn":null,"creditColumn":null,"balanceColumn":null,"accountColumn":null,"categoryColumn":null,"incomeTypeColumn":null,"taxCategoryColumn":null,"dateFormat":"YYYY/MM/DD","amountSign":"as-is"}`;

/** LLMの応答JSONを検証して CsvMapping にする。不正なら null（呼び出し側がヒューリスティクスへ落とす）。 */
function validateAiMapping(raw: unknown, headers: string[]): CsvMapping | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const headerSet = new Set(headers);
  // 列値の検証: null は「列なし」、実在するヘッダー文字列はその列、それ以外は不正（undefined を返す）
  const col = (v: unknown): string | null | undefined => {
    if (v === null || v === undefined) return null;
    if (typeof v !== "string") return undefined;
    return headerSet.has(v) ? v : undefined;
  };
  const dateColumn = col(o["dateColumn"]);
  const descriptionColumn = col(o["descriptionColumn"]);
  const amountColumn = col(o["amountColumn"]);
  const debitColumn = col(o["debitColumn"]);
  const creditColumn = col(o["creditColumn"]);
  const balanceColumn = col(o["balanceColumn"]);
  const accountColumn = col(o["accountColumn"]);
  const categoryColumn = col(o["categoryColumn"]);
  const incomeTypeColumn = col(o["incomeTypeColumn"]);
  const taxCategoryColumn = col(o["taxCategoryColumn"]);
  const cols = [dateColumn, descriptionColumn, amountColumn, debitColumn, creditColumn, balanceColumn, accountColumn, categoryColumn, incomeTypeColumn, taxCategoryColumn];
  if (cols.some((c) => c === undefined)) return null;
  if (!dateColumn) return null;
  if (!amountColumn && !debitColumn && !creditColumn) return null;
  const signRaw = o["amountSign"];
  let amountSign: AmountSign;
  if (debitColumn || creditColumn) amountSign = "split";
  else if (signRaw === "inverted") amountSign = "inverted";
  else amountSign = "as-is";
  const dateFormat =
    typeof o["dateFormat"] === "string" && o["dateFormat"] ? (o["dateFormat"] as string) : "不明";
  return {
    dateColumn,
    descriptionColumn: descriptionColumn ?? null,
    amountColumn: amountColumn ?? null,
    debitColumn: debitColumn ?? null,
    creditColumn: creditColumn ?? null,
    balanceColumn: balanceColumn ?? null,
    accountColumn: accountColumn ?? null,
    categoryColumn: categoryColumn ?? null,
    incomeTypeColumn: incomeTypeColumn ?? null,
    taxCategoryColumn: taxCategoryColumn ?? null,
    dateFormat,
    amountSign,
  };
}

/** AIマッピングを試みる。APIキー必須。失敗時は例外（呼び出し側でフォールバック）。 */
export async function aiMapping(headers: string[], dataRows: string[][]): Promise<CsvMapping> {
  const cfg = loadAgentConfig();
  cfg.requireKey();
  const client = createLlmClient(cfg);
  const sample = dataRows.slice(0, 10);
  const userText =
    `ヘッダー: ${JSON.stringify(headers)}\n` +
    `先頭行サンプル:\n${JSON.stringify(sample, null, 0)}`;
  const resp = await client.chat([
    { role: "system", content: MAPPING_SYSTEM_PROMPT },
    { role: "user", content: userText },
  ]);
  const text = resp.content || "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM応答からJSONを取り出せませんでした");
  const parsed: unknown = JSON.parse(text.slice(start, end + 1));
  const mapping = validateAiMapping(parsed, headers);
  if (!mapping) throw new Error("LLM応答のマッピングが検証に失敗しました");
  // 日付書式は実データで検出できた方が確かなので、検出できればそちらを優先する
  if (mapping.dateColumn) {
    const j = headers.indexOf(mapping.dateColumn);
    for (const r of dataRows.slice(0, 10)) {
      const v = r[j] ?? "";
      if (parseDateCell(v) !== null) {
        mapping.dateFormat = detectDateFormat(v);
        break;
      }
    }
  }
  return mapping;
}

/**
 * マッピングを決定する: キーがあれば AI → 失敗すればヒューリスティクス。
 * どちらでも自動（ユーザー操作なし）。戻り値に決定方法を含む。
 */
export async function resolveMapping(
  headers: string[],
  dataRows: string[][],
): Promise<{ mapping: CsvMapping; source: MappingSource }> {
  const cfg = loadAgentConfig();
  if (cfg.apiKey) {
    try {
      const mapping = await aiMapping(headers, dataRows);
      return { mapping, source: "ai" };
    } catch {
      // AIに失敗したらヒューリスティクスで自動判定する（ユーザーに手作業はさせない）
    }
  }
  return { mapping: heuristicMapping(headers, dataRows), source: "heuristic" };
}
