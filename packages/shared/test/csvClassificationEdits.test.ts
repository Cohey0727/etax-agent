import { describe, expect, test } from "bun:test";
import { applyCsvClassificationEdits, Transaction } from "../src/index";

interface Row {
  id: number;
  date: string;
  amount: number;
  description: string;
  account: string;
  category: string;
  income_type: string;
}

const row = (id: number, description: string, category = "未分類"): Row => ({
  id,
  date: "2025-04-01",
  amount: -1100,
  description,
  account: "カード",
  category,
  income_type: "other",
});

const imported = (description: string, category: string): Transaction => ({
  date: "2025-04-01",
  year: 2025,
  description,
  amount: -1100,
  account: "カード",
  category,
  income_type: "business",
  tax_category: "",
});

describe("applyCsvClassificationEdits", () => {
  test("付け直した科目・区分が帳簿と違う行だけを保存する", async () => {
    const saved: Row[] = [];
    const result = await applyCsvClassificationEdits(
      [row(1, "AWS"), row(2, "コーヒー", "会議費")],
      [imported("AWS", "通信費"), { ...imported("コーヒー", "会議費"), income_type: "other" }],
      async (edited) => {
        saved.push(edited);
        return edited;
      },
    );
    expect(saved.map((r) => [r.id, r.category, r.income_type])).toEqual([[1, "通信費", "business"]]);
    expect(result.map((r) => r.category)).toEqual(["通信費", "会議費"]);
  });

  test("同じ組み合わせの行が複数あっても、1件ずつ別の行へ対応付ける", async () => {
    const saved: number[] = [];
    await applyCsvClassificationEdits(
      [row(1, "AWS"), row(2, "AWS")],
      [imported("AWS", "通信費"), imported("AWS", "通信費")],
      async (edited) => {
        saved.push(edited.id);
        return edited;
      },
    );
    expect(saved).toEqual([1, 2]);
  });

  test("保存が失敗しても、返す行は編集後の値にする", async () => {
    const result = await applyCsvClassificationEdits([row(1, "AWS")], [imported("AWS", "通信費")], async () => {
      throw new Error("offline");
    });
    expect(result[0]?.category).toBe("通信費");
  });

  test("対応する帳簿の行が無い取込分は無視する", async () => {
    const saved: Row[] = [];
    const result = await applyCsvClassificationEdits([row(1, "AWS")], [imported("別の摘要", "通信費")], async (e) => {
      saved.push(e);
      return e;
    });
    expect(saved).toEqual([]);
    expect(result).toEqual([row(1, "AWS")]);
  });
});
