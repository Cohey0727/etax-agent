import { describe, expect, test } from "bun:test";
import { IncomeTaxResult } from "@etax/shared";
import { declaredIncomeTax } from "../src/features/filing/declaredIncomeTax";

function result(standardIncomeTax: number, reconstructionTax: number): IncomeTaxResult {
  return { standardIncomeTax, reconstructionTax } as IncomeTaxResult;
}

describe("申告納税額", () => {
  test("源泉徴収税額を引いてから100円未満を切り捨て、予定納税額を引いた残りが第3期分", () => {
    expect(declaredIncomeTax(result(120_000, 3_456), 10_050, 50_000)).toEqual({
      declaredTax: 113_400,
      thirdPeriodTax: 63_400,
    });
  });

  test("源泉徴収税額が多ければ申告納税額は負（還付）のまま切り捨てない", () => {
    expect(declaredIncomeTax(result(9_800, 205), 30_000, 0)).toEqual({
      declaredTax: -19_995,
      thirdPeriodTax: -19_995,
    });
  });
});
