import { ledgerRowToTransaction, Transaction, transactionToLedgerInput } from "@etax/shared";
import { ApiError, createLedgerTransaction, linkReceipt } from "@utils/api";

/** 領収書から登録した結果。persisted は帳簿DBに保存できたか、linked は証憑を紐付けたか。 */
export interface ReceiptRegistration {
  transaction: Transaction;
  persisted: boolean;
  linked: boolean;
}

/**
 * 領収書の取引を帳簿へ1件追加し、解析した証憑（fileId）をその取引へ紐付ける。
 * 年度ごとの置き換えは使わない（既存取引の id が変わり、証憑や消込の紐付けが外れるため）。
 * 帳簿DBが無い（503）ときは保存せず、画面の取引にだけ加える。
 */
export async function registerReceiptTransaction(
  tx: Transaction,
  fileId: string | null,
): Promise<ReceiptRegistration> {
  let created;
  try {
    created = await createLedgerTransaction(transactionToLedgerInput(tx));
  } catch (e) {
    if (e instanceof ApiError && e.status === 503) {
      return { transaction: tx, persisted: false, linked: false };
    }
    throw e;
  }
  let linked = false;
  if (fileId) {
    try {
      await linkReceipt(fileId, created.id);
      linked = true;
    } catch {
      // 紐付けに失敗しても取引の登録は成立している（証憑の一覧から紐付け直せる）
    }
  }
  return { transaction: ledgerRowToTransaction(created), persisted: true, linked };
}
