/**
 * agentAiTools.ts — 対話エージェントのツール定義（AI SDK 形式、services/agent）。
 *
 * ツールの実処理は agentTools の dispatchTool（@etax/shared の決定的な計算）に
 * 委ねる。ここでは入力スキーマ（zod）と説明文を持ち、実行結果を
 * ToolCallLog に積んで呼び出し側（画面操作の導出用）へ渡す。
 */
import { tool } from "ai";
import { z } from "zod";
import { searchTaxKnowledge } from "../knowledge/searchTaxKnowledge";
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
    search_transactions: tool({
      description:
        "取引をキーワードで検索し、件数・合計金額・年別/科目別の内訳・明細サンプルを返す。キーワードは摘要・口座名・科目への部分一致（全角半角は吸収）。「ファミリーマートの支出はどのくらい？」「Amazonへの支払い合計は？」のような店舗名・取引先名・キーワードでの質問には必ずこれを使う。year を省略すると全年度を検索する（年別内訳も返る）。direction は expense（支出のみ）/ income（収入のみ）/ all（両方）。",
      inputSchema: z.object({
        keyword: z.string().describe("検索キーワード（例: ファミリーマート、Amazon）"),
        year: z.number().int().optional().describe("対象年（西暦）。省略時は全年度"),
        direction: z.enum(["expense", "income", "all"]).optional().describe("支出/収入の絞り込み"),
      }),
      execute: async ({ keyword, year, direction }) =>
        run("search_transactions", { keyword, year, direction }),
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
    search_tax_knowledge: tool({
      description:
        "税務知識ベース（国税庁タックスアンサーの本文を収録）を検索し、関連する制度・手続きの抜粋と出典（No.とURL）を返す。税率・控除の要件や上限、簡易課税のみなし仕入率、申告・納付の手続きや期限など、税制のルールで不確かな点があるときは、推測で答えず必ずこれで調べてから答える。金額の計算自体は他の計算ツールで行うこと（このツールは制度の確認用）。",
      inputSchema: z.object({
        query: z
          .string()
          .describe("検索キーワード（空白区切りで複数可。例: 簡易課税 みなし仕入率 第5種）"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(10)
          .optional()
          .describe("返す件数（既定5）"),
      }),
      execute: async ({ query, limit }) => {
        const result = await searchTaxKnowledge(query, limit ?? 5);
        log.push({
          name: "search_tax_knowledge",
          arguments: { query, limit: limit ?? 5 },
          result,
        });
        return result;
      },
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
