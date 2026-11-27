/**
 * tenantIdor.test.ts — テナント分離（IDOR）の検証。
 *
 * 固定資産・証憑・取引履歴・CSV指紋について、別テナントからは
 * 「存在しない」として扱われること（取得 null / 更新 null / 削除 false /
 * 一覧に現れない）を検証する。テスト用 PostgreSQL。
 */
import { describe, expect, test } from "bun:test";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import {
  deleteFixedAssetRow,
  getFixedAssetRow,
  insertFixedAssetRow,
  updateFixedAssetRow,
} from "../src/repositories/fixedAssetRepository";
import {
  getReceiptRowByFileId,
  linkReceiptRow,
  listReceiptRowsForTransaction,
  unlinkReceiptRow,
  upsertReceiptExtraction,
} from "../src/repositories/receiptRepository";
import {
  deleteTransactionRow,
  insertTransactionRow,
  listTransactionFingerprintRows,
  listTransactionHistoryRows,
} from "../src/repositories/transactionRepository";
import { createUser } from "../src/repositories/userRepository";

const assetValues = {
  name: "パソコン",
  quantity: "1台",
  incomeType: "business",
  acquisitionDate: "2025-04-01",
  serviceStartDate: null,
  cost: 600_000,
  usefulLifeYears: 4,
  method: "straight_line",
  businessRatioPercent: 100,
  disposedDate: null,
};

const txValues = {
  date: "2026-01-05",
  fiscalYear: 2026,
  description: "売上",
  amount: 1000,
  account: "事業口座",
  category: "売上高",
  incomeType: "business",
  taxCategory: "",
};

const EXTRACTED = {
  date: "2026-11-01",
  amount: 5500,
  payee: "コンビニ",
  description: "消耗品",
  classification: { account: "消耗品費", confidence: null, source: "rules" as const, candidates: [] },
};

describe("固定資産の所有者分離（IDOR）", () => {
  test("別テナントからは取得・更新・削除ができない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");

    const asset = await runWithTenant(userA.id, () =>
      insertFixedAssetRow(db, assetValues),
    );
    expect(asset).not.toBeNull();

    const seenByB = await runWithTenant(userB.id, () =>
      getFixedAssetRow(db, asset!.id),
    );
    expect(seenByB).toBeNull();

    const updatedByB = await runWithTenant(userB.id, () =>
      updateFixedAssetRow(db, asset!.id, { name: "乗っ取り" }),
    );
    expect(updatedByB).toBeNull();

    const deletedByB = await runWithTenant(userB.id, () =>
      deleteFixedAssetRow(db, asset!.id),
    );
    expect(deletedByB).toBe(false);

    // 所有者本人からは従来どおり見える・更新できる
    const seenByA = await runWithTenant(userA.id, () =>
      getFixedAssetRow(db, asset!.id),
    );
    expect(seenByA?.name).toBe("パソコン");
  });
});

describe("証憑の所有者分離（IDOR）", () => {
  test("登録時に所有者が付き、別テナントからは見えない・触れない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");
    const fileId = "123e4567-e89b-12d3-a456-426614174001";

    const inserted = await runWithTenant(userA.id, () =>
      upsertReceiptExtraction(db, fileId, "image/jpeg", EXTRACTED),
    );
    // 既定値 1 ではなく登録したユーザーが所有者になる
    expect(inserted?.ownerUserId).toBe(userA.id);

    const seenByB = await runWithTenant(userB.id, () =>
      getReceiptRowByFileId(db, fileId),
    );
    expect(seenByB).toBeNull();

    // 別テナントの upsert は既存行を上書きしない
    const overwrittenByB = await runWithTenant(userB.id, () =>
      upsertReceiptExtraction(db, fileId, "image/png", { ...EXTRACTED, amount: 1 }),
    );
    expect(overwrittenByB).toBeNull();
    const afterA = await runWithTenant(userA.id, () =>
      getReceiptRowByFileId(db, fileId),
    );
    expect(afterA?.mimeType).toBe("image/jpeg");

    // 別テナントの取引への付け替え・解除もできない
    const txB = await runWithTenant(userB.id, () => insertTransactionRow(db, txValues));
    const linkedByB = await runWithTenant(userB.id, () =>
      linkReceiptRow(db, fileId, txB!.id),
    );
    expect(linkedByB).toBeNull();
    const unlinkedByB = await runWithTenant(userB.id, () =>
      unlinkReceiptRow(db, fileId),
    );
    expect(unlinkedByB).toBeNull();

    // 取引に紐付いた証憑の一覧も所有者で絞られる
    const txA = await runWithTenant(userA.id, () => insertTransactionRow(db, txValues));
    await runWithTenant(userA.id, () => linkReceiptRow(db, fileId, txA!.id));
    const listForB = await runWithTenant(userB.id, () =>
      listReceiptRowsForTransaction(db, txA!.id),
    );
    expect(listForB).toEqual([]);
    const listForA = await runWithTenant(userA.id, () =>
      listReceiptRowsForTransaction(db, txA!.id),
    );
    expect(listForA.length).toBe(1);
  });

  test("自分の証憑でも、別テナントの取引・削除済みの取引には紐付けられない", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");
    const fileId = "123e4567-e89b-12d3-a456-426614174002";
    const txA = await runWithTenant(userA.id, () => insertTransactionRow(db, txValues));

    // 証憑レコードが無い fileId でも、別テナントの取引への紐付けは作らない
    const linkedToForeign = await runWithTenant(userB.id, () =>
      linkReceiptRow(db, fileId, txA!.id),
    );
    expect(linkedToForeign).toBeNull();
    expect(await runWithTenant(userB.id, () => getReceiptRowByFileId(db, fileId))).toBeNull();

    // 自分の証憑を別テナントの取引へ付け替えることもできない
    const txB = await runWithTenant(userB.id, () => insertTransactionRow(db, txValues));
    await runWithTenant(userB.id, () => linkReceiptRow(db, fileId, txB!.id));
    const relinked = await runWithTenant(userB.id, () => linkReceiptRow(db, fileId, txA!.id));
    expect(relinked).toBeNull();
    const ownRow = await runWithTenant(userB.id, () => getReceiptRowByFileId(db, fileId));
    expect(ownRow?.transactionId).toBe(txB!.id);

    // 削除済みの取引には紐付けない
    await runWithTenant(userB.id, () => deleteTransactionRow(db, txB!.id));
    const txB2 = await runWithTenant(userB.id, () => insertTransactionRow(db, txValues));
    await runWithTenant(userB.id, () => linkReceiptRow(db, fileId, txB2!.id));
    const toDeleted = await runWithTenant(userB.id, () => linkReceiptRow(db, fileId, txB!.id));
    expect(toDeleted).toBeNull();
  });
});

describe("取引履歴と CSV 指紋の所有者分離", () => {
  test("別テナントの履歴は返らず、指紋は自テナント分だけになる", async () => {
    const db = await createTestDb();
    const userA = await createUser(db, "a@example.com", "password-123");
    const userB = await createUser(db, "b@example.com", "password-456");

    const txA = await runWithTenant(userA.id, () => insertTransactionRow(db, txValues));
    expect(txA).not.toBeUndefined();

    const historyForA = await runWithTenant(userA.id, () =>
      listTransactionHistoryRows(db, txA!.id),
    );
    expect(historyForA.length).toBe(1);
    const historyForB = await runWithTenant(userB.id, () =>
      listTransactionHistoryRows(db, txA!.id),
    );
    expect(historyForB).toEqual([]);

    const fingerprintsForB = await runWithTenant(userB.id, () =>
      listTransactionFingerprintRows(db),
    );
    expect(fingerprintsForB).toEqual([]);
    const fingerprintsForA = await runWithTenant(userA.id, () =>
      listTransactionFingerprintRows(db),
    );
    expect(fingerprintsForA.length).toBe(1);
  });
});
