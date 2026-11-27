/**
 * mcpAssetTools.ts — MCP の固定資産まわりのツール（services/mcp）。
 *
 * 資産の登録・一覧・更新・削除、減価償却の計算と、画像の添付/一覧/取り外し。REST の
 * /api/fixed-assets/{id} 系と同じリポジトリ/検証を使う。画像の添付は
 * REST の署名付きURLフローと違い、実体を Base64 で受けてサーバー側の
 * ストレージへ直接保存する（形式が画像でない場合は弾く）。
 */
import { depreciationForYear, smallSpecialUsage } from "@etax/shared";
import {
  createStorageClient,
  fixedAssetObjectKey,
} from "../../gateways/storageGateway";
import { loadStorageConfig } from "../../lib/config";
import { fixedAssetImageDisplayUrl } from "../../lib/fixedAssetImageUrl";
import { isAllowedUploadContentType, normalizeContentType } from "../../lib/uploadTypes";
import {
  deleteFixedAssetRow,
  fixedAssetToApi,
  fixedAssetToInput,
  getFixedAssetRow,
  insertFixedAssetRow,
  isActiveInYear,
  listFixedAssetRows,
  updateFixedAssetRow,
} from "../../repositories/fixedAssetRepository";
import {
  deleteFixedAssetImageRow,
  fixedAssetImageToApi,
  getFixedAssetImageRowByFileId,
  insertFixedAssetImageRow,
  listFixedAssetImageRows,
} from "../../repositories/fixedAssetImageRepository";
import {
  CreateFixedAssetRequestSchema,
  UpdateFixedAssetRequestSchema,
} from "../../schemas/fixedAsset";
import {
  McpToolModule,
  idArg,
  requireDb,
  textResult,
  yearArg,
  yearProperty,
} from "./mcpToolKit";

const assetPatchProperties = {
  name: { type: "string", description: "資産の名称等" },
  quantity: { type: "string", description: "面積又は数量" },
  income_type: { type: "string", enum: ["business", "real_estate", "agriculture"], description: "所得区分" },
  acquisition_date: { type: "string", description: "取得年月日（YYYY-MM-DD）" },
  service_start_date: {
    type: "string",
    description: "事業供用年月日（YYYY-MM-DD、null で未設定に戻す）",
  },
  cost: { type: "number", description: "取得価額（円）" },
  useful_life_years: { type: "number", description: "耐用年数（年）" },
  method: {
    type: "string",
    enum: ["straight_line", "declining_balance", "lump_sum", "small_special"],
    description: "償却方法",
  },
  business_ratio_percent: { type: "number", description: "事業専用割合 0〜100" },
  disposed_date: {
    type: "string",
    description: "除却・売却年月日（YYYY-MM-DD、null で未処分に戻す）",
  },
};

export const mcpAssetTools: McpToolModule = {
  tools: [
    {
      name: "update_fixed_asset",
      description:
        "固定資産台帳の資産を部分更新する。id 以外は変更したい項目だけ渡す（service_start_date / disposed_date は null で未設定に戻せる）。",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "固定資産ID" }, ...assetPatchProperties },
        required: ["id"],
      },
    },
    {
      name: "delete_fixed_asset",
      description: "固定資産台帳から資産を1件削除する。",
      inputSchema: {
        type: "object",
        properties: { id: { type: "integer", description: "固定資産ID" } },
        required: ["id"],
      },
    },
    {
      name: "attach_fixed_asset_image",
      description:
        "固定資産へ画像を添付する。実体は content_base64（Base64）で渡し、content_type（image/png 等の画像形式）も指定する。添付済み画像は list_fixed_asset_images で確認できる。",
      inputSchema: {
        type: "object",
        properties: {
          asset_id: { type: "integer", description: "固定資産ID" },
          content_base64: { type: "string", description: "画像バイト列の Base64" },
          content_type: { type: "string", description: "画像の MIME タイプ（例: image/png）" },
        },
        required: ["asset_id", "content_base64", "content_type"],
      },
    },
    {
      name: "list_fixed_asset_images",
      description: "固定資産に添付されている画像の一覧を返す（表示用URLつき）。",
      inputSchema: {
        type: "object",
        properties: { asset_id: { type: "integer", description: "固定資産ID" } },
        required: ["asset_id"],
      },
    },
    {
      name: "detach_fixed_asset_image",
      description: "固定資産から画像を取り外す（台帳の行とストレージの実体の両方を消す）。",
      inputSchema: {
        type: "object",
        properties: {
          asset_id: { type: "integer", description: "固定資産ID" },
          file_id: { type: "string", description: "画像のファイルID" },
        },
        required: ["asset_id", "file_id"],
      },
    },
    {
      name: "get_fixed_asset_image_content",
      description:
        "固定資産画像の実体を Base64 で返す。台帳で所有者を確認できたファイルだけを返す（REST の配信と同じ IDOR 対策）。",
      inputSchema: {
        type: "object",
        properties: { file_id: { type: "string", description: "画像のファイルID" } },
        required: ["file_id"],
      },
    },
    {
      name: "register_fixed_asset",
      description:
        "固定資産台帳に資産を登録する。method は straight_line（定額法）/ declining_balance（定率法200%）/ lump_sum（一括償却資産）/ small_special（少額減価償却資産の特例）から選ぶ。",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "資産の名称等" },
          quantity: { type: "string", description: "面積又は数量（任意）" },
          income_type: { type: "string", enum: ["business", "real_estate", "agriculture"], description: "所得区分（既定 business）" },
          acquisition_date: { type: "string", description: "取得年月日（YYYY-MM-DD）" },
          service_start_date: { type: "string", description: "事業供用年月日（任意、省略時は取得日）" },
          cost: { type: "integer", description: "取得価額（円、正の整数）" },
          useful_life_years: { type: "integer", description: "耐用年数（年、1以上の整数）" },
          method: {
            type: "string",
            enum: ["straight_line", "declining_balance", "lump_sum", "small_special"],
            description: "償却方法（既定 straight_line）",
          },
          business_ratio_percent: {
            type: "integer",
            minimum: 0,
            maximum: 100,
            description: "事業専用割合 0〜100の整数（既定100）",
          },
        },
        required: ["name", "acquisition_date", "cost", "useful_life_years"],
      },
    },
    {
      name: "list_fixed_assets",
      description: "固定資産台帳の一覧を返す。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_depreciation",
      description:
        "指定年の減価償却を台帳から計算する（資産ごとの普通償却費・必要経費算入額・未償却残高と、所得区分ごとの合計、少額特例の年間300万円上限の使用状況）。",
      inputSchema: {
        type: "object",
        properties: { year: yearProperty },
        required: ["year"],
      },
    },
  ],
  handlers: {
    update_fixed_asset: async (args) => {
      const db = requireDb();
      const id = idArg(args, "id");
      const { id: _id, ...patchArgs } = args;
      const parsed = UpdateFixedAssetRequestSchema.safeParse(patchArgs);
      if (!parsed.success) {
        throw new Error("固定資産の入力が不正です");
      }
      const body = parsed.data;
      const row = await updateFixedAssetRow(db, id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.quantity !== undefined ? { quantity: body.quantity } : {}),
        ...(body.income_type !== undefined ? { incomeType: body.income_type } : {}),
        ...(body.acquisition_date !== undefined
          ? { acquisitionDate: body.acquisition_date }
          : {}),
        ...(body.service_start_date !== undefined
          ? { serviceStartDate: body.service_start_date }
          : {}),
        ...(body.cost !== undefined ? { cost: body.cost } : {}),
        ...(body.useful_life_years !== undefined
          ? { usefulLifeYears: body.useful_life_years }
          : {}),
        ...(body.method !== undefined ? { method: body.method } : {}),
        ...(body.business_ratio_percent !== undefined
          ? { businessRatioPercent: body.business_ratio_percent }
          : {}),
        ...(body.disposed_date !== undefined ? { disposedDate: body.disposed_date } : {}),
      });
      if (!row) throw new Error(`固定資産が見つかりません: id=${id}`);
      return textResult({ asset: fixedAssetToApi(row) });
    },
    delete_fixed_asset: async (args) => {
      const db = requireDb();
      const id = idArg(args, "id");
      const deleted = await deleteFixedAssetRow(db, id);
      if (!deleted) throw new Error(`固定資産が見つかりません: id=${id}`);
      return textResult({ deleted: true, id });
    },
    attach_fixed_asset_image: async (args) => {
      const db = requireDb();
      const assetId = idArg(args, "asset_id");
      const contentBase64 = args["content_base64"];
      if (typeof contentBase64 !== "string" || contentBase64 === "") {
        throw new Error("content_base64（画像の Base64）が必要です");
      }
      const mimeType = normalizeContentType(
        typeof args["content_type"] === "string" ? args["content_type"] : "",
      );
      if (!isAllowedUploadContentType(mimeType)) {
        throw new Error("対応していないファイル形式です（画像のみ添付できます）");
      }
      const asset = await getFixedAssetRow(db, assetId);
      if (!asset) throw new Error(`固定資産が見つかりません: id=${assetId}`);
      const bytes = Buffer.from(contentBase64, "base64");
      if (bytes.length === 0) throw new Error("content_base64 がデコードできません");
      const fileId = crypto.randomUUID();
      const storage = createStorageClient(loadStorageConfig());
      await storage.save(fixedAssetObjectKey(fileId), bytes, mimeType);
      const row = await insertFixedAssetImageRow(db, { assetId, fileId, mimeType });
      if (!row) throw new Error("画像の登録に失敗しました");
      const url = await fixedAssetImageDisplayUrl(storage, fileId);
      return textResult({ image: fixedAssetImageToApi(row, url) });
    },
    list_fixed_asset_images: async (args) => {
      const db = requireDb();
      const assetId = idArg(args, "asset_id");
      const asset = await getFixedAssetRow(db, assetId);
      if (!asset) throw new Error(`固定資産が見つかりません: id=${assetId}`);
      const storage = createStorageClient(loadStorageConfig());
      const rows = await listFixedAssetImageRows(db, assetId);
      const images = [];
      for (const row of rows) {
        images.push(
          fixedAssetImageToApi(row, await fixedAssetImageDisplayUrl(storage, row.fileId)),
        );
      }
      return textResult({ images });
    },
    detach_fixed_asset_image: async (args) => {
      const db = requireDb();
      const assetId = idArg(args, "asset_id");
      const fileId = args["file_id"];
      if (typeof fileId !== "string" || !fileId) throw new Error("file_id が必要です");
      const asset = await getFixedAssetRow(db, assetId);
      if (!asset) throw new Error(`固定資産が見つかりません: id=${assetId}`);
      const deleted = await deleteFixedAssetImageRow(db, assetId, fileId);
      if (!deleted) throw new Error(`対象の画像が見つかりません: file_id=${fileId}`);
      const storage = createStorageClient(loadStorageConfig());
      await storage.deleteObject(fixedAssetObjectKey(fileId)).catch(() => undefined);
      return textResult({ detached: true, asset_id: assetId, file_id: fileId });
    },
    get_fixed_asset_image_content: async (args) => {
      const db = requireDb();
      const fileId = args["file_id"];
      if (typeof fileId !== "string" || !fileId) throw new Error("file_id が必要です");
      // 台帳で所有者を確認できたファイルだけを返す（REST の配信と同じ IDOR 対策）。
      const row = await getFixedAssetImageRowByFileId(db, fileId);
      if (!row) throw new Error(`固定資産画像が見つかりません: file_id=${fileId}`);
      const storage = createStorageClient(loadStorageConfig());
      const downloaded = await storage.download(fixedAssetObjectKey(fileId));
      return textResult({
        file_id: fileId,
        mime_type: downloaded.mimeType,
        content_base64: downloaded.dataBase64,
      });
    },
    register_fixed_asset: async (args) => {
      const db = requireDb();
      const parsed = CreateFixedAssetRequestSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          "固定資産の入力が不正です（取得価額・耐用年数は正の整数、事業専用割合は0〜100の整数、日付は YYYY-MM-DD）",
        );
      }
      const body = parsed.data;
      const row = await insertFixedAssetRow(db, {
        name: body.name,
        quantity: body.quantity ?? "",
        incomeType: body.income_type ?? "business",
        acquisitionDate: body.acquisition_date,
        serviceStartDate: body.service_start_date ?? null,
        cost: body.cost,
        usefulLifeYears: body.useful_life_years,
        method: body.method ?? "straight_line",
        businessRatioPercent: body.business_ratio_percent ?? 100,
        disposedDate: body.disposed_date ?? null,
      });
      return textResult({ asset: row ? fixedAssetToApi(row) : null });
    },
    list_fixed_assets: async () => {
      const db = requireDb();
      const rows = await listFixedAssetRows(db);
      return textResult({ assets: rows.map(fixedAssetToApi) });
    },
    get_depreciation: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const rows = (await listFixedAssetRows(db)).filter((row) => isActiveInYear(row, year));
      const detail = [];
      const totals = { business: 0, real_estate: 0, agriculture: 0 };
      for (const row of rows) {
        const dep = depreciationForYear(fixedAssetToInput(row), year);
        if (!dep) continue;
        detail.push({
          asset_id: row.id,
          name: row.name,
          income_type: row.incomeType,
          months: dep.months,
          opening_book_value: dep.openingBookValue,
          basis_amount: dep.basisAmount,
          rate: dep.rate,
          guarantee_amount: dep.guaranteeAmount,
          ordinary: dep.ordinary,
          deductible: dep.deductible,
          closing_book_value: dep.closingBookValue,
        });
        if (row.incomeType === "business") totals.business += dep.deductible;
        if (row.incomeType === "real_estate") totals.real_estate += dep.deductible;
        if (row.incomeType === "agriculture") totals.agriculture += dep.deductible;
      }
      return textResult({
        year,
        rows: detail,
        deductible_totals: totals,
        small_special: smallSpecialUsage(rows.map(fixedAssetToInput), year),
      });
    },
  },
};
