import { describe, expect, test } from "bun:test";
import { guardStoreRent } from "../src/services/classification/classifyAccount";

describe("guardStoreRent", () => {
  test("コンビニが地代家賃になったら雑費に寄せる", () => {
    expect(guardStoreRent("地代家賃", "セブン-イレブン - 尾道向東")).toBe("雑費");
  });

  test("スーパーが地代家賃になったら雑費に寄せる", () => {
    expect(guardStoreRent("地代家賃", "ハローズ - ハローズ　向島店")).toBe("雑費");
  });

  test("本物の家賃は地代家賃のまま", () => {
    expect(guardStoreRent("地代家賃", "事務所家賃 11月分")).toBe("地代家賃");
  });

  test("地代家賃以外は店舗名でも変えない", () => {
    expect(guardStoreRent("消耗品費", "セブン-イレブン - 尾道向東")).toBe("消耗品費");
  });
});
