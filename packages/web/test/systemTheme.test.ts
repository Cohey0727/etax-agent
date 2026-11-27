/**
 * systemTheme.test.ts — テーマ「端末に合わせる」の追随の検証。
 *
 * 担保すること:
 * - 開いている間に端末の外観設定（ライト/ダーク）が変わったら、表示のテーマも変わる
 * - 購読を解除したら（別のテーマを選んだら）追随しない
 */
import { afterEach, describe, expect, test } from "bun:test";
import { followSystemTheme } from "../src/components/pages/AppPage/appPageStorage";

const globals = globalThis as Record<string, unknown>;
const originalWindow = globals.window;
const originalDocument = globals.document;
afterEach(() => {
  globals.window = originalWindow;
  globals.document = originalDocument;
});

const fakeEnvironment = () => {
  const listeners = new Set<() => void>();
  const media = {
    matches: false,
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  const dataset: Record<string, string> = {};
  globals.window = { matchMedia: () => media };
  globals.document = { documentElement: { dataset } };
  const setDark = (dark: boolean) => {
    media.matches = dark;
    for (const listener of listeners) listener();
  };
  return { dataset, setDark };
};

describe("followSystemTheme", () => {
  test("端末の外観設定の変化に合わせてテーマを切り替え、解除後は追随しない", () => {
    const { dataset, setDark } = fakeEnvironment();
    const stop = followSystemTheme();
    setDark(true);
    expect(dataset.theme).toBe("dark");
    setDark(false);
    expect(dataset.theme).toBe("light");
    stop();
    setDark(true);
    expect(dataset.theme).toBe("light");
  });
});
