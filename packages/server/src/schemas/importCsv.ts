/**
 * importCsv.ts — CSV取込エンドポイントのスキーマ（schemas）。
 *
 * リクエストは生バイト（text/csv 等）または JSON の2形式を受けるため、
 * ルート定義にはボディスキーマを置かず、ハンドラで従来どおり読み取る。
 * ここで定義するのは列マッピングとレスポンスの形だけ。
 */
import { z } from "@hono/zod-openapi";

export const AmountSignSchema = z.enum(["as-is", "inverted", "split"]);

export type AmountSign = z.infer<typeof AmountSignSchema>;

export const MappingSourceSchema = z.enum(["ai", "heuristic"]);

export type MappingSource = z.infer<typeof MappingSourceSchema>;

/** CSVの列マッピング。値はすべて「ヘッダー文字列そのもの」（無ければ null）。 */
export const CsvMappingSchema = z
  .object({
    dateColumn: z.string().nullable(),
    descriptionColumn: z.string().nullable(),
    /** 符号つき金額が1列にまとまっている場合の列 */
    amountColumn: z.string().nullable(),
    /** 出金（支払）列 — 入金列と分かれている形式の場合 */
    debitColumn: z.string().nullable(),
    /** 入金列 — 出金列と分かれている形式の場合 */
    creditColumn: z.string().nullable(),
    balanceColumn: z.string().nullable(),
    accountColumn: z.string().nullable(),
    /** 勘定科目の明示列（あれば、その値が分類で推定より優先される） */
    categoryColumn: z.string().nullable(),
    /** 収入区分の明示列（あれば、その値が分類で推定より優先される） */
    incomeTypeColumn: z.string().nullable(),
    /** 消費税の税区分の明示列（あれば、その値がそのまま税区分になる） */
    taxCategoryColumn: z.string().nullable(),
    /** 検出した日付書式（例: "YYYY/MM/DD"） */
    dateFormat: z.string(),
    /**
     * 金額の符号の取り決め:
     *  - "as-is"   : 金額列の符号をそのまま使う（収入が正）
     *  - "inverted": 金額列の符号を反転する（支出が正で記録されている明細など）
     *  - "split"   : 出金/入金の2列から amount = 入金 − 出金 で合成する
     */
    amountSign: AmountSignSchema,
  })
  .openapi("CsvMapping");

export type CsvMapping = z.infer<typeof CsvMappingSchema>;

/** 取込でパースされた取引（内部形式）のワイヤ形状。 */
export const ImportedTransactionSchema = z
  .object({
    date: z.string(),
    year: z.number(),
    description: z.string(),
    amount: z.number(),
    account: z.string(),
    category: z.string(),
    income_type: z.enum(["business", "real_estate", "other"]),
    tax_category: z.string(),
  })
  .openapi("ImportedTransaction");

export const ImportCsvResponseSchema = z
  .object({
    mapping: CsvMappingSchema,
    mappingSource: MappingSourceSchema,
    encoding: z.string(),
    filename: z.string(),
    count: z.number(),
    totalRows: z.number(),
    skippedRows: z.number(),
    duplicatesSkipped: z.number(),
    persisted: z.boolean(),
    importId: z.number().nullable(),
    persistWarning: z.string().nullable(),
    transactions: z.array(ImportedTransactionSchema),
  })
  .openapi("ImportCsvResponse");

export type ImportCsvResponse = z.infer<typeof ImportCsvResponseSchema>;

/** パース失敗時（422）に、判定済みマッピングと一緒に返すエラー形状。 */
export const ImportCsvMappingErrorSchema = z
  .object({
    error: z.string(),
    mapping: CsvMappingSchema,
    mappingSource: MappingSourceSchema,
  })
  .openapi("ImportCsvMappingError");

export type ImportCsvMappingError = z.infer<typeof ImportCsvMappingErrorSchema>;
