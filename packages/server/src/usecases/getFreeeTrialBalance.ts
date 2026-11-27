/**
 * getFreeeTrialBalance.ts — freee試算表データの取得ユースケース（usecases）。
 *
 * freee から取り込んだ試算表（損益計算書ベース）はサーバーのデータ
 * ディレクトリに置かれる（実績の金額を含むため Git 管理しない）。
 * ローカル運用では freee-trial-balance.json、SaaS（テナント文脈あり）
 * では freee-trial-balance-<所有者ID>.json と所有者別に分ける。
 * ファイルが無い環境では 404 を返し、画面側はパネル自体を表示しない。
 */
import { createRoute, RouteHandler } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serverDataDir } from "../lib/config";
import { currentUserId } from "../lib/tenantContext";
import { ErrorSchema } from "../schemas/common";
import {
  FreeeTrialBalanceResponse,
  FreeeTrialBalanceResponseSchema,
} from "../schemas/freee";

/**
 * 試算表ファイル名。テナント文脈がある場合（SaaS）は所有者別のファイル
 * だけを読む（共有ファイルへはフォールバックしない＝他テナントの実績を
 * 見せない）。文脈が無いローカル運用では従来の共有ファイル名。
 */
function trialBalanceFilename(): string {
  const owner = currentUserId();
  return owner === undefined
    ? "freee-trial-balance.json"
    : `freee-trial-balance-${owner}.json`;
}

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
    text = await readFile(join(serverDataDir(), trialBalanceFilename()), "utf-8");
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
