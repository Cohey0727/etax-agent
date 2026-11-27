/**
 * mcpCashFlowTools.ts — MCP の資金繰りレポートまわりのツール（services/mcp）。
 *
 * REST の GET /api/cash-flow と同じ組み立て（services/cashFlow）を呼び、
 * 経路で結果がずれないようにする。数値は「登録済みの取引実績と未入金の
 * 請求書に基づく試算」で、税務判断は含まない（読み取り専用ツール）。
 */
import { CashFlowReportParams, fetchCashFlowReport } from "../cashFlow/getCashFlowReportData";
import { McpToolModule, requireDb, textResult } from "./mcpToolKit";

const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export const mcpCashFlowTools: McpToolModule = {
  tools: [
    {
      name: "get_cash_flow_report",
      description:
        "資金繰りレポートを返す。過去実績（帳簿の取引の入出金）と、未消込の請求書が支払期日どおりに入金される前提の将来残高を月次で試算する。期日超過の未入金は当月入金予定として扱い、期日未設定の請求書は undated_receipts に分けて返す（月次には積まない）。from_month 省略時は当月を含む前5か月〜先6か月の12か月、opening_balance は窓の開始月初時点の残高（省略時0）。登録済み予定に基づく試算であり、金額の保証ではない。",
      inputSchema: {
        type: "object",
        properties: {
          from_month: { type: "string", description: "表示窓の開始月（YYYY-MM、任意）" },
          months: { type: "integer", description: "表示する月数 1〜24（任意、既定12）" },
          opening_balance: {
            type: "integer",
            description: "窓の開始月初時点の残高（円、任意、既定0）",
          },
        },
      },
    },
  ],
  handlers: {
    get_cash_flow_report: async (args) => {
      const db = requireDb();
      const params: CashFlowReportParams = {};
      const fromMonth = args["from_month"];
      if (fromMonth !== undefined) {
        if (typeof fromMonth !== "string" || !monthPattern.test(fromMonth)) {
          throw new Error("from_month は YYYY-MM 形式で渡してください");
        }
        params.fromMonth = fromMonth;
      }
      const months = args["months"];
      if (months !== undefined) {
        if (typeof months !== "number" || !Number.isInteger(months) || months < 1 || months > 24) {
          throw new Error("months は1〜24の整数で渡してください");
        }
        params.monthCount = months;
      }
      const openingBalance = args["opening_balance"];
      if (openingBalance !== undefined) {
        if (typeof openingBalance !== "number" || !Number.isInteger(openingBalance)) {
          throw new Error("opening_balance は整数で渡してください");
        }
        params.openingBalance = openingBalance;
      }
      return textResult(await fetchCashFlowReport(db, params));
    },
  },
};
