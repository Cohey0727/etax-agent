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
import {
  addTransactionForAgent,
  deleteTransactionExact,
  loadAllTransactionsForAgent,
  updateTransactionsBulk,
} from "./agentDbWrites";
import { AgentContext, ToolCallLog, dispatchTool } from "./agentTools";

/** エージェントのツール一式を生成する。実行のたびに log へ記録が追加される。 */
export function createAgentTools(ctx: AgentContext, log: ToolCallLog[]) {
  const run = (name: string, args: Record<string, unknown>) => {
    const result = dispatchTool(name, args, ctx);
    log.push({ name, arguments: args, result });
    return result;
  };
  // 帳簿DBへの書き込み系ツール。成功したら ctx の取引を DB の最新状態へ差し替え、
  // 同じターン内の後続の集計・検索も変更後の数字で動くようにする。
  // 失敗は例外にせず { ok: false, error } として LLM へ返し、説明させる。
  const runWrite = async (
    name: string,
    args: Record<string, unknown>,
    write: () => Promise<{ ok: true } & Record<string, unknown>>,
  ) => {
    let result: { ok: boolean } & Record<string, unknown>;
    try {
      result = await write();
      ctx.transactions = await loadAllTransactionsForAgent();
    } catch (e) {
      result = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
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
    update_transactions: tool({
      description:
        "帳簿DBの取引を条件で絞り込み、科目・区分・税区分を一括で付け替える（例: 「2023年のＣａＳｙの消耗品費を雑費に変えて」→ keyword=ＣａＳｙ, year=2023, category=消耗品費, set_category=雑費）。絞り込み条件（keyword / year / category / income_type のいずれか1つ以上）と変更内容（set_category / set_income_type / set_tax_category のいずれか1つ以上）が必須。実行前に search_transactions で対象の件数と合計を確認してから使うこと。結果に変更件数と合計金額が返る。科目の付け替えは分類の学習にも反映される。",
      inputSchema: z.object({
        keyword: z
          .string()
          .optional()
          .describe("摘要・口座名・科目への部分一致キーワード（例: ＣａＳｙ、Amazon）"),
        year: z.number().int().optional().describe("割り当て年度（西暦）での絞り込み"),
        category: z.string().optional().describe("現在の科目（完全一致）での絞り込み"),
        income_type: z
          .enum(["business", "real_estate", "other"])
          .optional()
          .describe("現在の区分での絞り込み"),
        set_category: z.string().optional().describe("変更後の科目（例: 雑費）"),
        set_income_type: z
          .enum(["business", "real_estate", "other"])
          .optional()
          .describe("変更後の区分"),
        set_tax_category: z.string().optional().describe("変更後の税区分（例: 課対仕入10%）"),
      }),
      execute: async (args) =>
        runWrite("update_transactions", { ...args }, () =>
          updateTransactionsBulk({
            keyword: args.keyword,
            year: args.year,
            category: args.category,
            incomeType: args.income_type,
            setCategory: args.set_category,
            setIncomeType: args.set_income_type,
            setTaxCategory: args.set_tax_category,
          }),
        ),
    }),
    add_transaction: tool({
      description:
        "取引を1件、帳簿DBへ追加する。amount は符号つき税込金額（収入は正、支出は負）。year は割り当て年度で、省略時は日付の年になる。",
      inputSchema: z.object({
        date: z.string().describe("日付（YYYY-MM-DD）"),
        description: z.string().describe("摘要"),
        amount: z.number().describe("符号つき税込金額（収入は正、支出は負）"),
        account: z.string().optional().describe("口座・カード名"),
        category: z.string().optional().describe("勘定科目（省略時は未分類）"),
        income_type: z
          .enum(["business", "real_estate", "other"])
          .optional()
          .describe("区分（省略時は other）"),
        tax_category: z.string().optional().describe("税区分（例: 課対仕入10%）"),
        year: z.number().int().optional().describe("割り当て年度（西暦）。省略時は日付の年"),
      }),
      execute: async (args) =>
        runWrite("add_transaction", { ...args }, () =>
          addTransactionForAgent({
            date: args.date,
            description: args.description,
            amount: args.amount,
            account: args.account,
            category: args.category,
            incomeType: args.income_type,
            taxCategory: args.tax_category,
            year: args.year,
          }),
        ),
    }),
    delete_transaction: tool({
      description:
        "日付・摘要・金額が完全一致する取引を1件だけ帳簿DBから削除する。削除は取り消せないため、対象が1件に特定できる場合だけ使うこと（複数該当するとエラーになる）。先に search_transactions で対象を確認してから使うこと。",
      inputSchema: z.object({
        date: z.string().describe("日付（YYYY-MM-DD）"),
        description: z.string().describe("摘要（完全一致）"),
        amount: z.number().describe("符号つき税込金額（完全一致）"),
      }),
      execute: async (args) =>
        runWrite("delete_transaction", { ...args }, () =>
          deleteTransactionExact({
            date: args.date,
            description: args.description,
            amount: args.amount,
          }),
        ),
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
