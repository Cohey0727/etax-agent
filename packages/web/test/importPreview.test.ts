/**
 * importPreview.test.ts — DB に保存されなかった CSV 取込を画面へ反映する規則の検証。
 *
 * 担保すること:
 * - 取込に含まれない年度の取引は画面に残る
 * - 取込に含まれる年度は取込分で差し替わる（同じ CSV を取り込み直しても重ならない）
 */
import { Transaction } from "@etax/shared";
import { describe, expect, test } from "bun:test";
import { mergeImportedPreview } from "../src/components/pages/AppPage/hooks/useLedgerSync";

const tx = (year: number, description: string): Transaction => ({
  date: `${year}-05-01`,
  year,
  description,
  amount: -1000,
  account: "事業口座",
  category: "通信費",
  income_type: "business",
  tax_category: "",
});

describe("mergeImportedPreview", () => {
  test("取込に含まれない年度の取引は残し、含まれる年度は取込分にする", () => {
    const current = [tx(2024, "2024の既存"), tx(2025, "2025の既存")];
    const imported = [tx(2025, "2025の取込A"), tx(2025, "2025の取込B")];
    expect(mergeImportedPreview(current, imported).map((t) => t.description)).toEqual([
      "2024の既存",
      "2025の取込A",
      "2025の取込B",
    ]);
  });

  test("同じ取込を2回反映しても重ならない", () => {
    const imported = [tx(2025, "2025の取込A")];
    const once = mergeImportedPreview([tx(2024, "2024の既存")], imported);
    expect(mergeImportedPreview(once, imported)).toEqual(once);
  });
});
