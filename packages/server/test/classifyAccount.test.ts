import { describe, expect, test } from "bun:test";
import {
  ClassificationHistoryRecord,
  normalizeDescriptionKey,
} from "../src/repositories/classificationHistoryRepository";
import {
  guardStoreRent,
  matchHistory,
} from "../src/services/classification/classifyAccount";

const record = (
  description: string,
  account: string,
  count = 1,
): ClassificationHistoryRecord => ({
  key: normalizeDescriptionKey(description),
  description,
  account,
  count,
  updatedAt: "2026-11-15T00:00:00.000Z",
});

describe("matchHistory", () => {
  test("完全一致は1回の確定でも拾う", () => {
    const hit = matchHistory("ＣａＳｙ", [record("ＣａＳｙ", "雑費", 1)]);
    expect(hit?.account).toBe("雑費");
  });

  test("部分一致は1回の確定では広げない", () => {
    const hit = matchHistory("セブン-イレブン - 尾道向東店", [
      record("セブン-イレブン", "支払手数料", 1),
    ]);
    expect(hit).toBeNull();
  });

  test("部分一致は2回以上の確定（傾向）なら拾う", () => {
    const hit = matchHistory("セブン-イレブン - 尾道向東店", [
      record("セブン-イレブン", "消耗品費", 2),
    ]);
    expect(hit?.account).toBe("消耗品費");
  });

  test("履歴が無ければ null", () => {
    expect(matchHistory("何か", [])).toBeNull();
  });

  test("全角英数の履歴に半角の摘要でも当たる", () => {
    const hit = matchHistory("casy", [record("ＣａＳｙ", "雑費", 1)]);
    expect(hit?.account).toBe("雑費");
  });

  test("半角カタカナの履歴に全角カタカナの摘要でも当たる", () => {
    const hit = matchHistory("カタリス", [record("ｶﾀﾘｽ", "通信費", 1)]);
    expect(hit?.account).toBe("通信費");
  });

  test("保存キーが旧形式でも摘要から作り直して当たる", () => {
    const legacy: ClassificationHistoryRecord = {
      key: "ｃａｓｙ",
      description: "ＣａＳｙ",
      account: "雑費",
      count: 1,
      updatedAt: "2026-11-15T00:00:00.000Z",
    };
    const hit = matchHistory("CASY", [legacy]);
    expect(hit?.account).toBe("雑費");
  });
});

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
