import { describe, expect, test } from "bun:test";
import { parseCsv, Transaction } from "@etax/shared";
import { heuristicMapping } from "../src/services/csvImport/csvMapping";
import { parseWithMapping } from "../src/services/csvImport/csvParsing";
import {
  buildFingerprintCounts,
  excludeAlreadyImported,
  excludeImportedTransactions,
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

describe("excludeImportedTransactions", () => {
  const csv = "日付,摘要,金額\n2025/01/05,AWS,-5000\n2025/01/06,売上,300000\n";
  const parse = (sourceName: string) => {
    const rows = parseCsv(csv);
    const mapping = heuristicMapping(rows[0] ?? [], rows.slice(1));
    return { mapping, transactions: parseWithMapping(rows, mapping, sourceName).transactions };
  };
  const asExisting = (transactions: readonly Transaction[]): FingerprintFields[] =>
    transactions.map((t) => ({
      date: t.date,
      amount: t.amount,
      description: t.description,
      account: t.account,
      taxCategory: t.tax_category,
    }));

  test("口座列の無いCSVは、ファイル名が変わっても同じ明細を重複として除く", () => {
    const first = parse("meisai");
    const second = parse("meisai (1)");
    expect(first.mapping.accountColumn).toBeNull();
    const { fresh, duplicates } = excludeImportedTransactions(
      second.transactions,
      asExisting(first.transactions),
      second.mapping,
    );
    expect(fresh).toEqual([]);
    expect(duplicates).toBe(2);
  });

  test("口座列のあるCSVは、口座が違えば重複にしない", () => {
    const withAccount = "日付,摘要,金額,口座\n2025/01/05,AWS,-5000,三井住友カード\n";
    const rows = parseCsv(withAccount);
    const mapping = heuristicMapping(rows[0] ?? [], rows.slice(1));
    expect(mapping.accountColumn).toBe("口座");
    const incoming = parseWithMapping(rows, mapping, "card").transactions;
    const existing = [fields({ date: "2025-01-05", amount: -5000, description: "AWS", account: "楽天カード" })];
    const { fresh, duplicates } = excludeImportedTransactions(incoming, existing, mapping);
    expect(fresh).toHaveLength(1);
    expect(duplicates).toBe(0);
  });
});
