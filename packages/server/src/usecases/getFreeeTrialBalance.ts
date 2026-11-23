/**
 * getFreeeTrialBalance.ts — freee試算表データの取得ユースケース（usecases）。
 *
 * freee から取り込んだ試算表（損益計算書ベース）はサーバーのデータ
 * ディレクトリに freee-trial-balance.json として置かれる（実績の金額を
 * 含むため Git 管理しない）。ファイルが無い環境では 404 を返し、
 * 画面側はパネル自体を表示しない。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../lib/config";
import { ErrorSchema } from "../schemas/common";
import {
  FreeeTrialBalanceResponse,
  FreeeTrialBalanceResponseSchema,
} from "../schemas/freee";

const TRIAL_BALANCE_FILENAME = "freee-trial-balance.json";

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
  },
});

export const getFreeeTrialBalanceHandler: RouteHandler<
  typeof getFreeeTrialBalanceRoute
> = async (c) => {
  let text: string;
  try {
    text = await readFile(join(serverDataDir(), TRIAL_BALANCE_FILENAME), "utf-8");
  } catch {
    throw new HTTPException(404, { message: "freee試算表データがまだ取り込まれていません" });
  }
  const parsed = JSON.parse(text) as FreeeTrialBalanceResponse;
  return c.json(parsed, 200);
};
