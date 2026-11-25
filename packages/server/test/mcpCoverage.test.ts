/**
 * mcpCoverage.test.ts — MCP 対応の棚卸し（2026-11-25）で追加したツールの
 * HTTP 結合テスト。
 *
 * mcpReconciliation.test.ts と同じ方式（テスト DB を指してアプリを import
 * し、JSON-RPC を直接投げる）で、次を担保する:
 *   - tools/list に追加ツールが含まれる
 *   - 請求書のライフサイクル（作成→更新→発行→PDF→修正用下書き）と
 *     状態制約（発行済みの更新・削除、下書きからの修正作成はエラー）
 *   - テナント分離（他ユーザーのキーでは請求書・提出記録が見えない）
 *   - 提出記録の保存で申告ステータスが「提出済み」に連動すること
 *   - 開業の専用入力の保存→取得の往復と、様式 PDF の生成
 *   - 試算表・取引履歴一覧・課金プランの取得
 * 全面カバレッジ（2026-11-25 追補）では次も担保する:
 *   - 接続テスト2件（SystemOne / 外部接続）と agent_chat が tools/list に
 *     含まれ、REST と同じ本体で応答すること（未設定環境では ok=false /
 *     AGENT_API_KEY 未設定エラー）
 *   - /api/auth/mcp-info のツール件数が tools/list と一致すること
 *   - GET /openapi.json が全ルート（99 オペレーション）のスペックを返すこと
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { createTestDb } from "./testDb";
import { createApiKey, createUser } from "../src/repositories/userRepository";

const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.ETAX_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

const CHECKBOX_NAMES = [
  "Check Box63", "Check Box64", "Check Box65", "Check Box66", "Check Box67",
  "Check Box68", "Check Box69", "Check Box70", "Check Box71", "Check Box72",
  "Check Box73", "Check Box74", "Check Box75", "Check Box76", "Check Box77",
] as const;

beforeAll(async () => {
  // 様式 PDF の合成テンプレートとフォント（businessStart.test.ts と同じ流儀）
  const dir = await mkdtemp(join(tmpdir(), "etax-mcp-coverage-"));
  const opening = await PDFDocument.create();
  const page = opening.addPage([2481, 3508]);
  const form = opening.getForm();
  CHECKBOX_NAMES.forEach((name, i) => {
    const box = form.createCheckBox(name);
    box.addToPage(page, {
      x: 100 + (i % 5) * 100,
      y: 100 + Math.floor(i / 5) * 100,
      width: 34,
      height: 39,
      borderWidth: 1,
      borderColor: rgb(0, 0, 0),
    });
  });
  const openingPath = join(dir, "kaigyo.pdf");
  await writeFile(openingPath, await opening.save());
  const blue = await PDFDocument.create();
  blue.addPage([2481, 3508]);
  const bluePath = join(dir, "aoiro.pdf");
  await writeFile(bluePath, await blue.save());
  process.env.ETAX_OPENING_FORM_PDF_PATH = openingPath;
  process.env.ETAX_BLUE_FORM_PDF_PATH = bluePath;
  process.env.ETAX_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const dataDir = await mkdtemp(join(tmpdir(), "etax-mcp-coverage-data-"));
  process.env.ETAX_DATA_DIR = dataDir;

  process.env.ETAX_AUTH_MODE = "required";
  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
  await createTestDb();
});

afterAll(() => {
  delete process.env.ETAX_AUTH_MODE;
});

interface McpResponse {
  status: number;
  body: {
    result?: {
      tools?: { name: string }[];
      content?: { type: string; text: string }[];
      isError?: boolean;
    };
  };
}

async function mcp(
  method: string,
  params: Record<string, unknown>,
  key?: string,
): Promise<McpResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  const res = await appFetch(
    new Request("http://localhost/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as McpResponse["body"];
  return { status: res.status, body };
}

function toolJson(res: McpResponse): Record<string, unknown> {
  const text = res.body.result?.content?.[0]?.text ?? "";
  return JSON.parse(text) as Record<string, unknown>;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  key: string,
): Promise<McpResponse> {
  return mcp("tools/call", { name, arguments: args }, key);
}

/**
 * テストユーザーと API キーを作る。createTestDb は呼ぶたびに全テーブルを
 * 空にするため、複数ユーザーが要る場合は1回の取得でまとめて作ること。
 */
async function makeUsers(...emails: string[]): Promise<string[]> {
  const db = await createTestDb();
  const keys: string[] = [];
  for (const email of emails) {
    const user = await createUser(db, email, "password-123");
    keys.push((await createApiKey(db, user.id, "test")).key);
  }
  return keys;
}

const NEW_TOOLS = [
  "create_invoice",
  "update_invoice",
  "delete_invoice",
  "issue_invoice",
  "create_invoice_correction",
  "get_invoice_pdf",
  "list_filing_submissions",
  "save_filing_submission",
  "delete_filing_submission",
  "get_filing_submission_history",
  "attach_filing_receipt",
  "get_filing_receipt_content",
  "export_return_pdf",
  "get_business_start_inputs",
  "save_business_start_inputs",
  "export_opening_notice_pdf",
  "export_blue_return_pdf",
  "export_domicile_change_pdf",
  "list_transaction_history",
  "export_ledger_pdf",
  "get_trial_balance",
  "get_billing_plan",
  "upload_receipt",
  "analyze_receipt",
  "get_fixed_asset_image_content",
];

const INVOICE_BODY = {
  issue_date: "2026-04-01",
  due_date: "2026-04-30",
  counterparty_name: "テスト商事株式会社",
  is_qualified: true,
  lines: [
    {
      item_name: "開発作業",
      quantity: 1,
      unit_price: 100000,
      tax_rate_percent: 10,
      is_reduced_rate: false,
    },
  ],
};

describe("MCP 棚卸しで追加したツール", () => {
  test("tools/list に追加ツールがすべて含まれる", async () => {
    const [key] = await makeUsers("mcp-coverage-list@example.com");
    const list = await mcp("tools/list", {}, key);
    const names = (list.body.result?.tools ?? []).map((t) => t.name);
    for (const name of NEW_TOOLS) {
      expect(names).toContain(name);
    }
  });

  test("請求書のライフサイクルと状態制約（発行済みは不変）", async () => {
    const [keyA, keyB] = await makeUsers(
      "mcp-coverage-inv-a@example.com",
      "mcp-coverage-inv-b@example.com",
    );

    // 発行者プロフィール（適格請求書の検証に必要）
    const profile = await callTool(
      "save_taxpayer_profile",
      {
        year: 2026,
        taxpayer: { name: "テスト太郎", invoice_number: "T1234567890123" },
      },
      keyA,
    );
    expect(profile.body.result?.isError).toBeUndefined();

    // 作成
    const created = await callTool("create_invoice", INVOICE_BODY, keyA);
    expect(created.body.result?.isError).toBeUndefined();
    const invoice = toolJson(created)["invoice"] as {
      id: number;
      status: string;
      totals: { total: number };
    };
    expect(invoice.status).toBe("draft");
    expect(invoice.totals.total).toBe(110000);

    // 下書きからの修正用下書き作成はエラー（状態制約）
    const earlyCorrection = await callTool(
      "create_invoice_correction",
      { invoice_id: invoice.id },
      keyA,
    );
    expect(earlyCorrection.body.result?.isError).toBe(true);

    // 更新（下書きは可能）
    const updated = await callTool(
      "update_invoice",
      { invoice_id: invoice.id, ...INVOICE_BODY, memo: "更新メモ" },
      keyA,
    );
    expect(updated.body.result?.isError).toBeUndefined();

    // テナント分離: B からは見えない
    const seenByB = await callTool("get_invoice", { invoice_id: invoice.id }, keyB);
    expect(seenByB.body.result?.isError).toBe(true);
    const listB = toolJson(await callTool("list_invoices", {}, keyB));
    expect(listB["invoices"]).toEqual([]);

    // 発行
    const issued = await callTool("issue_invoice", { invoice_id: invoice.id }, keyA);
    expect(issued.body.result?.isError).toBeUndefined();
    const issuedInvoice = toolJson(issued)["invoice"] as {
      status: string;
      document_number: string;
    };
    expect(issuedInvoice.status).toBe("issued");
    expect(issuedInvoice.document_number).toBe("2026-0001");

    // 発行済みの更新・削除・再発行はすべてエラー（不変の担保）
    const updateIssued = await callTool(
      "update_invoice",
      { invoice_id: invoice.id, ...INVOICE_BODY },
      keyA,
    );
    expect(updateIssued.body.result?.isError).toBe(true);
    const deleteIssued = await callTool(
      "delete_invoice",
      { invoice_id: invoice.id },
      keyA,
    );
    expect(deleteIssued.body.result?.isError).toBe(true);
    const reissue = await callTool("issue_invoice", { invoice_id: invoice.id }, keyA);
    expect(reissue.body.result?.isError).toBe(true);

    // PDF 取得（発行済みのみ）
    const pdf = await callTool("get_invoice_pdf", { invoice_id: invoice.id }, keyA);
    expect(pdf.body.result?.isError).toBeUndefined();
    const pdfJson = toolJson(pdf);
    expect(pdfJson["filename"]).toBe("invoice-2026-0001.pdf");
    const pdfBytes = Buffer.from(pdfJson["pdf_base64"] as string, "base64");
    expect(pdfBytes.subarray(0, 4).toString("latin1")).toBe("%PDF");

    // 修正用下書き（発行済みからは作れる）
    const correction = await callTool(
      "create_invoice_correction",
      { invoice_id: invoice.id },
      keyA,
    );
    expect(correction.body.result?.isError).toBeUndefined();
    const correctionInvoice = toolJson(correction)["invoice"] as {
      id: number;
      status: string;
      corrects_document_number: string;
    };
    expect(correctionInvoice.status).toBe("draft");
    expect(correctionInvoice.corrects_document_number).toBe("2026-0001");

    // 下書きの削除は可能で、消した後は取得できない
    const deleted = await callTool(
      "delete_invoice",
      { invoice_id: correctionInvoice.id },
      keyA,
    );
    expect(deleted.body.result?.isError).toBeUndefined();
    const gone = await callTool("get_invoice", { invoice_id: correctionInvoice.id }, keyA);
    expect(gone.body.result?.isError).toBe(true);
  });

  test("提出記録の保存→ステータス連動→履歴→受信通知→削除とテナント分離", async () => {
    const [keyA, keyB] = await makeUsers(
      "mcp-coverage-sub-a@example.com",
      "mcp-coverage-sub-b@example.com",
    );

    const saved = await callTool(
      "save_filing_submission",
      {
        year: 2025,
        kind: "income",
        acceptance_number: "20260101000000000001",
        submitted_date: "2026-02-16",
      },
      keyA,
    );
    expect(saved.body.result?.isError).toBeUndefined();

    // 受付番号の記録で申告ステータスが「提出済み」に連動する
    const status = toolJson(await callTool("get_filing_status", {}, keyA));
    const statuses = status["statuses"] as { year: number; submitted: boolean }[];
    expect(statuses.find((s) => s.year === 2025)?.submitted).toBe(true);

    const listed = toolJson(
      await callTool("list_filing_submissions", { year: 2025 }, keyA),
    );
    const submissions = listed["submissions"] as { kind: string }[];
    expect(submissions.map((s) => s.kind)).toContain("income");

    // テナント分離: B の一覧には出ない
    const listedB = toolJson(
      await callTool("list_filing_submissions", { year: 2025 }, keyB),
    );
    expect(listedB["submissions"]).toEqual([]);

    // 変更履歴に作成が残る
    const history = toolJson(
      await callTool("get_filing_submission_history", { year: 2025 }, keyA),
    );
    const entries = history["history"] as { action: string }[];
    expect(entries.some((e) => e.action === "created")).toBe(true);

    // 受信通知 PDF の添付→取得の往復
    const pdfBase64 = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
    ).toString("base64");
    const attached = await callTool(
      "attach_filing_receipt",
      { year: 2025, kind: "income", content_base64: pdfBase64 },
      keyA,
    );
    expect(attached.body.result?.isError).toBeUndefined();
    const content = toolJson(
      await callTool("get_filing_receipt_content", { year: 2025, kind: "income" }, keyA),
    );
    expect(content["content_base64"]).toBe(pdfBase64);
    // B からは取得できない
    const contentB = await callTool(
      "get_filing_receipt_content",
      { year: 2025, kind: "income" },
      keyB,
    );
    expect(contentB.body.result?.isError).toBe(true);
    // PDF 以外は添付できない
    const notPdf = await callTool(
      "attach_filing_receipt",
      {
        year: 2025,
        kind: "consumption",
        content_base64: Buffer.from("not a pdf").toString("base64"),
      },
      keyA,
    );
    expect(notPdf.body.result?.isError).toBe(true);

    // 削除後は一覧に出ない
    const deleted = await callTool(
      "delete_filing_submission",
      { year: 2025, kind: "income" },
      keyA,
    );
    expect(deleted.body.result?.isError).toBeUndefined();
    const afterDelete = toolJson(
      await callTool("list_filing_submissions", { year: 2025 }, keyA),
    );
    expect(afterDelete["submissions"]).toEqual([]);
  });

  test("開業の専用入力の往復と様式 PDF、試算表・履歴・課金プラン", async () => {
    const [key] = await makeUsers("mcp-coverage-misc@example.com");

    const empty = toolJson(await callTool("get_business_start_inputs", {}, key));
    expect(empty["state"]).toBeNull();

    // 専用入力は全項目が必須のスキーマのため、画面と同じ完全な形で渡す
    const state = {
      start_date: "2026-04-01",
      shop_name_kana: "テストジムショ",
      business_overview: "ソフトウェア開発",
      income_types: ["business"],
      submits_blue_application: true,
      submits_consumption_election: false,
      other_zip_code: "",
      other_address: "",
      other_phone: "",
      blue_start_year: 2026,
      offices: [],
      blue_cancellation_has: false,
      blue_cancellation_date: "",
      inheritance_has: false,
      inheritance_date: "",
      predecessor_name: "",
      bookkeeping: "double",
      bookkeeping_other: "",
      books: ["cash_book", "general_ledger"],
      blue_other_notes: "",
      salary_family: { count: null, terms: "", has_tax: null },
      salary_employee: { count: null, terms: "", has_tax: null },
      salary_other_label: "",
      salary_other: { count: null, terms: "", has_tax: null },
      withholding_special: null,
      salary_start_date: "",
      other_notes: "",
    };
    const savedInputs = await callTool("save_business_start_inputs", { state }, key);
    expect(savedInputs.body.result?.isError).toBeUndefined();
    const roundtrip = toolJson(await callTool("get_business_start_inputs", {}, key));
    const got = roundtrip["state"] as { start_date: string };
    expect(got.start_date).toBe("2026-04-01");

    // 様式 PDF（保存済みの入力＋明示のプロフィールで生成できる。
    // プロフィールは全項目必須のスキーマのため、画面と同じ完全な形で渡す）
    const taxpayer = {
      name: "テスト太郎",
      name_kana: "テストタロウ",
      zip_code: "100-0001",
      address: "東京都千代田区千代田1-1",
      address_line2: "",
      birth_date: "1990-01-01",
      phone: "090-0000-0000",
      tax_office_name: "麹町",
      tax_office_code: "",
      my_number: "",
      user_id: "",
      occupation: "ソフトウェア開発",
      shop_name: "",
      jan1_address: "",
      invoice_number: "",
      previous_zip_code: "",
      previous_address: "",
    };
    const openingPdf = await callTool(
      "export_opening_notice_pdf",
      { taxpayer, submission_date: "2026-04-01" },
      key,
    );
    expect(openingPdf.body.result?.isError).toBeUndefined();
    const openingJson = toolJson(openingPdf);
    expect(openingJson["filename"]).toBe("kaigyo-todokede.pdf");
    expect(
      Buffer.from(openingJson["pdf_base64"] as string, "base64")
        .subarray(0, 4)
        .toString("latin1"),
    ).toBe("%PDF");

    const bluePdf = await callTool(
      "export_blue_return_pdf",
      { taxpayer, submission_date: "2026-04-01" },
      key,
    );
    expect(bluePdf.body.result?.isError).toBeUndefined();
    expect(toolJson(bluePdf)["filename"]).toBe("aoiro-shinkoku-shinsei.pdf");

    // 試算表（空の帳簿でも形が返る。前年分 previous を含む）
    const trial = toolJson(await callTool("get_trial_balance", { year: 2026 }, key));
    expect(trial["year"]).toBe(2026);
    expect(trial["previous"]).toBeDefined();

    // 取引履歴一覧（空でも count つきで返る）
    const historyList = toolJson(await callTool("list_transaction_history", {}, key));
    expect(historyList["count"]).toBe(0);

    // 課金プラン（読み取り）
    const plan = toolJson(await callTool("get_billing_plan", {}, key));
    expect(plan["status"]).toBe("none");
    expect(typeof plan["billing_enabled"]).toBe("boolean");
  });
});

describe("MCP 全面カバレッジ（接続テスト・エージェント・OpenAPI）", () => {
  test("tools/list に接続テストと agent_chat が含まれ、mcp-info の件数と一致する", async () => {
    const [key] = await makeUsers("mcp-full-coverage@example.com");
    const list = await mcp("tools/list", {}, key);
    const names = (list.body.result?.tools ?? []).map((t) => t.name);
    for (const name of ["test_systemone_connection", "test_agent_connection", "agent_chat"]) {
      expect(names).toContain(name);
    }

    // MCP 設定画面向け情報（ツール件数・一覧）が tools/list と一致する
    const infoRes = await appFetch(
      new Request("http://localhost/api/auth/mcp-info", {
        headers: { Authorization: `Bearer ${key}` },
      }),
    );
    expect(infoRes.status).toBe(200);
    const info = (await infoRes.json()) as {
      endpoint_path: string;
      tool_count: number;
      tools: { name: string }[];
    };
    expect(info.endpoint_path).toBe("/mcp");
    expect(info.tool_count).toBe(names.length);
    expect(info.tools.map((t) => t.name)).toEqual(names);
  });

  test("接続テスト2件は未設定環境でも ok=false の形で返る（REST と同じ本体）", async () => {
    const [key] = await makeUsers("mcp-conn-test@example.com");

    // SystemOne は既定のローカル宛先へ届かず ok=false（例外にはならない）
    const systemOne = await callTool("test_systemone_connection", {}, key);
    expect(systemOne.body.result?.isError).toBeUndefined();
    const systemOneJson = toolJson(systemOne);
    expect(systemOneJson["ok"]).toBe(false);
    expect(systemOneJson["top"]).toBeNull();
    expect(typeof systemOneJson["error"]).toBe("string");

    // 外部接続（AI）は APIキー未設定のため ok=false
    const agent = await callTool("test_agent_connection", {}, key);
    expect(agent.body.result?.isError).toBeUndefined();
    const agentJson = toolJson(agent);
    expect(agentJson["ok"]).toBe(false);
    expect(String(agentJson["error"])).toContain("APIキー");
  });

  test("agent_chat は AGENT_API_KEY 未設定なら REST と同じ理由でエラーになる", async () => {
    const [key] = await makeUsers("mcp-agent-chat@example.com");
    const res = await callTool(
      "agent_chat",
      { messages: [{ role: "user", content: "こんにちは" }] },
      key,
    );
    expect(res.body.result?.isError).toBe(true);
    expect(res.body.result?.content?.[0]?.text ?? "").toContain("AGENT_API_KEY");
  });

  test("GET /openapi.json が全ルートのスペックを返す（99 オペレーション）", async () => {
    const res = await appFetch(new Request("http://localhost/openapi.json"));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };
    expect(doc.openapi).toBe("3.0.0");
    // 2026-11-25 の棚卸し時点の全オペレーション数（ルートを足したら更新する）
    let operations = 0;
    for (const methods of Object.values(doc.paths)) {
      operations += Object.keys(methods).length;
    }
    expect(operations).toBe(99);
    // 代表パス（今回ツール化した3件と、手書きオブジェクト定義の試算表を含む）
    for (const path of [
      "/api/settings/systemone/test",
      "/api/settings/agent/test",
      "/api/agent/chat",
      "/api/calc/trial-balance",
      "/api/transactions",
      "/api/auth/register",
      "/api/billing/webhook",
      "/api/auth/mcp-info",
    ]) {
      expect(doc.paths[path]).toBeDefined();
    }
  });
});
