/**
 * exportConsumptionXtx.ts — 消費税申告書の XTX 出力ユースケース。
 * DB不要・ステートレス。計算・組み立て・公式 XSD 検証は
 * services/etax/generateConsumptionTaxXtx が行い、入力の不備とスキーマ違反は
 * 400 で返す（検証できない場合は xsd_warning として理由を返す）。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  ExportConsumptionXtxRequestSchema,
  ExportConsumptionXtxResponse,
  ExportConsumptionXtxResponseSchema,
} from "../schemas/etax";
import { ErrorSchema } from "../schemas/common";
import { GeneratedConsumptionXtx, generateConsumptionTaxXtx } from "../services/etax/generateConsumptionTaxXtx";
import { XtxXsdInvalidError } from "../services/etax/xsdValidator";
import { XtxInputError } from "../services/etax/xtxInputs";

export const exportConsumptionXtxRoute = createRoute({
  method: "post",
  path: "/api/etax/export-consumption-xtx",
  operationId: "exportConsumptionXtx",
  tags: ["Etax"],
  summary: "消費税申告書（本則／簡易課税）の e-Tax 申告等データ（XTX）出力（DB不要）",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: ExportConsumptionXtxRequestSchema } },
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: ExportConsumptionXtxResponseSchema } },
      description: "XTXファイル名・内容・合計納付税額",
    },
    400: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "リクエストが不正",
    },
  },
});

export const exportConsumptionXtxHandler: RouteHandler<typeof exportConsumptionXtxRoute> = async (c) => {
  const body = c.req.valid("json");
  let generated: GeneratedConsumptionXtx;
  try {
    generated = await generateConsumptionTaxXtx(body);
  } catch (e) {
    if (e instanceof XtxInputError || e instanceof XtxXsdInvalidError) {
      throw new HTTPException(400, { message: e.message });
    }
    throw e;
  }
  const response: ExportConsumptionXtxResponse = {
    filename: generated.filename,
    xtx: generated.xtx,
    total_payable: generated.totalPayable,
    xsd_warning: generated.xsdWarning,
  };
  return c.json(response, 200);
};
