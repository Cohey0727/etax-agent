/**
 * ledger.ts — 取引CSVの取込と、税込経理ベースの集計。
 *
 * 内部CSV形式（ヘッダー必須）:
 *   date, description, amount, account, category, income_type
 *     date        : YYYY-MM-DD
 *     description : 摘要（自由文）
 *     amount      : 符号つき整数。収入は正、支出は負（税込金額）
 *     account     : 口座・カード名など（自由文、集計には使わない）
 *     category    : 勘定科目。空欄なら CATEGORY_RULES で推定を試みる
 *     income_type : business / real_estate / other。空欄なら other
 *
 * 金額は税込経理（消費税込みの金額をそのまま収入・経費に計上する方式）を前提とする。
 * 銀行・カード会社の多様なCSV形式への対応はサーバー側の services/csvImport
 * （自動マッピング）が担う。行の分類（勘定科目・収入区分の決定）は
 * classifyTransactionRow に一元化し、サーバー側も同じ関数を使う。
 */

import { normalizeSearchText } from "./text";
import { normalizeBusinessRatio, transactionBusinessAmount } from "./taxcalc";
import { VALID_INCOME_TYPES, type IncomeType, type Transaction } from "./types";

// ---------------------------------------------------------------------------
// 勘定科目の推定ルール
// ---------------------------------------------------------------------------

export interface CategoryRule {
  category: string;
  keywords: string[];
}

/** 摘要キーワード → 勘定科目 の分類ルール。先にマッチしたルールを優先する。 */
export const CATEGORY_RULES: CategoryRule[] = [
  { category: "通信費", keywords: ["AWS", "さくら", "サーバー", "ドメイン", "回線", "Wi-Fi", "wifi"] },
  { category: "消耗品費", keywords: ["Mac mini", "MacBook", "PC", "マウス", "キーボード", "モニタ"] },
  { category: "旅費交通費", keywords: ["電車", "バス", "タクシー", "ガソリン", "駐車場"] },
  { category: "外注工賃", keywords: ["外注", "業務委託", "フリーランス"] },
  { category: "租税公課", keywords: ["固定資産税", "印紙", "自動車税"] },
  { category: "修繕費", keywords: ["修繕", "修理", "リフォーム"] },
  { category: "管理費", keywords: ["管理費", "管理会社"] },
  { category: "家賃収入", keywords: ["家賃収入", "賃料収入"] },
  // 「請求」は入れない: カード請求・請求書払い等の出金に誤爆して売上高になる
  { category: "売上高", keywords: ["売上", "開発費用", "業務報酬"] },
];

/** 摘要にキーワードが含まれれば勘定科目を推定する。見つからなければ null。 */
export function suggestCategory(
  description: string,
  rules: CategoryRule[] = CATEGORY_RULES,
): string | null {
  // 照合は正規化して行う（小文字 aws・全角英数・半角カナでも当たるように。
  // 生の includes では表記ゆれでルールにヒットしない）。
  const normalizedDescription = normalizeSearchText(description);
  for (const rule of rules) {
    for (const kw of rule.keywords) {
      if (kw && normalizedDescription.includes(normalizeSearchText(kw))) return rule.category;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 勘定科目の候補と判定基準（SystemOne の choice 質問の criteria に使う）
// ---------------------------------------------------------------------------

export interface AccountCriterion {
  account: string;
  /** その科目に該当する支出/収入の説明（判定モデルへの criteria）。 */
  criteria: string;
}

/**
 * 科目判定の選択肢（青色申告決算書の一般的な科目＋収入科目）。
 * 判定は「どの帳簿（勘定科目）に付けるか」をこの一覧から選ぶ形で統一する。
 * 「その他」は受け皿: 並びの末尾ではなく中ほどに置く（判定モデルの位置バイアス対策）。
 */
export const ACCOUNT_CRITERIA: AccountCriterion[] = [
  { account: "売上高", criteria: "事業の売上・業務報酬・開発費用などの請求による収入" },
  { account: "家賃収入", criteria: "賃貸物件の家賃・賃料による収入" },
  { account: "仕入高", criteria: "販売する商品・材料の仕入れ" },
  { account: "租税公課", criteria: "税金・印紙・手数料などの公的負担（固定資産税、自動車税、登録免許税など）" },
  { account: "荷造運賃", criteria: "荷造り材料費・配送費・宅配便・送料" },
  { account: "水道光熱費", criteria: "電気・ガス・水道などの光熱費" },
  { account: "旅費交通費", criteria: "電車・バス・タクシー・航空券・ガソリン・駐車場・宿泊などの移動費" },
  { account: "通信費", criteria: "電話・インターネット回線・サーバー・ドメイン・クラウドサービス・郵便料金" },
  { account: "広告宣伝費", criteria: "広告出稿・宣伝・プロモーション費用" },
  { account: "交際費", criteria: "取引先との飲食・贈答・慶弔などの交際費" },
  { account: "会議費", criteria: "会議・打ち合わせに伴う飲食代・会場費・会議用のお茶代" },
  { account: "新聞図書費", criteria: "書籍・雑誌・新聞・ニュースサービス・技術書の購入" },
  { account: "支払手数料", criteria: "振込手数料・決済手数料・各種サービスの手数料" },
  { account: "損害保険料", criteria: "火災保険・自動車保険などの保険料" },
  { account: "その他", criteria: "他のどの科目にも当てはまらないもの" },
  { account: "修繕費", criteria: "建物・設備・機器の修繕・修理・リフォーム" },
  { account: "消耗品費", criteria: "事務用品・PC周辺機器・工具など10万円未満の物品購入" },
  { account: "減価償却費", criteria: "高額な固定資産の減価償却分" },
  { account: "福利厚生費", criteria: "従業員の福利厚生・健康診断・慶弔見舞" },
  { account: "給料賃金", criteria: "従業員への給料・賃金" },
  { account: "外注費", criteria: "外部業者・フリーランスへの業務委託費・外注費・外注工賃" },
  { account: "利子割引料", criteria: "借入金の利息・手形割引料" },
  { account: "地代家賃", criteria: "事務所・店舗の家賃、駐車場代などの賃借料の支払い" },
  { account: "管理費", criteria: "賃貸物件の管理会社への管理費・共益費" },
  { account: "貸倒金", criteria: "売掛金などの貸倒れ損失" },
  { account: "雑費", criteria: "少額で他の科目に分類しにくい経費（振込手数料、書籍、セミナー参加費など）" },
];

/** 科目判定の選択肢名の一覧（ACCOUNT_CRITERIA と同じ順序）。 */
export const ACCOUNT_NAMES: string[] = ACCOUNT_CRITERIA.map((c) => c.account);

/** 摘要・科目から収入区分を推定する（家賃まわりは不動産所得、それ以外は科目が付けば事業所得）。 */
export function guessIncomeType(description: string, category: string): IncomeType {
  if (category === "家賃収入") return "real_estate";
  if (/家賃|賃料|賃貸/.test(description)) return "real_estate";
  if (category !== "未分類") return "business";
  return "other";
}

// ---------------------------------------------------------------------------
// 行の分類（勘定科目・収入区分の決定）— shared が正本の唯一の実装
// ---------------------------------------------------------------------------

/**
 * 分類への入力。category / incomeType は「ファイルに実在した列の値」:
 *   - 文字列: その列がある（空欄は ""）
 *   - null  : その列自体がファイルに無い
 */
export interface RowClassificationInput {
  description: string;
  category: string | null;
  incomeType: string | null;
}

export interface RowClassification {
  category: string;
  income_type: IncomeType;
}

/**
 * 1行分の勘定科目と収入区分を決める（内部形式CSV取込とサーバーのCSV取込で共用）。
 *
 * 明示列の値は「データ」であり、推定より優先する:
 *   - 勘定科目: 明示値があればそれを使う。空欄/列なしなら科目推定し、
 *     推定できなければ「未分類」。
 *   - 収入区分: 列があり値があればそれを使う（空欄は other、不正な値は Error）。
 *     列自体が無い場合（銀行明細など）だけ区分推定に落とす。
 */
export function classifyTransactionRow(
  input: RowClassificationInput,
  rules: CategoryRule[] = CATEGORY_RULES,
): RowClassification {
  const explicitCategory = (input.category ?? "").trim();
  const category = explicitCategory || (suggestCategory(input.description, rules) ?? "未分類");

  let income_type: IncomeType;
  if (input.incomeType === null) {
    income_type = guessIncomeType(input.description, category);
  } else {
    const v = input.incomeType.trim();
    if (!v) {
      income_type = "other";
    } else if (VALID_INCOME_TYPES.has(v)) {
      income_type = v as IncomeType;
    } else {
      throw new Error(
        `income_type が不正です: ${v}（business / real_estate / other のいずれか）`,
      );
    }
  }
  return { category, income_type };
}

// ---------------------------------------------------------------------------
// CSV パーサ（引用符・カンマ・改行を含むセルに対応する最小実装）
// ---------------------------------------------------------------------------

/** CSVテキストを行×列の文字列配列に分解する。区切り文字はカンマ既定、タブも自動検出。 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  // 区切り文字の自動検出: 1行目にタブがありカンマが無ければタブ区切り
  const firstLineEnd = src.search(/\r\n|\n|\r/);
  const firstLine = firstLineEnd >= 0 ? src.slice(0, firstLineEnd) : src;
  const delim = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };
  while (i < src.length) {
    const ch = src[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && cell === "") {
      // 引用符はセルの先頭でのみ開始する。セル途中の " （例: 14" MacBook）を
      // 引用開始とみなすと、以降のカンマ・改行を飲み込んで行が壊れる。
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delim) {
      pushCell();
      i += 1;
      continue;
    }
    if (ch === "\r") {
      if (src[i + 1] === "\n") i += 1;
      pushRow();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRow();
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell !== "" || row.length > 0) pushRow();
  // 末尾の完全な空行は落とす
  while (rows.length > 0) {
    const last = rows[rows.length - 1] as string[];
    if (last.every((c) => c.trim() === "")) rows.pop();
    else break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// 内部形式CSVの取込
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 内部形式CSVテキストを読み、取引リストを返す。
 * category が空欄の行はルールで推定し、推定できなければ「未分類」とする。
 * income_type が不正な行は Error（黙って読み飛ばすと集計が狂うため）。
 */
export function importCsvText(text: string, rules: CategoryRule[] = CATEGORY_RULES): Transaction[] {
  const rows = parseCsv(text);
  if (rows.length === 0) throw new Error("CSVが空です");
  const header = (rows[0] as string[]).map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const missing = ["date", "amount"].filter((c) => idx(c) < 0);
  if (missing.length > 0) {
    throw new Error(`CSVに必須列がありません: ${missing.join(", ")}（列: ${header.join(", ")}）`);
  }
  const col = (row: string[], name: string): string => {
    const j = idx(name);
    return j >= 0 ? (row[j] ?? "") : "";
  };
  /** 列の有無を区別する取得。列自体が無ければ null（空欄とは意味が違う）。 */
  const colOrNull = (row: string[], name: string): string | null => {
    const j = idx(name);
    return j >= 0 ? (row[j] ?? "") : null;
  };

  const transactions: Transaction[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] as string[];
    const lineNo = r + 1; // 1行目はヘッダー
    const dateRaw = col(row, "date").trim();
    if (!dateRaw) continue;
    if (!DATE_RE.test(dateRaw)) {
      throw new Error(`${lineNo}行目 date が YYYY-MM-DD 形式ではありません: ${dateRaw}`);
    }
    // 形式だけでなく実在する日付かも検証する（2024-02-30 等を通さない）。
    const [yy, mm, dd] = dateRaw.split("-").map(Number);
    const probe = new Date(Date.UTC(yy!, mm! - 1, dd!));
    if (probe.getUTCFullYear() !== yy || probe.getUTCMonth() !== mm! - 1 || probe.getUTCDate() !== dd) {
      throw new Error(`${lineNo}行目 date が実在しない日付です: ${dateRaw}`);
    }
    // 金額: 全角数字・全角￥も除去/変換する。空欄は Number("") === 0 で
    // 無言の 0円取込にならないよう、数値でないものとして弾く。
    const amountRaw = col(row, "amount")
      .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
      .replace(/[,¥￥]/g, "")
      .trim();
    const amount = amountRaw === "" ? Number.NaN : Number(amountRaw);
    if (!Number.isFinite(amount)) {
      throw new Error(`${lineNo}行目 amount が数値ではありません: ${col(row, "amount")}`);
    }
    const description = col(row, "description").trim();
    let classified: RowClassification;
    try {
      classified = classifyTransactionRow(
        {
          description,
          // 列が無い場合は null を渡し、推定に委ねる（"" を渡すと
          // 「明示的な空欄」とみなされ推定が働かない）。
          category: colOrNull(row, "category"),
          incomeType: colOrNull(row, "income_type"),
        },
        rules,
      );
    } catch (e) {
      throw new Error(`${lineNo}行目 ${e instanceof Error ? e.message : String(e)}`);
    }
    // year 列があれば割り当て年度として使う（無ければ日付の年）。
    const yearRaw = colOrNull(row, "year");
    const yearParsed = yearRaw === null || yearRaw.trim() === "" ? Number.NaN : Number(yearRaw);
    const year =
      Number.isInteger(yearParsed) && yearParsed >= 1900 && yearParsed <= 2100
        ? yearParsed
        : Number(dateRaw.slice(0, 4));
    transactions.push({
      date: dateRaw,
      year,
      description,
      amount: Math.trunc(amount),
      account: col(row, "account").trim(),
      category: classified.category,
      income_type: classified.income_type,
      tax_category: col(row, "tax_category").trim(),
    });
  }
  return transactions;
}

// ---------------------------------------------------------------------------
// 集計ヘルパー
// ---------------------------------------------------------------------------

export function filterYear(transactions: Transaction[], year: number): Transaction[] {
  return transactions.filter((t) => t.year === year);
}

/** 勘定科目ごとの合計（符号つき）。金額は事業分（家事按分後）で集計する。 */
export function categoryTotals(transactions: Transaction[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const t of transactions) {
    totals[t.category] = (totals[t.category] ?? 0) + transactionBusinessAmount(t);
  }
  return totals;
}

/**
 * 決算書の経費欄に渡す科目別合計を作る。支出は正の金額（絶対値）に揃え、
 * 不動産の家賃収入だけは収入として正のまま残す。XTX生成（exportXtx）と
 * 試算表（trialBalance）が同じ振り分けを使うための単一実装。
 */
export function statementCategoryTotals(
  transactions: Transaction[],
  incomeType: IncomeType,
): Record<string, number> {
  const totals = categoryTotals(transactions.filter((t) => t.income_type === incomeType));
  const result: Record<string, number> = {};
  for (const [category, value] of Object.entries(totals)) {
    if (category === "家賃収入") {
      if (value > 0) result[category] = value;
    } else if (value < 0) {
      result[category] = -value;
    }
  }
  return result;
}

/** 住宅家賃（消費税非課税）の収入合計。category=家賃収入 のものを事業分で拾う。 */
export function residentialRentTotal(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.income_type === "real_estate" && t.category === "家賃収入" && t.amount > 0)
    .reduce((sum, t) => sum + transactionBusinessAmount(t), 0);
}

// ---------------------------------------------------------------------------
// JSON入力の正規化（API境界用）
// ---------------------------------------------------------------------------

/** 任意のJSONオブジェクトを Transaction に正規化する（不正な値は寛容に補正）。 */
export function normalizeTransaction(raw: Record<string, unknown>): Transaction {
  const date = typeof raw["date"] === "string" ? (raw["date"] as string) : "";
  const yearRaw = raw["year"];
  const year =
    typeof yearRaw === "number" && Number.isFinite(yearRaw)
      ? Math.trunc(yearRaw)
      : Number(date.slice(0, 4)) || 0;
  const amountRaw = raw["amount"];
  const amount = typeof amountRaw === "number" && Number.isFinite(amountRaw) ? Math.trunc(amountRaw) : 0;
  const itypeRaw = typeof raw["income_type"] === "string" ? (raw["income_type"] as string) : "other";
  const ratioRaw = raw["business_ratio_percent"];
  const basisRaw = raw["business_ratio_basis"];
  return {
    date,
    year,
    description: typeof raw["description"] === "string" ? (raw["description"] as string) : "",
    amount,
    account: typeof raw["account"] === "string" ? (raw["account"] as string) : "",
    category: typeof raw["category"] === "string" && raw["category"] ? (raw["category"] as string) : "未分類",
    income_type: VALID_INCOME_TYPES.has(itypeRaw) ? (itypeRaw as IncomeType) : "other",
    tax_category: typeof raw["tax_category"] === "string" ? (raw["tax_category"] as string) : "",
    // 事業割合は数値で来た場合だけ引き継ぐ（不正値は未指定＝100として扱う）。
    business_ratio_percent:
      typeof ratioRaw === "number" && Number.isFinite(ratioRaw)
        ? normalizeBusinessRatio(ratioRaw)
        : undefined,
    business_ratio_basis: typeof basisRaw === "string" ? basisRaw : undefined,
  };
}

export function normalizeTransactions(list: unknown): Transaction[] {
  if (!Array.isArray(list)) return [];
  return list
    .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
    .map(normalizeTransaction);
}
