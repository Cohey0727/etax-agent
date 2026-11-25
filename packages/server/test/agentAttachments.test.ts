/**
 * agentAttachments.test.ts — チャット添付の検証とメッセージ変換（services/agent）。
 * LLM は呼ばず、純粋関数の変換結果だけを確認する。
 */
import { describe, expect, test } from "bun:test";
import {
  AgentChatAttachment,
  buildUserContent,
  singleCsvText,
  toModelMessages,
  validateChatAttachments,
} from "../src/services/agent/agentAttachments";

const png: AgentChatAttachment = {
  name: "receipt.png",
  mimeType: "image/png",
  dataBase64: "aGVsbG8=",
};
const pdf: AgentChatAttachment = {
  name: "invoice.pdf",
  mimeType: "application/pdf",
  dataBase64: "aGVsbG8=",
};
const csv: AgentChatAttachment = {
  name: "sales.csv",
  mimeType: "text/csv",
  text: "date,amount\n2026-01-05,1200",
};

describe("validateChatAttachments", () => {
  test("画像・PDF・CSV は通る", () => {
    expect(() => validateChatAttachments([png, pdf, csv])).not.toThrow();
  });

  test("対応外の形式は弾く", () => {
    expect(() =>
      validateChatAttachments([{ name: "x.html", mimeType: "text/html", dataBase64: "AA==" }]),
    ).toThrow("対応していないファイル形式です");
    expect(() =>
      validateChatAttachments([{ name: "x.svg", mimeType: "image/svg+xml", dataBase64: "AA==" }]),
    ).toThrow("対応していないファイル形式です");
  });

  test("中身が無い添付は弾く", () => {
    expect(() => validateChatAttachments([{ name: "a.png", mimeType: "image/png" }])).toThrow(
      "読み取れませんでした",
    );
    expect(() => validateChatAttachments([{ name: "a.csv", mimeType: "text/csv" }])).toThrow(
      "読み取れませんでした",
    );
  });

  test("件数の上限を超えたら弾く", () => {
    expect(() => validateChatAttachments([png, png, png, png, png, png])).toThrow(
      "添付ファイルは5件までです",
    );
  });
});

describe("buildUserContent / toModelMessages", () => {
  test("添付が無ければ本文は文字列のまま", () => {
    expect(buildUserContent("こんにちは", [])).toBe("こんにちは");
    const messages = toModelMessages([{ role: "user", content: "質問" }], []);
    expect(messages).toEqual([{ role: "user", content: "質問" }]);
  });

  test("画像は image パート、PDF は file パートになる", () => {
    const content = buildUserContent("見て", [png, pdf]);
    expect(Array.isArray(content)).toBe(true);
    if (!Array.isArray(content)) throw new Error("parts になっていません");
    expect(content[0]).toEqual({
      type: "text",
      text: "見て\n（添付ファイル: receipt.png、invoice.pdf）",
    });
    expect(content[1]).toEqual({ type: "image", image: "aGVsbG8=" });
    expect(content[2]).toEqual({
      type: "file",
      data: "aGVsbG8=",
      mediaType: "application/pdf",
      filename: "invoice.pdf",
    });
  });

  test("CSV はテキストパートとして同梱される", () => {
    const content = buildUserContent("集計して", [csv]);
    if (!Array.isArray(content)) throw new Error("parts になっていません");
    expect(content).toHaveLength(2);
    expect(content[1]?.type).toBe("text");
    if (content[1]?.type === "text") {
      expect(content[1].text).toContain("sales.csv");
      expect(content[1].text).toContain("2026-01-05,1200");
    }
  });

  test("添付は最後のユーザー発言にだけ付く", () => {
    const messages = toModelMessages(
      [
        { role: "user", content: "1回目" },
        { role: "assistant", content: "回答" },
        { role: "user", content: "2回目" },
      ],
      [png],
    );
    expect(messages[0]).toEqual({ role: "user", content: "1回目" });
    expect(messages[1]).toEqual({ role: "assistant", content: "回答" });
    expect(Array.isArray(messages[2]?.content)).toBe(true);
  });
});

describe("singleCsvText", () => {
  test("CSV が1件ならそのテキスト、複数なら undefined", () => {
    expect(singleCsvText([csv])).toBe(csv.text);
    expect(singleCsvText([csv, csv])).toBeUndefined();
    expect(singleCsvText([png])).toBeUndefined();
  });
});
