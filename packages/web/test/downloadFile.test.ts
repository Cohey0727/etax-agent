/**
 * downloadFile.test.ts — サーバーが生成したファイル（帳簿PDFなど）の保存の検証。
 *
 * 担保すること:
 * - 保存用のリンクは文書に付けてから押す（文書に無いリンクの click を無視するブラウザがある）
 * - Blob の URL は、押した直後ではなく保存が始まってから失効させる
 */
import { afterEach, describe, expect, test } from "bun:test";
import { downloadLedgerPdf } from "../src/utils/api";

const globals = globalThis as Record<string, unknown>;
const originalDocument = globals.document;
const originalFetch = globalThis.fetch;
const originalCreate = URL.createObjectURL;
const originalRevoke = URL.revokeObjectURL;
const originalSetTimeout = globalThis.setTimeout;
afterEach(() => {
  globalThis.setTimeout = originalSetTimeout;
  globals.document = originalDocument;
  globalThis.fetch = originalFetch;
  URL.createObjectURL = originalCreate;
  URL.revokeObjectURL = originalRevoke;
});

describe("downloadLedgerPdf", () => {
  test("リンクを文書に付けて押し、URL はその後で失効させる", async () => {
    const events: string[] = [];
    const anchor = {
      href: "",
      download: "",
      click: () => events.push(`click(attached=${attached.has(anchor)})`),
      remove: () => {
        attached.delete(anchor);
        events.push("remove");
      },
    };
    const attached = new Set<unknown>();
    globals.document = {
      createElement: () => anchor,
      body: { append: (node: unknown) => attached.add(node) },
    };
    globalThis.fetch = (async () => new Response(new Blob(["%PDF"]), { status: 200 })) as unknown as typeof fetch;
    URL.createObjectURL = () => "blob:ledger";
    URL.revokeObjectURL = (url: string) => {
      events.push(`revoke(${url})`);
    };
    const scheduled: (() => void)[] = [];
    globalThis.setTimeout = ((callback: () => void) => {
      scheduled.push(callback);
      return 0;
    }) as unknown as typeof setTimeout;

    await downloadLedgerPdf(2026);
    expect(anchor.download).toBe("帳簿_2026.pdf");
    expect(events).toEqual(["click(attached=true)", "remove"]);
    for (const callback of scheduled) callback();
    expect(events).toEqual(["click(attached=true)", "remove", "revoke(blob:ledger)"]);
  });
});
