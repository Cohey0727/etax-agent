/**
 * agentDbWrites.ts — 対話エージェントによる帳簿DBへの書き込み（services/agent）。
 *
 * アプリ内エージェントの読み取り系ツール（agentTools）は、会話に添付された
 * 取引スナップショットに対して動く。一方、変更・追加・削除は帳簿DB（正本）に
 * 対して行う必要があるため、ここで DB へ直接書き込む。書き込み後は
 * loadAllTransactions で DB 全件を読み直し、呼び出し側が ctx.transactions を
 * 差し替えることで、同じターン内の後続の集計も新しい状態で計算できる。
 *
 * 安全策:
 *   - 一括変更は「絞り込み条件が1つ以上」かつ「変更内容が1つ以上」を必須とし、
 *     500件を超える対象はエラーにして条件を絞らせる。
 *   - 削除は日付・摘要・金額が完全一致する1件だけに限る（複数該当はエラー）。
 *   - 科目を付け替えた場合は分類の学習にも反映する（MCP の add/update_transaction と
 *     同じ扱い）。取引の追加は帳簿画面・MCP と同じ本体（transactionWrites）を使う。
 */
import { IncomeType, Transaction, normalizeSearchText } from "@etax/shared";
import { getDb } from "../../lib/db";
import {
  deleteTransactionRow,
  effectiveFiscalYear,
  listTransactionRows,
  transactionToApi,
  updateTransactionRowWith,
} from "../../repositories/transactionRepository";
import { TransactionRow } from "../../repositories/schema";
import { rowToTransaction } from "../mcp/mcpToolKit";
import {
  createTransaction,
  recordClassificationAfterSave,
} from "../transactions/transactionWrites";

/** 一括変更の上限件数（誤った条件での大量変更を防ぐ）。 */
const MAX_BULK_UPDATE = 500;

export interface UpdateTransactionsArgs {
  /** 摘要・口座名・科目への部分一致キーワード。 */
  keyword?: string;
  /** 割り当て年度での絞り込み。 */
  year?: number;
  /** 現在の科目（完全一致）での絞り込み。 */
  category?: string;
  /** 現在の区分での絞り込み。 */
  incomeType?: IncomeType;
  /** 変更後の科目。 */
  setCategory?: string;
  /** 変更後の区分。 */
  setIncomeType?: IncomeType;
  /** 変更後の税区分。 */
  setTaxCategory?: string;
}

/** 一括変更の対象行を選ぶ（読み取り系の検索と同じ正規化・一致ルール）。 */
function matchRows(rows: TransactionRow[], args: UpdateTransactionsArgs): TransactionRow[] {
  const needle = args.keyword ? normalizeSearchText(args.keyword) : null;
  return rows.filter((row) => {
    if (args.year !== undefined && effectiveFiscalYear(row) !== args.year) return false;
    if (args.category !== undefined && row.category !== args.category) return false;
    if (args.incomeType !== undefined && row.incomeType !== args.incomeType) return false;
    if (needle) {
      const hit =
        normalizeSearchText(row.description).includes(needle) ||
        normalizeSearchText(row.account).includes(needle) ||
        normalizeSearchText(row.category).includes(needle);
      if (!hit) return false;
    }
    return true;
  });
}

/**
 * 文字列の引数を、前後の空白を除いて空なら未指定として扱う。
 * LLM は任意の文字列引数を空文字で埋めることがあり、空文字を「指定あり」と
 * 読むと、絞り込みなしの全件変更や科目の空文字上書きになるため。
 */
function presentText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 条件に合う取引へ科目・区分・税区分を一括で付け替える。
 * 条件不足・対象なし・上限超過は Error を投げる（呼び出し側で LLM へ返す）。
 */
export async function updateTransactionsBulk(rawArgs: UpdateTransactionsArgs) {
  const args: UpdateTransactionsArgs = {
    ...rawArgs,
    keyword: presentText(rawArgs.keyword),
    category: presentText(rawArgs.category),
    setCategory: presentText(rawArgs.setCategory),
    setTaxCategory: presentText(rawArgs.setTaxCategory),
  };
  const db = getDb();
  if (!db) throw new Error("帳簿DBが利用できないため、取引を変更できませんでした");
  const hasCriterion =
    args.keyword !== undefined ||
    args.year !== undefined ||
    args.category !== undefined ||
    args.incomeType !== undefined;
  if (!hasCriterion) {
    throw new Error("変更対象の絞り込み条件（keyword / year / category / income_type）が最低1つ必要です");
  }
  const patch: Partial<TransactionRow> = {};
  if (args.setCategory !== undefined) patch.category = args.setCategory;
  if (args.setIncomeType !== undefined) patch.incomeType = args.setIncomeType;
  if (args.setTaxCategory !== undefined) patch.taxCategory = args.setTaxCategory;
  if (Object.keys(patch).length === 0) {
    throw new Error("変更内容（set_category / set_income_type / set_tax_category）が最低1つ必要です");
  }
  const rows = await listTransactionRows(db);
  const matched = matchRows(rows, args);
  if (matched.length === 0) {
    throw new Error(
      "帳簿DBに条件に合う取引が見つかりませんでした（表示中のデータがサンプルや未保存のCSVの場合は変更できません）",
    );
  }
  if (matched.length > MAX_BULK_UPDATE) {
    throw new Error(
      `対象が ${matched.length} 件と多すぎます（上限 ${MAX_BULK_UPDATE} 件）。キーワードや年度で条件を絞ってください`,
    );
  }
  // 一括更新は1トランザクションで行う（途中で失敗したら全件戻す）。
  const updated = await db.transaction(async (tx) => {
    let count = 0;
    for (const row of matched) {
      const result = await updateTransactionRowWith(tx, row.id, patch);
      if (result) count += 1;
    }
    return count;
  });
  // 科目の付け替えは分類の学習にも反映する（摘要ごとに1回）。変更は確定済みなので、
  // 記録の失敗は変更の失敗にせず警告として返す。
  let warning: string | null = null;
  if (args.setCategory !== undefined && args.setCategory !== "未分類") {
    const descriptions = [...new Set(matched.map((row) => row.description))].slice(0, 20);
    for (const description of descriptions) {
      warning ??= await recordClassificationAfterSave(description, args.setCategory);
    }
  }
  return {
    ok: true as const,
    ...(warning ? { warning } : {}),
    matched: matched.length,
    updated,
    total_amount: matched.reduce((sum, row) => sum + row.amount, 0),
    changes: {
      ...(args.setCategory !== undefined ? { category: args.setCategory } : {}),
      ...(args.setIncomeType !== undefined ? { income_type: args.setIncomeType } : {}),
      ...(args.setTaxCategory !== undefined ? { tax_category: args.setTaxCategory } : {}),
    },
    samples: matched.slice(0, 5).map((row) => ({
      date: row.date,
      description: row.description,
      amount: row.amount,
      account: row.account,
    })),
  };
}

export interface AddTransactionArgs {
  date: string;
  description: string;
  /** 符号つき税込金額（収入は正、支出は負）。 */
  amount: number;
  account?: string;
  category?: string;
  incomeType?: IncomeType;
  taxCategory?: string;
  /** 割り当て年度。省略時は日付の年。 */
  year?: number;
}

/** 取引を1件、帳簿DBへ追加する（帳簿画面・MCP と同じ本体で検証・学習する）。 */
export async function addTransactionForAgent(args: AddTransactionArgs) {
  const db = getDb();
  if (!db) throw new Error("帳簿DBが利用できないため、取引を追加できませんでした");
  const { transaction, learningWarning } = await createTransaction(
    db,
    {
      date: args.date,
      fiscalYear: args.year,
      description: args.description,
      amount: args.amount,
      account: args.account,
      category: args.category,
      incomeType: args.incomeType,
      taxCategory: args.taxCategory,
    },
    { learn: true },
  );
  return {
    ok: true as const,
    transaction: transactionToApi(transaction),
    ...(learningWarning ? { warning: learningWarning } : {}),
  };
}

export interface DeleteTransactionArgs {
  date: string;
  description: string;
  amount: number;
}

/** 日付・摘要・金額が完全一致する1件だけを削除する（複数該当はエラー）。 */
export async function deleteTransactionExact(args: DeleteTransactionArgs) {
  const db = getDb();
  if (!db) throw new Error("帳簿DBが利用できないため、取引を削除できませんでした");
  const rows = await listTransactionRows(db);
  const matched = rows.filter(
    (row) => row.date === args.date && row.description === args.description && row.amount === args.amount,
  );
  if (matched.length === 0) {
    throw new Error("日付・摘要・金額が完全一致する取引が帳簿DBに見つかりませんでした");
  }
  if (matched.length > 1) {
    throw new Error(
      `同じ日付・摘要・金額の取引が ${matched.length} 件あります。削除は1件に特定できる場合だけ可能です`,
    );
  }
  const deleted = await deleteTransactionRow(db, matched[0].id);
  if (!deleted) throw new Error("取引の削除に失敗しました");
  return { ok: true as const, deleted: transactionToApi(deleted) };
}

/** 帳簿DBの全取引を、会話添付用（shared の Transaction 形式）で読み直す。 */
export async function loadAllTransactionsForAgent(): Promise<Transaction[]> {
  const db = getDb();
  if (!db) return [];
  const rows = await listTransactionRows(db);
  return rows.map(rowToTransaction);
}
