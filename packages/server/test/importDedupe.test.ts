import { describe, expect, test } from "bun:test";
import {
  buildFingerprintCounts,
  excludeAlreadyImported,
  FingerprintFields,
  transactionFingerprint,
} from "../src/services/csvImport/importDedupe";

const fields = (over: Partial<FingerprintFields> = {}): FingerprintFields => ({
  date: "2026-01-15",
  amount: -1000,
  description: "セブン-イレブン",
  account: "PayPay",
  taxCategory: "",
  ...over,
});

describe("excludeAlreadyImported", () => {
  test("同じCSVを再取り込みすると全件が重複になる", () => {
    const batch = [fields(), fields({ description: "ローソン" })];
    const existing = buildFingerprintCounts(batch);
    const { fresh, duplicates } = excludeAlreadyImported(
      batch,
      transactionFingerprint,
      existing,
    );
    expect(fresh).toEqual([]);
    expect(duplicates).toBe(2);
  });

  test("期間が重なるCSVでは超過分だけが新規になる", () => {
    const existing = buildFingerprintCounts([fields(), fields()]);
    const incoming = [fields(), fields(), fields()];
    const { fresh, duplicates } = excludeAlreadyImported(
      incoming,
      transactionFingerprint,
      existing,
    );
    expect(fresh.length).toBe(1);
    expect(duplicates).toBe(2);
  });

  test("同日・同額・同名の別取引は件数で区別され、初回は全部通る", () => {
    const incoming = [fields(), fields(), fields()];
    const { fresh, duplicates } = excludeAlreadyImported(
      incoming,
      transactionFingerprint,
      buildFingerprintCounts([]),
    );
    expect(fresh.length).toBe(3);
    expect(duplicates).toBe(0);
  });

  test("口座が違えば重複にしない", () => {
    const existing = buildFingerprintCounts([fields()]);
    const incoming = [fields({ account: "三井住友銀行" })];
    const { fresh, duplicates } = excludeAlreadyImported(
      incoming,
      transactionFingerprint,
      existing,
    );
    expect(fresh.length).toBe(1);
    expect(duplicates).toBe(0);
  });

  test("科目が変わっても指紋は変わらない（科目は指紋に含めない）", () => {
    const a = transactionFingerprint(fields());
    const b = transactionFingerprint(fields({ taxCategory: "" }));
    expect(a).toBe(b);
  });
});
