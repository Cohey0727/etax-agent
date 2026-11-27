/**
 * businessStart.test.ts — 開業届・青色申告承認申請書の検証。
 *
 * - 専用入力リポジトリの往復と所有者分離
 * - 様式 PDF の復号（decryptPdfTemplate）の素通し・異常系
 * - 値組み立て（元号変換・分割・青色申告 4 欄の記入条件）
 * - 備付帳簿名カタログ（shared）と builder の○位置のキー一致
 * - HTTP: 専用入力の保存→取得と、両様式の PDF 出力（合成テンプレート）
 */
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import { BLUE_BOOK_OPTIONS } from "@etax/shared";
import { createTestDb } from "./testDb";
import { runWithTenant } from "../src/lib/tenantContext";
import {
  getBusinessStartInputRow,
  upsertBusinessStartInputRow,
} from "../src/repositories/businessStartRepository";
import { BusinessStartInputs } from "../src/schemas/businessStart";
import { TaxpayerProfile } from "../src/schemas/taxpayer";
import {
  buildBlueReturnFormValues,
  buildOpeningNoticeFormValues,
} from "../src/services/pdf/businessStartFormValues";
import { BOOK_CIRCLES } from "../src/services/pdf/buildBlueReturnPdf";
import { decryptPdfTemplate } from "../src/services/pdf/decryptPdfTemplate";

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://etax:etax@127.0.0.1:5432/etaxagent_test";
delete process.env.ETAX_AUTH_MODE;

const TAXPAYER: TaxpayerProfile = {
  name: "山田太郎",
  name_kana: "ヤマダタロウ",
  zip_code: "1000001",
  address: "東京都千代田区千代田1-1",
  address_line2: "千代田マンション101",
  birth_date: "1990-04-02",
  phone: "090-1234-5678",
  tax_office_name: "麹町",
  tax_office_code: "",
  my_number: "123456789012",
  user_id: "",
  occupation: "ソフトウェア開発",
  shop_name: "ヤマダシステム",
  jan1_address: "",
  invoice_number: "",
  previous_zip_code: "",
  previous_address: "",
};

const INPUTS: BusinessStartInputs = {
  start_date: "2026-02-10",
  shop_name_kana: "ヤマダシステム",
  business_overview: "Webアプリケーションの受託開発",
  income_types: ["business"],
  submits_blue_application: true,
  submits_consumption_election: false,
  other_zip_code: "",
  other_address: "",
  other_phone: "",
  blue_start_year: 0,
  offices: [{ name: "ヤマダシステム", location: "東京都千代田区千代田1-1" }],
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

describe("開業の専用入力リポジトリ", () => {
  test("保存→取得で JSON が往復し、上書きできる", async () => {
    const db = await createTestDb();
    expect(await getBusinessStartInputRow(db)).toBeUndefined();
    await upsertBusinessStartInputRow(db, INPUTS);
    const row = await getBusinessStartInputRow(db);
    expect(JSON.parse(row!.state)).toEqual(INPUTS);
    const changed = { ...INPUTS, business_overview: "技術コンサルティング" };
    await upsertBusinessStartInputRow(db, changed);
    const updated = await getBusinessStartInputRow(db);
    expect(JSON.parse(updated!.state)).toEqual(changed);
  });

  test("所有者が違えば分離される", async () => {
    const db = await createTestDb();
    await runWithTenant(7, async () => {
      await upsertBusinessStartInputRow(db, INPUTS);
    });
    expect(await getBusinessStartInputRow(db)).toBeUndefined();
    const row = await runWithTenant(7, () => getBusinessStartInputRow(db));
    expect(JSON.parse(row!.state)).toEqual(INPUTS);
  });
});

describe("decryptPdfTemplate", () => {
  test("暗号化されていない PDF はそのまま返す", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595, 842]);
    const bytes = await doc.save();
    expect(decryptPdfTemplate(bytes)).toBe(bytes);
  });

  test("PDF でない入力は例外にする", () => {
    expect(() => decryptPdfTemplate(new TextEncoder().encode("not a pdf"))).toThrow();
  });
});

describe("値組み立て", () => {
  test("開業届: 元号・郵便番号・電話番号の分割と開業日", () => {
    const values = buildOpeningNoticeFormValues(TAXPAYER, INPUTS, "2026-11-25");
    expect(values.submission).toEqual({ eraName: "令和", eraYear: 8, month: 11, day: 25 });
    expect(values.birth).toEqual({ eraName: "平成", eraYear: 2, month: 4, day: 2 });
    expect(values.startDate).toEqual({ eraName: "令和", eraYear: 8, month: 2, day: 10 });
    expect(values.zipFirst).toBe("100");
    expect(values.zipSecond).toBe("0001");
    expect(values.phoneParts).toEqual(["090", "1234", "5678"]);
    expect(values.shopNameKana).toBe("ヤマダシステム");
    expect(values.domicileKindNumber).toBe("5");
    expect(values.salaryTotalCount).toBeNull();
  });

  test("青色: 4 欄は開始年の1月16日以後の開始だけ記入する", () => {
    const values = buildBlueReturnFormValues(TAXPAYER, INPUTS, "2026-11-25");
    expect(values.businessStartDate).toEqual({
      eraName: "令和",
      eraYear: 8,
      month: 2,
      day: 10,
    });
    expect(values.startYearEra).toEqual({ eraName: "令和", eraYear: 8 });
    // 1月15日の開始は 4 欄に書かない
    const early = buildBlueReturnFormValues(
      TAXPAYER,
      { ...INPUTS, start_date: "2026-01-15" },
      "2026-11-25",
    );
    expect(early.businessStartDate).toBeNull();
    // 開始年が申請年と違えば書かない
    const lastYear = buildBlueReturnFormValues(
      TAXPAYER,
      { ...INPUTS, start_date: "2025-06-01", blue_start_year: 2026 },
      "2026-11-25",
    );
    expect(lastYear.businessStartDate).toBeNull();
    expect(lastYear.startYearEra).toEqual({ eraName: "令和", eraYear: 8 });
  });

  test("備付帳簿名カタログと builder の○位置のキーが一致する", () => {
    const catalogKeys = BLUE_BOOK_OPTIONS.map((option) => option.key).sort();
    const circleKeys = BOOK_CIRCLES.map((circle) => circle.key).sort();
    expect(circleKeys).toEqual(catalogKeys);
  });
});

// ---------------------------------------------------------------------------
// HTTP 結合（合成テンプレートとシステムフォントを使う）
// ---------------------------------------------------------------------------

type AppFetch = (req: Request) => Promise<Response>;
let appFetch: AppFetch;

const CHECKBOX_NAMES = [
  "Check Box63", "Check Box64", "Check Box65", "Check Box66", "Check Box67",
  "Check Box68", "Check Box69", "Check Box70", "Check Box71", "Check Box72",
  "Check Box73", "Check Box74", "Check Box75", "Check Box76", "Check Box77",
] as const;

beforeAll(async () => {
  const dir = await mkdtemp(join(tmpdir(), "etax-business-start-"));
  // 開業届の合成テンプレート（実様式と同じチェックボックス名を持つ）
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
  // 青色申告の合成テンプレート（フィールドなしの1ページ）
  const blue = await PDFDocument.create();
  blue.addPage([2481, 3508]);
  const bluePath = join(dir, "aoiro.pdf");
  await writeFile(bluePath, await blue.save());

  process.env.ETAX_OPENING_FORM_PDF_PATH = openingPath;
  process.env.ETAX_BLUE_FORM_PDF_PATH = bluePath;
  process.env.ETAX_FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";

  const mod = await import("../src/index");
  appFetch = mod.default.fetch as AppFetch;
});

async function request(
  method: string,
  path: string,
  json?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await appFetch(
    new Request(`http://localhost${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    }),
  );
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, body };
}

describe("HTTP: 専用入力と PDF 出力", () => {
  test("未保存は null、保存→取得で往復する", async () => {
    const db = await createTestDb();
    void db;
    const before = await request("GET", "/api/business-start-inputs");
    expect(before.status).toBe(200);
    expect(before.body.state).toBeNull();
    const saved = await request("PUT", "/api/business-start-inputs", { state: INPUTS });
    expect(saved.status).toBe(200);
    const after = await request("GET", "/api/business-start-inputs");
    expect(after.body.state).toEqual(INPUTS);
    expect(typeof after.body.updated_at).toBe("string");
  });

  test("不正な入力は 400 で弾く", async () => {
    const res = await request("PUT", "/api/business-start-inputs", {
      state: { ...INPUTS, income_types: ["unknown"] },
    });
    expect(res.status).toBe(400);
  });

  test("開業届 PDF: 生成でき、チェック状態が入る", async () => {
    const res = await request("POST", "/api/etax/export-opening-notice-pdf", {
      submission_date: "2026-11-25",
      taxpayer: TAXPAYER,
      inputs: INPUTS,
    });
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe("kaigyo-todokede.pdf");
    const bytes = Buffer.from(res.body.pdf_base64 as string, "base64");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const form = doc.getForm();
    expect(form.getCheckBox("Check Box77").isChecked()).toBe(true); // 事業所得
    expect(form.getCheckBox("Check Box71").isChecked()).toBe(true); // 青色 有
    expect(form.getCheckBox("Check Box74").isChecked()).toBe(true); // 消費税 無
    expect(form.getCheckBox("Check Box75").isChecked()).toBe(false); // 不動産所得
  });

  test("青色申告承認申請書 PDF: 生成できる", async () => {
    const res = await request("POST", "/api/etax/export-blue-return-pdf", {
      submission_date: "2026-11-25",
      taxpayer: TAXPAYER,
      inputs: INPUTS,
    });
    expect(res.status).toBe(200);
    expect(res.body.filename).toBe("aoiro-shinkoku-shinsei.pdf");
    const bytes = Buffer.from(res.body.pdf_base64 as string, "base64");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
