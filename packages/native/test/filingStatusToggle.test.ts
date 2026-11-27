import "./nativeMocks";
import { describe, expect, test } from "bun:test";
import { FilingStatus } from "../src/api/types";

const { toggleFilingStatus } = await import("../src/features/filing/useFilingStatus");

const UPDATED: FilingStatus = {
  year: 2025,
  confirmed: false,
  confirmed_at: null,
  calculated: true,
  calculated_at: "2025-03-01T00:00:00Z",
  submitted: false,
  submitted_at: null,
};

describe("確定の切り替え", () => {
  test("ステータスを保存できなかったら確定スナップショットを作らない", async () => {
    let confirmed = 0;
    const outcome = await toggleFilingStatus(true, async () => null, async () => {
      confirmed += 1;
      return true;
    });
    expect(outcome).toBe("statusFailed");
    expect(confirmed).toBe(0);
  });

  test("確定にできたら控えを作り、控えの保存失敗は失敗として返す", async () => {
    expect(await toggleFilingStatus(true, async () => UPDATED, async () => false)).toBe(
      "confirmFailed",
    );
    expect(await toggleFilingStatus(true, async () => UPDATED, async () => true)).toBe("saved");
  });

  test("確定解除では控えを作らない", async () => {
    let confirmed = 0;
    const outcome = await toggleFilingStatus(false, async () => UPDATED, async () => {
      confirmed += 1;
      return true;
    });
    expect(outcome).toBe("saved");
    expect(confirmed).toBe(0);
  });
});
