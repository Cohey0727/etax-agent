/**
 * exportXtx.ts — e-Tax 申告等データ（XTX）出力ユースケース（usecases）。
 * DB不要・ステートレス。計算・組み立て・公式 XSD 検証は
 * services/etax/generateIncomeTaxXtx が行い、入力の不備とスキーマ違反は
 * 400 で返す（検証できない場合は xsd_warning として理由を返す）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { GeneratedXtx, generateIncomeTaxXtx } from "../services/etax/generateIncomeTaxXtx";
import { XtxXsdInvalidError } from "../services/etax/xsdValidator";
import { XtxInputError } from "../services/etax/xtxInputs";
import {
  ExportXtxRequestSchema,
  ExportXtxResponse,
  ExportXtxResponseSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";

export const exportXtxRoute = createRoute({
  method: "post",
  path: "/api/etax/export-xtx",
  operationId: "exportXtx",
  tags: ["Etax"],
  summary: "e-Tax 申告等データ（XTX）の出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportXtxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportXtxResponseSchema } },
      description: "XTXファイル名と内容",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストが不正、または対応外の年分",
    },
  },
});

export const exportXtxHandler: RouteHandler<typeof exportXtxRoute> = async (c) => {
  const body = c.req.valid("json");
  let generated: GeneratedXtx;
  try {
    generated = await generateIncomeTaxXtx(body);
  } catch (e) {
    if (e instanceof XtxInputError || e instanceof XtxXsdInvalidError) {
      throw new HTTPException(400, { message: e.message });
    }
    throw e;
  }
  const response: ExportXtxResponse = {
    filename: generated.filename,
    xtx: generated.xtx,
    xsd_warning: generated.xsdWarning,
  };
  return c.json(response, 200);
};
