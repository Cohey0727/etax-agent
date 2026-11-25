/**
 * mcpMetaTools.ts — MCP のメタ/設定系ツール（services/mcp）。
 *
 * ヘルスチェック相当、勘定科目マスタ、月次集計、SystemOne 接続設定と
 * 科目判定の学習設定（jev プロンプト/正規表現ルール）、freee 試算表。
 * REST の /api/health・/api/settings/systemone・/api/classify/*・
 * /api/freee/trial-balance と同じ部品を使う。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ACCOUNT_CRITERIA, aggregateIncome } from "@etax/shared";
import {
  getJevPromptOverride,
  getSystemOneOverrides,
  loadAgentConfig,
  loadStorageConfig,
  loadSystemOneConfig,
  serverDataDir,
  SystemOneOverrides,
} from "../../lib/config";
import { isDatabaseConfigured } from "../../lib/db";
import { assertSafeUserBaseUrl, UnsafeUrlError } from "../../lib/ssrfGuard";
import { currentUserId } from "../../lib/tenantContext";
import { loadClassificationHistory } from "../../repositories/classificationHistoryRepository";
import { saveJevPromptOverride } from "../../repositories/jevPromptRepository";
import { saveRegexRulesOverride } from "../../repositories/regexRulesRepository";
import { saveSystemOneSettings } from "../../repositories/systemOneSettingsRepository";
import { toSystemOneSettingsResponse } from "../../usecases/systemOneSettingsView";
import { generateRules, RegexRule } from "../classification/generateRules";
import { buildRegexRulesView } from "../classification/regexRulesView";
import { validateRegexRules } from "../classification/validateRegexRules";
import {
  McpToolModule,
  ledgerTransactions,
  requireDb,
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
        "科目判定AI（SystemOne / jev）の接続設定を保存する。base_url / model は渡した値で置き換わり（空文字で保存値クリア）、api_key は渡した時だけ差し替わり、clear_api_key=true で削除される。保存した設定は画面・MCP・エージェントの判定すべてに効く。",
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
      const current = getSystemOneOverrides();
      const next: SystemOneOverrides = {};
      const baseUrl = typeof args["base_url"] === "string" ? args["base_url"].trim() : "";
      if (baseUrl) {
        // ユーザー指定の接続先は保存前に SSRF 検証する（REST と同じ）。
        try {
          await assertSafeUserBaseUrl(baseUrl);
        } catch (e) {
          if (e instanceof UnsafeUrlError) throw new Error(e.message);
          throw e;
        }
        next.baseUrl = baseUrl;
      }
      const model = typeof args["model"] === "string" ? args["model"].trim() : "";
      if (model) next.model = model;
      const clearApiKey = args["clear_api_key"] === true;
      const newKey = typeof args["api_key"] === "string" ? args["api_key"].trim() : "";
      // 削除指定が最優先。新しい値が来たら差し替え、来なければ既存を維持する。
      if (!clearApiKey && newKey) next.apiKey = newKey;
      if (!clearApiKey && !newKey && current.apiKey) next.apiKey = current.apiKey;
      await saveSystemOneSettings(next);
      return textResult(toSystemOneSettingsResponse(next, loadSystemOneConfig()));
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
  },
};
