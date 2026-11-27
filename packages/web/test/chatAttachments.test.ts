/**
 * chatAttachments.test.ts — チャット添付の読み込みの検証。
 *
 * 担保すること:
 * - crypto.randomUUID が使えない環境（http で開いたときなど、セキュアコンテキスト外）でも
 *   添付を読み込め、添付ごとに別の id が付く
 */
import { afterEach, describe, expect, test } from "bun:test";
import { readAttachment } from "../src/components/organisms/agent/AgentChatPanel/chatAttachments";

const globals = globalThis as Record<string, unknown>;
const originalCrypto = globals.crypto;
afterEach(() => {
  globals.crypto = originalCrypto;
});

describe("readAttachment", () => {
  test("crypto.randomUUID が無くても読み込め、id が重ならない", async () => {
    globals.crypto = {};
    const csv = () => new File(["日付,金額\n2026-01-01,100\n"], "meisai.csv", { type: "text/csv" });
    const first = await readAttachment(csv());
    const second = await readAttachment(csv());
    expect(first.text).toBe("日付,金額\n2026-01-01,100\n");
    expect(first.id).not.toBe(second.id);
  });
});
