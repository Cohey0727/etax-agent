/**
 * filingSubmissions.test.ts — 提出の記録（受付番号・受信通知PDF）の
 * リポジトリとHTTP経路（Issue #28 Phase 1）。
 *
 * 担保すること:
 * - 受付番号・提出日の保存→取得の往復と、申告ステータス「提出済み」
 *   との連動
 * - 変更履歴（filing_submission_history）に登録・更新・削除が
 *   スナップショット付きで残ること（電帳法の訂正・削除履歴に相当）
 * - 受信通知PDFの presign → アップロード → 添付 → 配信 → 差し替え →
 *   削除の一連と、PDF以外の添付が弾かれること
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTestDb } from "./testDb";
import { filingSubmissionHistoryTable } from "../src/repositories/schema";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;
const dataDir = mkdtempSync(join(tmpdir(), "etax-filing-submissions-"));
process.env.ETAX_DATA_DIR = dataDir;

const PDF_BYTES = new Uint8Array(
  Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"),
);
const PNG_BYTES = new Uint8Array(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
);

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

beforeAll(async () => {
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

async function req(
  path: string,
  init: { method?: string; json?: unknown; body?: Uint8Array; contentType?: string } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (init.json !== undefined) headers["Content-Type"] = "application/json";
  if (init.contentType) headers["Content-Type"] = init.contentType;
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

/** 受信通知PDFを presign → アップロードまで済ませ、ファイルIDを返す。 */
async function uploadReceiptPdf(bytes: Uint8Array, contentType: string): Promise<string> {
  const presign = await req("/api/files/presign-upload", {
    method: "POST",
    json: { contentType, purpose: "filing_receipt" },
  });
  expect(presign.status).toBe(200);
  const fileId = presign.body.fileId as string;
  const uploadUrl = presign.body.uploadUrl as string;
  expect(uploadUrl).toContain(`filing-receipts/${fileId}`);
  const put = await req(uploadUrl, { method: "PUT", body: bytes, contentType });
  expect(put.status).toBe(200);
  return fileId;
}

describe("HTTP: 提出の記録（受付番号）", () => {
  test("保存→取得の往復と、申告ステータスの提出済みとの連動", async () => {
    await createTestDb();
    const empty = await req("/api/filing-submissions/2025");
    expect(empty.status).toBe(200);
    expect((empty.body.submissions as unknown[]).length).toBe(0);

    const saved = await req("/api/filing-submissions/2025/income", {
      method: "PUT",
      json: { acceptance_number: "20260210123456789012", submitted_date: "2026-02-10" },
    });
    expect(saved.status).toBe(200);
    const submission = saved.body.submission as {
      acceptance_number: string;
      submitted_date: string;
      receipt: unknown;
    };
    expect(submission.acceptance_number).toBe("20260210123456789012");
    expect(submission.submitted_date).toBe("2026-02-10");
    expect(submission.receipt).toBeNull();

    const list = await req("/api/filing-submissions/2025");
    expect((list.body.submissions as unknown[]).length).toBe(1);

    // 受付番号を記録したので申告ステータスは提出済みになっている。
    const statuses = await req("/api/filing-status");
    const status2025 = (statuses.body.statuses as { year: number; submitted: boolean }[]).find(
      (s) => s.year === 2025,
    );
    expect(status2025?.submitted).toBe(true);

    // 更新（受付番号の訂正）も往復する。
    const updated = await req("/api/filing-submissions/2025/income", {
      method: "PUT",
      json: { acceptance_number: "20260210999999999999", submitted_date: "2026-02-10" },
    });
    expect(updated.status).toBe(200);
    expect(
      (updated.body.submission as { acceptance_number: string }).acceptance_number,
    ).toBe("20260210999999999999");
  });

  test("変更履歴に登録・更新・削除がスナップショット付きで残る", async () => {
    const db = await createTestDb();
    await req("/api/filing-submissions/2024/consumption", {
      method: "PUT",
      json: { acceptance_number: "111", submitted_date: "2025-03-31" },
    });
    await req("/api/filing-submissions/2024/consumption", {
      method: "PUT",
      json: { acceptance_number: "222", submitted_date: "2025-03-31" },
    });
    const deleted = await req("/api/filing-submissions/2024/consumption", { method: "DELETE" });
    expect(deleted.status).toBe(200);

    const history = await db
      .select()
      .from(filingSubmissionHistoryTable)
      .where(eq(filingSubmissionHistoryTable.year, 2024));
    expect(history.map((h) => h.action)).toEqual(["created", "updated", "deleted"]);
    expect((history[0]!.after as { acceptance_number: string }).acceptance_number).toBe("111");
    expect((history[1]!.before as { acceptance_number: string }).acceptance_number).toBe("111");
    expect((history[1]!.after as { acceptance_number: string }).acceptance_number).toBe("222");
    expect(history[2]!.after).toBeNull();

    const list = await req("/api/filing-submissions/2024");
    expect((list.body.submissions as unknown[]).length).toBe(0);
    const again = await req("/api/filing-submissions/2024/consumption", { method: "DELETE" });
    expect(again.status).toBe(404);
  });

  test("不正な税目・提出日は 400", async () => {
    await createTestDb();
    const badKind = await req("/api/filing-submissions/2025/corporate", {
      method: "PUT",
      json: { acceptance_number: "1", submitted_date: null },
    });
    expect(badKind.status).toBe(400);
    const badDate = await req("/api/filing-submissions/2025/income", {
      method: "PUT",
      json: { acceptance_number: "1", submitted_date: "2026/02/10" },
    });
    expect(badDate.status).toBe(400);
  });
});

describe("HTTP: 受信通知PDFの保管", () => {
  test("presign → アップロード → 添付 → 配信 → 差し替え → 削除", async () => {
    await createTestDb();
    const fileId = await uploadReceiptPdf(PDF_BYTES, "application/pdf");
    const attached = await req("/api/filing-submissions/2025/income/receipt", {
      method: "POST",
      json: { file_id: fileId },
    });
    expect(attached.status).toBe(201);
    const submission = attached.body.submission as {
      receipt: { file_id: string; mime_type: string } | null;
    };
    expect(submission.receipt?.file_id).toBe(fileId);
    expect(submission.receipt?.mime_type).toBe("application/pdf");

    const contentRes = await appFetch(
      new Request("http://localhost/api/filing-submissions/2025/income/receipt/content"),
    );
    expect(contentRes.status).toBe(200);
    expect(contentRes.headers.get("content-type")).toContain("application/pdf");
    expect((await contentRes.arrayBuffer()).byteLength).toBe(PDF_BYTES.length);

    // 差し替え: 新しいPDFを添付すると receipt が付け替わる。
    const fileId2 = await uploadReceiptPdf(PDF_BYTES, "application/pdf");
    const replaced = await req("/api/filing-submissions/2025/income/receipt", {
      method: "POST",
      json: { file_id: fileId2 },
    });
    expect(replaced.status).toBe(201);
    expect(
      (replaced.body.submission as { receipt: { file_id: string } | null }).receipt?.file_id,
    ).toBe(fileId2);

    // 同じファイルの二重添付は 409。
    const duplicate = await req("/api/filing-submissions/2025/consumption/receipt", {
      method: "POST",
      json: { file_id: fileId2 },
    });
    expect(duplicate.status).toBe(409);

    // 記録ごと削除すると配信も 404 になる。
    const deleted = await req("/api/filing-submissions/2025/income", { method: "DELETE" });
    expect(deleted.status).toBe(200);
    const goneRes = await appFetch(
      new Request("http://localhost/api/filing-submissions/2025/income/receipt/content"),
    );
    expect(goneRes.status).toBe(404);
  });

  test("PDF以外の添付は 400、未アップロードの添付も 400", async () => {
    await createTestDb();
    // 画像を受信通知キー配下へ上げて添付しようとしても弾かれる。
    const presign = await req("/api/files/presign-upload", {
      method: "POST",
      json: { contentType: "application/pdf", purpose: "filing_receipt" },
    });
    const fileId = presign.body.fileId as string;
    const uploadUrl = presign.body.uploadUrl as string;
    const put = await req(uploadUrl, {
      method: "PUT",
      body: PNG_BYTES,
      contentType: "image/png",
    });
    expect(put.status).toBe(200);
    const attached = await req("/api/filing-submissions/2025/income/receipt", {
      method: "POST",
      json: { file_id: fileId },
    });
    expect(attached.status).toBe(400);

    const missing = await req("/api/filing-submissions/2025/income/receipt", {
      method: "POST",
      json: { file_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(missing.status).toBe(400);
  });

  test("presign の用途と形式の組み合わせを検証する", async () => {
    const pdfAsReceipt = await req("/api/files/presign-upload", {
      method: "POST",
      json: { contentType: "application/pdf", purpose: "receipt" },
    });
    expect(pdfAsReceipt.status).toBe(400);
    const imageAsFilingReceipt = await req("/api/files/presign-upload", {
      method: "POST",
      json: { contentType: "image/png", purpose: "filing_receipt" },
    });
    expect(imageAsFilingReceipt.status).toBe(400);
    // 受信通知キー以外への PDF 直アップロードも弾かれる。
    const presign = await req("/api/files/presign-upload", {
      method: "POST",
      json: { contentType: "image/png", purpose: "fixed_asset" },
    });
    const uploadUrl = presign.body.uploadUrl as string;
    const putPdf = await req(uploadUrl, {
      method: "PUT",
      body: PDF_BYTES,
      contentType: "application/pdf",
    });
    expect(putPdf.status).toBe(400);
  });
});
