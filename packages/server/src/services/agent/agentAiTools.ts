/**
 * agentAiTools.ts — 対話エージェントのツール定義（AI SDK 形式、services/agent）。
 *
 * ツールの実処理は agentTools の dispatchTool（@etax/shared の決定的な計算）に
 * 委ねる。ここでは入力スキーマ（zod）と説明文を持ち、実行結果を
 * ToolCallLog に積んで呼び出し側（画面操作の導出用）へ渡す。
 */
import { tool } from "ai";
import { z } from "zod";
import { AgentContext, ToolCallLog, dispatchTool } from "./agentTools";

/** エージェントのツール一式を生成する。実行のたびに log へ記録が追加される。 */
export function createAgentTools(ctx: AgentContext, log: ToolCallLog[]) {
  const run = (name: string, args: Record<string, unknown>) => {
    const result = dispatchTool(name, args, ctx);
    log.push({ name, arguments: args, result });
    return result;
  };
  return {
    import_csv_info: tool({
      description:
        "会話に添付されている取引データの概要（件数・年・年ごとの件数）を返す。データの有無の確認に使う。",
      inputSchema: z.object({}),
      execute: async () => run("import_csv_info", {}),
    }),
    aggregate_year: tool({
      description: "指定年の事業所得・不動産所得を集計し、青色申告特別控除も計算する。",
      inputSchema: z.object({
        year: z.number().int().describe("対象年（西暦）"),
      }),
      execute: async ({ year }) => run("aggregate_year", { year }),
    }),
    consumption_tax: tool({
      description:
        "指定年の消費税を計算する。method は standard（本則）/ simplified（簡易課税）/ special20（2割特例）。",
      inputSchema: z.object({
        year: z.number().int(),
        method: z.enum(["standard", "simplified", "special20"]),
      }),
      execute: async ({ year, method }) => run("consumption_tax", { year, method }),
    }),
    set_theme: tool({
      description:
        "画面のテーマ（表示モード）を切り替える。ダークモードにして、明るくして、端末設定に合わせて、等の依頼に使う。mode は light（ライト）/ dark（ダーク）/ system（端末に合わせる）。",
      inputSchema: z.object({
        mode: z.enum(["light", "dark", "system"]),
      }),
      execute: async ({ mode }) => run("set_theme", { mode }),
    }),
    amendment_delta: tool({
      description:
        "申告済みJSON（original）と修正後JSON（corrected）を比較し、項目ごとの差分と税額の増減を返す。ユーザーが両方のJSONを提示した場合に使う。",
      inputSchema: z.object({
        original: z.record(z.string(), z.unknown()).describe("申告済み内容のフラットなJSON"),
        corrected: z.record(z.string(), z.unknown()).describe("修正後内容のフラットなJSON"),
      }),
      execute: async ({ original, corrected }) =>
        run("amendment_delta", { original, corrected }),
    }),
  };
}
