/**
 * transaction.ts — 取引エンドポイントのスキーマ（schemas）。
 *
 * リクエスト検証はハンドラ側で行う（DBゲートの 503 をバリデーションの
 * 400 より先に返す従来順序を保つため）。文字列フィールドは
 * 「型が違う値は未指定として扱う」従来挙動に合わせ、z.catch で
 * undefined へ落とす。date / amount の不正は従来どおり 400 にする。
 */
import { z } from "@hono/zod-openapi";
import { IdSchema, YearSchema } from "./common";

export const TransactionSchema = z
  .object({
    id: z.number(),
    date: z.string(),
    /** 割り当て年度（この取引を計上する年）。既定は日付の年。 */
    fiscal_year: z.number(),
    description: z.string(),
    amount: z.number(),
    account: z.string(),
    category: z.string(),
    income_type: z.string(),
    tax_category: z.string(),
    /** 事業専用割合（家事按分、0〜100の整数）。100 は全額事業分 */
    business_ratio_percent: z.number(),
    /** 按分根拠のメモ（任意） */
    business_ratio_basis: z.string(),
    import_id: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
    /** 論理削除の日時。削除済みのときだけ値が入る（通常の一覧では返らない） */
    deleted_at: z.string().nullable(),
  })
  .openapi("Transaction");

export type TransactionResponse = z.infer<typeof TransactionSchema>;

export const TransactionIdParamSchema = z
  .object({
    id: IdSchema,
  })
  .openapi("TransactionIdParam");

export type TransactionIdParam = z.infer<typeof TransactionIdParamSchema>;

export const ListTransactionsQuerySchema = z
  .object({
    year: YearSchema.optional(),
    income_type: z.string().optional(),
  })
  .openapi("ListTransactionsQuery");

export type ListTransactionsQuery = z.infer<typeof ListTransactionsQuerySchema>;

/** 全取引の変更履歴一覧のクエリ（件数の上限だけを受ける）。 */
export const ListRecentTransactionHistoryQuerySchema = z
  .object({
    /** 不正な値は未指定として扱う（既定件数で返す）。 */
    limit: z.coerce.number().int().positive().optional().catch(undefined).openapi({ type: "integer" }),
  })
  .openapi("ListRecentTransactionHistoryQuery");

export type ListRecentTransactionHistoryQuery = z.infer<
  typeof ListRecentTransactionHistoryQuerySchema
>;

export const LedgerPdfQuerySchema = z
  .object({
    year: z.coerce.number().int().min(2000).max(2100),
  })
  .openapi("LedgerPdfQuery");

export type LedgerPdfQuery = z.infer<typeof LedgerPdfQuerySchema>;

export const ListTransactionsResponseSchema = z
  .object({
    count: z.number(),
    transactions: z.array(TransactionSchema),
  })
  .openapi("TransactionList");

export type ListTransactionsResponse = z.infer<typeof ListTransactionsResponseSchema>;

export const SingleTransactionResponseSchema = z
  .object({
    transaction: TransactionSchema.nullable(),
  })
  .openapi("SingleTransaction");

export type SingleTransactionResponse = z.infer<typeof SingleTransactionResponseSchema>;

export const DeleteTransactionResponseSchema = z
  .object({
    deleted: TransactionSchema,
  })
  .openapi("DeleteTransaction");

export type DeleteTransactionResponse = z.infer<typeof DeleteTransactionResponseSchema>;

export const CreateTransactionRequestSchema = z
  .object({
    date: z.string().optional().catch(undefined),
    fiscal_year: z.number().optional().catch(undefined),
    description: z.string().optional().catch(undefined),
    amount: z.number().optional(),
    account: z.string().optional().catch(undefined),
    category: z.string().optional().catch(undefined),
    income_type: z.string().optional().catch(undefined),
    tax_category: z.string().optional().catch(undefined),
    /** 事業専用割合（家事按分、0〜100）。範囲外はハンドラ側で正規化する */
    business_ratio_percent: z.number().optional().catch(undefined),
    /** 按分根拠のメモ（任意） */
    business_ratio_basis: z.string().optional().catch(undefined),
    /** 登録と同時に紐付ける証憑のファイルID（任意） */
    receipt_file_ids: z.array(z.string()).optional().catch(undefined),
  })
  .openapi("CreateTransactionRequest");

export type CreateTransactionRequest = z.infer<typeof CreateTransactionRequestSchema>;

export const UpdateTransactionRequestSchema = z
  .object({
    date: z.string().optional().catch(undefined),
    fiscal_year: z.number().optional().catch(undefined),
    description: z.string().optional().catch(undefined),
    amount: z.number().optional().catch(undefined),
    account: z.string().optional().catch(undefined),
    category: z.string().optional().catch(undefined),
    income_type: z.string().optional().catch(undefined),
    tax_category: z.string().optional().catch(undefined),
    /** 事業専用割合（家事按分、0〜100）。範囲外はハンドラ側で正規化する */
    business_ratio_percent: z.number().optional().catch(undefined),
    /** 按分根拠のメモ（任意） */
    business_ratio_basis: z.string().optional().catch(undefined),
  })
  .openapi("UpdateTransactionRequest");

export type UpdateTransactionRequest = z.infer<typeof UpdateTransactionRequestSchema>;

/**
 * 1年分の取引の置き換えリクエスト（帳簿の確定保存）。
 * 項目の検証は CreateTransactionRequest と同じ緩さで受け、
 * date / amount の厳格チェックはハンドラ側で行う。
 */
export const ReplaceYearTransactionsRequestSchema = z
  .object({
    year: z.number(),
    transactions: z.array(CreateTransactionRequestSchema),
  })
  .openapi("ReplaceYearTransactionsRequest");

export type ReplaceYearTransactionsRequest = z.infer<
  typeof ReplaceYearTransactionsRequestSchema
>;

/** 取引の変更履歴1件（登録・更新・削除の記録）。 */
export const TransactionHistoryEntrySchema = z
  .object({
    id: z.number(),
    transaction_id: z.number(),
    /** created / updated / deleted */
    action: z.string(),
    before: TransactionSchema.nullable(),
    after: TransactionSchema.nullable(),
    created_at: z.string(),
  })
  .openapi("TransactionHistoryEntry");

export type TransactionHistoryEntryResponse = z.infer<typeof TransactionHistoryEntrySchema>;

export const ListTransactionHistoryResponseSchema = z
  .object({
    count: z.number(),
    history: z.array(TransactionHistoryEntrySchema),
  })
  .openapi("TransactionHistoryList");

export type ListTransactionHistoryResponse = z.infer<
  typeof ListTransactionHistoryResponseSchema
>;
