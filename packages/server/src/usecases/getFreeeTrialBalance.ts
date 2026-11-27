/**
 * getFreeeTrialBalance.ts — freee試算表データの取得ユースケース（usecases）。
 *
 * freee から取り込んだ試算表（損益計算書ベース）はサーバーのデータ
 * ディレクトリに置かれる（実績の金額を含むため Git 管理しない）。
 * 他の設定ファイルと同じく所有者ごとに分け、既定ユーザー（認証オフの
 * ローカル運用を含む）は freee-trial-balance.json、それ以外の所有者は
 * freee-trial-balance-<所有者ID>.json を読む（他テナントの実績は見せない）。
 * ファイルが無い環境では 404 を返し、画面側はパネル自体を表示しない。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { readFile } from "node:fs/promises";
import { ownerIdForWrite } from "../lib/tenantContext";
import { settingsFilePath } from "../repositories/settingsFiles";
import { ErrorSchema } from "../schemas/common";
import {
  FreeeTrialBalanceResponse,
  FreeeTrialBalanceResponseSchema,
} from "../schemas/freee";

export const getFreeeTrialBalanceRoute = createRoute({
  method: "get",
  path: "/api/freee/trial-balance",
  operationId: "getFreeeTrialBalance",
  tags: ["Freee"],
  summary: "freee試算表（取り込み済み実績データ）",
  responses: {
    200: {
      content: { "application/json": { schema: FreeeTrialBalanceResponseSchema } },
      description: "試算表データ",
    },
    404: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "試算表データが未取り込み",
    },
    500: {
      content: { "application/json": { schema: ErrorSchema } },
      description: "試算表データの形式が不正",
    },
  },
});

export const getFreeeTrialBalanceHandler: RouteHandler<
  typeof getFreeeTrialBalanceRoute
> = async (c) => {
  let text: string;
  try {
    text = await readFile(settingsFilePath("freee-trial-balance.json", ownerIdForWrite()), "utf-8");
  } catch {
    throw new HTTPException(404, { message: "freee試算表データがまだ取り込まれていません" });
  }
  let stored: unknown;
  try {
    stored = JSON.parse(text);
  } catch {
    stored = null;
  }
  const parsed = FreeeTrialBalanceResponseSchema.safeParse(stored);
  if (!parsed.success) {
    throw new HTTPException(500, { message: "freee試算表データの形式が正しくないため読み込めません" });
  }
  const response: FreeeTrialBalanceResponse = parsed.data;
  return c.json(response, 200);
};
