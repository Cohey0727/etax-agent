/**
 * mcpMetaTools.ts — MCP のメタ/設定系ツール（services/mcp）。
 *
 * ヘルスチェック相当、勘定科目マスタ、月次集計、SystemOne 接続設定と
 * 科目判定の学習設定（jev プロンプト/正規表現ルール）、freee 試算表、
 * 接続テスト（SystemOne / 外部接続）と対話エージェントの実行。
 * REST の /api/health・/api/settings/systemone・接続テスト系・
 * /api/agent/chat・/api/classify 系・/api/freee/trial-balance と同じ部品を使う。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ACCOUNT_CRITERIA, aggregateIncome, buildTrialBalance, XtxBalanceSheetInput } from "@etax/shared";
import { billingEnabled } from "../../gateways/stripeGateway";
import {
  getJevPromptOverride,
  getSystemOneOverrides,
  loadAgentConfig,
  loadStorageConfig,
  loadSystemOneConfig,
  serverDataDir,
} from "../../lib/config";
import { isDatabaseConfigured } from "../../lib/db";
import { currentUserId } from "../../lib/tenantContext";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import { saveJevPromptOverride } from "../../repositories/jevPromptRepository";
import { saveRegexRulesOverride } from "../../repositories/regexRulesRepository";
import { getSubscriptionRow } from "../../repositories/subscriptionRepository";
import { listTransactionRows } from "../../repositories/transactionRepository";
import { BalanceSheetInputSchema } from "../../schemas/etax";
import { balanceSheetFromWire } from "../../usecases/exportXtx";
import { toSystemOneSettingsResponse } from "../../usecases/systemOneSettingsView";
import { AgentChatError, executeAgentChat } from "../agent/executeAgentChat";
import { testAgentConnection } from "../agent/testAgentConnection";
import { testSystemOneConnection } from "../classification/testSystemOneConnection";
import { updateSystemOneSettings } from "../classification/updateSystemOneSettings";
import { generateRules, RegexRule } from "../classification/generateRules";
import { buildRegexRulesView } from "../classification/regexRulesView";
import { validateRegexRules } from "../classification/validateRegexRules";
import {
  McpToolModule,
  filingOptionsArg,
  filingTypeProperty,
  ledgerTransactions,
  realEstateScaleProperty,
  requireDb,
  rowsToTransactions,
  textResult,
  yearArg,
  yearProperty,
} from "./mcpToolKit";

export const mcpMetaTools: McpToolModule = {
  tools: [
    {
      name: "health",
      description:
        "サーバーの疎通状態を返す（REST の GET /api/health 相当）。DB・ストレージ・エージェントの設定有無を含む。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "list_account_master",
      description:
        "勘定科目マスタ（科目名と判定基準の一覧）を返す。取引の category に指定できる科目の正典。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "monthly_breakdown",
      description:
        "指定年の帳簿取引を月別に集計する（事業・不動産ごとの収入/経費/所得と件数）。ダッシュボードの月次推移と同じ数字。",
      inputSchema: {
        type: "object",
        properties: { year: yearProperty },
        required: ["year"],
      },
    },
    {
      name: "get_systemone_settings",
      description:
        "科目判定AI（SystemOne / jev）の接続設定を返す。APIキーの実値は返らず、設定済みかどうかだけが分かる。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "update_systemone_settings",
      description:
        "科目判定AI（SystemOne / jev）の接続設定を保存する。base_url / model は渡した項目だけが置き換わり（空文字で保存値クリア、省略した項目は保存値のまま）、api_key は渡した時だけ差し替わり、clear_api_key=true で削除される。保存した設定は画面・MCP・エージェントの判定すべてに効く。",
      inputSchema: {
        type: "object",
        properties: {
          base_url: { type: "string", description: "接続先 URL（任意）" },
          model: { type: "string", description: "モデル名（任意）" },
          api_key: { type: "string", description: "APIキー（任意、差し替える時だけ）" },
          clear_api_key: { type: "boolean", description: "保存済みAPIキーを削除する（任意）" },
        },
      },
    },
    {
      name: "test_systemone_connection",
      description:
        "科目判定AI（SystemOne / jev）への接続テストを行う（REST の POST /api/settings/systemone/test 相当）。base_url / model / api_key を渡すと未保存のその値でテストし、省略した項目は現在の有効値を使う。ダミー判定を1回投げ、{ ok, top, error } を返す。",
      inputSchema: {
        type: "object",
        properties: {
          base_url: { type: "string", description: "接続先 URL（任意）" },
          model: { type: "string", description: "モデル名（任意）" },
          api_key: { type: "string", description: "APIキー（任意）" },
        },
      },
    },
    {
      name: "test_agent_connection",
      description:
        "外部接続（AI）への接続テストを行う（REST の POST /api/settings/agent/test 相当）。base_url / model / api_key を渡すと未保存のその値でテストし、省略した項目はサーバーの現在の設定を使う。最小の生成リクエストを1回投げ、{ ok, model, reply, error } を返す。",
      inputSchema: {
        type: "object",
        properties: {
          base_url: { type: "string", description: "接続先 URL（任意）" },
          model: { type: "string", description: "モデル名（任意）" },
          api_key: { type: "string", description: "APIキー（任意）" },
        },
      },
    },
    {
      name: "get_classify_settings",
      description:
        "科目判定の学習設定を返す。jev プロンプト（カスタム/自動生成/実効）と正規表現ルール（カスタム/自動生成/実効）。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "update_classify_settings",
      description:
        "科目判定の学習設定を保存する。jev_prompt を渡すとカスタムプロンプトを置き換え（空文字で自動生成に戻る）、regex_rules を渡すとカスタムルール一式を置き換える（空配列で自動生成に戻る）。パターンと科目は検証される。",
      inputSchema: {
        type: "object",
        properties: {
          jev_prompt: { type: "string", description: "カスタムプロンプト（任意）" },
          regex_rules: {
            type: "array",
            description: "正規表現ルール一式（任意）: [{pattern, account, source?}]",
            items: { type: "object" },
          },
        },
      },
    },
    {
      name: "get_freee_trial_balance",
      description:
        "取り込み済みの freee 試算表（損益計算書ベースの実績データ）を返す。未取り込みの場合はエラーになる。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "get_trial_balance",
      description:
        "帳簿の取引から残高試算表（損益計算書＋貸借対照表）を組み立てて返す。前年分も previous に含む（レポート画面の試算表と同じ集計）。貸借対照表セクションは balance_sheet（期首・期末の残高入力）を渡したときだけ付く。",
      inputSchema: {
        type: "object",
        properties: {
          year: yearProperty,
          filing_type: filingTypeProperty,
          real_estate_business_scale: realEstateScaleProperty,
          balance_sheet: {
            type: "object",
            description:
              "貸借対照表の入力（任意）: {opening: {科目キー: 期首残高}, closing: {科目キー: 期末残高}, extra_asset / extra_liability1 / extra_liability2: {name, opening, closing}, owner_loan, owner_borrowing}",
          },
        },
        required: ["year"],
      },
    },
    {
      name: "get_billing_plan",
      description:
        "課金プランの状態を返す（読み取り専用）: 課金が有効か、契約ステータス、現在の期間の終了日時。契約・支払い自体は本人がブラウザで行うため、ここでは変更できない。",
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "agent_chat",
      description:
        "アプリ内対話エージェントを1ターン実行する（REST の POST /api/agent/chat 相当）。messages（[{role: 'user'|'assistant', content}]）が必須。エージェントは帳簿の集計・計算・CSV取込などの道具立てを使って応答し、{ reply, toolCalls } を返す。transactions / csv_text / attachments（[{name, mimeType, dataBase64?, text?}]）/ deductions（{year, state}）/ agent_config（{api_key, base_url, model} の接続上書き）も REST と同じ意味で渡せる。サーバーに AGENT_API_KEY が無ければエラーになる。",
      inputSchema: {
        type: "object",
        properties: {
          messages: {
            type: "array",
            description: "会話履歴: [{role: 'user'|'assistant', content: string}]",
            items: { type: "object" },
          },
          transactions: {
            type: "array",
            description: "取引（REST の /api/agent/chat と同じ wire 形式、任意）",
            items: { type: "object" },
          },
          csv_text: { type: "string", description: "CSV テキスト（任意）" },
          attachments: {
            type: "array",
            description: "添付ファイル（任意）: [{name, mimeType, dataBase64?, text?}]",
            items: { type: "object" },
          },
          deductions: {
            type: "object",
            description: "控除入力のスナップショット（任意）: {year, state}",
          },
          agent_config: {
            type: "object",
            description: "接続先の上書き（任意）: {api_key, base_url, model}",
          },
        },
        required: ["messages"],
      },
    },
  ],
  handlers: {
    health: async () => {
      let agentConfigured = false;
      let agentSchema: string | null = null;
      try {
        const cfg = loadAgentConfig();
        agentConfigured = Boolean(cfg.apiKey);
        agentSchema = cfg.schema;
      } catch {
        agentSchema = null;
      }
      return textResult({
        ok: true,
        service: "etax-agent",
        dbConfigured: isDatabaseConfigured(),
        agentConfigured,
        agentSchema,
        storageConfigured: loadStorageConfig().configured,
      });
    },
    list_account_master: async () => {
      return textResult({
        accounts: ACCOUNT_CRITERIA.map((c) => ({ account: c.account, criteria: c.criteria })),
      });
    },
    monthly_breakdown: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      const tx = await ledgerTransactions(db, year);
      const months = [];
      for (let month = 1; month <= 12; month++) {
        const inMonth = tx.filter((t) => Number(t.date.slice(5, 7)) === month);
        const b = aggregateIncome(inMonth);
        months.push({
          month,
          count: inMonth.length,
          business_revenue: b.businessRevenue,
          business_expenses: b.businessExpenses,
          business_income: b.businessIncome,
          real_estate_revenue: b.realEstateRevenue,
          real_estate_expenses: b.realEstateExpenses,
          real_estate_income: b.realEstateIncome,
          other_revenue: b.otherRevenue,
          other_expenses: b.otherExpenses,
        });
      }
      return textResult({ year, months });
    },
    get_systemone_settings: async () => {
      return textResult(toSystemOneSettingsResponse(getSystemOneOverrides(), loadSystemOneConfig()));
    },
    update_systemone_settings: async (args) => {
      const optionalText = (value: unknown): string | undefined =>
        typeof value === "string" ? value : undefined;
      const saved = await updateSystemOneSettings({
        baseUrl: optionalText(args["base_url"]),
        model: optionalText(args["model"]),
        apiKey: optionalText(args["api_key"]),
        clearApiKey: args["clear_api_key"] === true,
      });
      return textResult(toSystemOneSettingsResponse(saved, loadSystemOneConfig()));
    },
    test_systemone_connection: async (args) => {
      return textResult(
        await testSystemOneConnection({
          baseUrl: typeof args["base_url"] === "string" ? args["base_url"] : undefined,
          model: typeof args["model"] === "string" ? args["model"] : undefined,
          apiKey: typeof args["api_key"] === "string" ? args["api_key"] : undefined,
        }),
      );
    },
    test_agent_connection: async (args) => {
      return textResult(
        await testAgentConnection({
          baseUrl: typeof args["base_url"] === "string" ? args["base_url"] : undefined,
          model: typeof args["model"] === "string" ? args["model"] : undefined,
          apiKey: typeof args["api_key"] === "string" ? args["api_key"] : undefined,
        }),
      );
    },
    get_classify_settings: async () => {
      const history = await loadClassificationHistory();
      const customPrompt = getJevPromptOverride();
      const generatedPrompt = generateRules(history).jevPrompt;
      return textResult({
        jev_prompt: {
          customPrompt,
          generatedPrompt,
          effectivePrompt: customPrompt || generatedPrompt,
        },
        regex_rules: await buildRegexRulesView(),
      });
    },
    update_classify_settings: async (args) => {
      if (typeof args["jev_prompt"] === "string") {
        await saveJevPromptOverride(args["jev_prompt"]);
      }
      if (args["regex_rules"] !== undefined) {
        if (!Array.isArray(args["regex_rules"])) {
          throw new Error("regex_rules は配列で渡してください");
        }
        const validated = validateRegexRules(args["regex_rules"] as RegexRule[]);
        if (!validated.ok) throw new Error(validated.message);
        await saveRegexRulesOverride(validated.rules);
      }
      const history = await loadClassificationHistory();
      const customPrompt = getJevPromptOverride();
      const generatedPrompt = generateRules(history).jevPrompt;
      return textResult({
        jev_prompt: {
          customPrompt,
          generatedPrompt,
          effectivePrompt: customPrompt || generatedPrompt,
        },
        regex_rules: await buildRegexRulesView(),
      });
    },
    get_freee_trial_balance: async () => {
      const owner = currentUserId();
      const filename =
        owner === undefined
          ? "freee-trial-balance.json"
          : `freee-trial-balance-${owner}.json`;
      let text: string;
      try {
        text = await readFile(join(serverDataDir(), filename), "utf-8");
      } catch {
        throw new Error("freee試算表データがまだ取り込まれていません");
      }
      return textResult(JSON.parse(text) as unknown);
    },
    get_trial_balance: async (args) => {
      const db = requireDb();
      const year = yearArg(args);
      let balanceSheet: XtxBalanceSheetInput | undefined;
      if (args["balance_sheet"] !== undefined) {
        const parsed = BalanceSheetInputSchema.safeParse(args["balance_sheet"]);
        if (!parsed.success) throw new Error("balance_sheet の形式が正しくありません");
        balanceSheet = balanceSheetFromWire({ balance_sheet: parsed.data });
      }
      const currentRows = await listTransactionRows(db, undefined, year);
      const previousRows = await listTransactionRows(db, undefined, year - 1);
      const transactions = [
        ...rowsToTransactions(currentRows, year),
        ...rowsToTransactions(previousRows, year - 1),
      ];
      const options = filingOptionsArg(args);
      const current = buildTrialBalance(transactions, year, { ...options, balanceSheet });
      const previous = buildTrialBalance(transactions, year - 1, options);
      return textResult({ ...current, previous });
    },
    get_billing_plan: async () => {
      const db = requireDb();
      const row = await getSubscriptionRow(db);
      return textResult({
        billing_enabled: billingEnabled(),
        status: row?.status ?? "none",
        current_period_end: row?.currentPeriodEnd?.toISOString() ?? null,
      });
    },
    agent_chat: async (args) => {
      // 引数名は MCP の流儀（snake_case）から REST のボディ形式へ読み替える。
      // 検証と実行順序（設定・キーのゲート→検証→実行）は本体が担う。
      const raw: Record<string, unknown> = {};
      if (args["messages"] !== undefined) raw.messages = args["messages"];
      if (args["transactions"] !== undefined) raw.transactions = args["transactions"];
      if (typeof args["csv_text"] === "string") raw.csvText = args["csv_text"];
      if (args["attachments"] !== undefined) raw.attachments = args["attachments"];
      if (args["deductions"] !== undefined) raw.deductions = args["deductions"];
      const agentConfig = args["agent_config"];
      if (typeof agentConfig === "object" && agentConfig !== null) {
        const override = agentConfig as Record<string, unknown>;
        raw.agentConfig = {
          apiKey: typeof override["api_key"] === "string" ? override["api_key"] : undefined,
          baseUrl: typeof override["base_url"] === "string" ? override["base_url"] : undefined,
          model: typeof override["model"] === "string" ? override["model"] : undefined,
        };
      }
      try {
        return textResult(await executeAgentChat(raw));
      } catch (e) {
        if (e instanceof AgentChatError) throw new Error(e.message);
        throw e;
      }
    },
  },
};
