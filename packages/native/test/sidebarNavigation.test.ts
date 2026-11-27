import { describe, expect, test } from "bun:test";
import { sidebarNavigation } from "../src/components/AppSidebar/AppSidebar.utils";

describe("sidebarNavigation", () => {
  test("ダッシュボードからは次の画面を積む", () => {
    expect(sidebarNavigation("/", "/ledger")).toBe("push");
  });

  test("ダッシュボード以外からは、履歴に戻るか今の画面と入れ替える（積み増さない）", () => {
    expect(sidebarNavigation("/ledger", "/reports")).toBe("dismissTo");
    expect(sidebarNavigation("/reports", "/")).toBe("dismissTo");
    expect(sidebarNavigation("/filing", "/filing")).toBe("dismissTo");
  });
});
