/**
 * mcpProfileTools.ts — MCP の申告プロフィール/申告入力/確定スナップショット
 * 系ツール（services/mcp）。
 *
 * REST の /api/taxpayer/{year}・/api/filing-inputs/{year}・
 * /api/filing-snapshots/{year} と同じリポジトリ・検証を使う。
 * プロフィールの保存は対象年への全体書き換え（REST と同じ意味論）。
 */
import {
  getFilingInputRow,
  upsertFilingInputRow,
} from "../../repositories/filingInputRepository";
import {
  filingSnapshotToApi,
  insertFilingSnapshotRow,
  listFilingSnapshotRows,
} from "../../repositories/filingSnapshotRepository";
import {
  emptyTaxpayerProfile,
  findTaxpayerCarryRow,
  getTaxpayerProfileRow,
  taxpayerProfileToApi,
  upsertTaxpayerProfileRow,
} from "../../repositories/taxpayerRepository";
import { FilingSnapshotFiguresSchema } from "../../schemas/filingSnapshot";
import {
  SaveTaxpayerProfileRequestSchema,
  TaxpayerProfile,
} from "../../schemas/taxpayer";
import {
  McpToolModule,
  requireDb,
  textResult,
  yearArg,
  yearProperty,
} from "./mcpToolKit";

export const mcpProfileTools: McpToolModule = {
  tools: [
    {
      name: "get_taxpayer_profile",
      description:
        "指定年の納税者プロフィール（氏名・住所・税務署・マイナンバー等）を返す。対象年の保存が無ければ直近の過去年からの引き継ぎを carried_from つきで返し、どちらも無ければ空のプロフィールを返す。",
      inputSchema: {
        type: "object",
        properties: { year: yearProperty },
        required: ["year"],
      },
    },
    {
      name: "save_taxpayer_profile",
      description:
        "指定年の納税者プロフィールを保存する（全体書き換え。渡さなかった項目は空になる）。taxpayer は snake_case: name, name_kana, zip_code, address, address_line2, birth_date, phone, tax_office_name, tax_office_code, my_number, user_id, occupation, shop_name, jan1_address, invoice_number, previous_zip_code, previous_address。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          taxpayer: { type: "object", description: "納税者プロフィール（snake_case）" },
        },
        required: ["year", "taxpayer"],
      },
    },
    {
      name: "get_filing_inputs",
      description:
        "指定年の申告入力（所得・控除などの入力状態 state）返す。未保存なら state は null。",
      inputSchema: {
        type: "object",
        properties: { year: yearProperty },
        required: ["year"],
      },
    },
    {
      name: "save_filing_inputs",
      description:
        "指定年の申告入力 state（所得・控除などの入力状態オブジェクト）を保存する。画面の申告入力と同じ保存先で、画面と相互に上書きされる。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          state: { type: "object", description: "申告入力の状態オブジェクト" },
        },
        required: ["year", "state"],
      },
    },
    {
      name: "create_filing_snapshot",
      description:
        "指定年の確定スナップショット（確定時点の計算結果 figures）を履歴として1件追加する。差し戻しでは消えず、比較の材料として残る。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          figures: { type: "object", description: "確定した計算結果（FilingSnapshotFigures）" },
        },
        required: ["year", "figures"],
      },
    },
    {
      name: "list_filing_snapshots",
      description: "指定年の確定スナップショット一覧を確定日時の昇順で返す。",
      inputSchema: {
        type: "object",
        properties: { year: yearProperty },
        required: ["year"],
      },
    },
  ],
  handlers: {
    get_taxpayer_profile: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const own = await getTaxpayerProfileRow(db, year);
      if (own) {
        return textResult({ taxpayer: taxpayerProfileToApi(own), carried_from: null });
      }
      const carry = await findTaxpayerCarryRow(db, year);
      return textResult(
        carry
          ? { taxpayer: taxpayerProfileToApi(carry), carried_from: carry.year }
          : { taxpayer: emptyTaxpayerProfile(), carried_from: null },
      );
    },
    save_taxpayer_profile: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const raw = args["taxpayer"];
      if (typeof raw !== "object" || raw === null) {
        throw new Error("taxpayer（納税者プロフィール）が必要です");
      }
      const parsed = SaveTaxpayerProfileRequestSchema.safeParse(raw);
      if (!parsed.success) {
        throw new Error("taxpayer の形式が不正です（文字列項目のみで渡してください）");
      }
      const data = parsed.data;
      const profile: TaxpayerProfile = {
        name: data.name ?? "",
        name_kana: data.name_kana ?? "",
        zip_code: data.zip_code ?? "",
        address: data.address ?? "",
        address_line2: data.address_line2 ?? "",
        birth_date: data.birth_date ?? "",
        phone: data.phone ?? "",
        tax_office_name: data.tax_office_name ?? "",
        tax_office_code: data.tax_office_code ?? "",
        my_number: data.my_number ?? "",
        user_id: data.user_id ?? "",
        occupation: data.occupation ?? "",
        shop_name: data.shop_name ?? "",
        jan1_address: data.jan1_address ?? "",
        invoice_number: data.invoice_number ?? "",
        previous_zip_code: data.previous_zip_code ?? "",
        previous_address: data.previous_address ?? "",
      };
      const row = await upsertTaxpayerProfileRow(db, year, profile);
      if (!row) throw new Error("納税者プロフィールを保存できませんでした");
      return textResult({ taxpayer: taxpayerProfileToApi(row) });
    },
    get_filing_inputs: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const row = await getFilingInputRow(db, year);
      if (!row) return textResult({ year, state: null, updated_at: null });
      let state: unknown = null;
      try {
        state = JSON.parse(row.state) as unknown;
      } catch {
        state = null;
      }
      return textResult({ year, state, updated_at: row.updatedAt.toISOString() });
    },
    save_filing_inputs: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const state = args["state"];
      if (typeof state !== "object" || state === null) {
        throw new Error("state はオブジェクトで指定してください");
      }
      const row = await upsertFilingInputRow(db, year, state);
      return textResult({ year, state, updated_at: row.updatedAt.toISOString() });
    },
    create_filing_snapshot: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const parsed = FilingSnapshotFiguresSchema.safeParse(args["figures"]);
      if (!parsed.success) {
        throw new Error("figures の形式が不正です（確定した計算結果のオブジェクトが必要です）");
      }
      const row = await insertFilingSnapshotRow(db, year, parsed.data);
      return textResult(filingSnapshotToApi(row));
    },
    list_filing_snapshots: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const rows = await listFilingSnapshotRows(db, year);
      return textResult({ snapshots: rows.map(filingSnapshotToApi) });
    },
  },
};
