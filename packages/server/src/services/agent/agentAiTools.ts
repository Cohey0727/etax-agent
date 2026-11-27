/**
 * agentAiTools.ts — 対話エージェントのツール定義（AI SDK 形式、services/agent）。
 *
 * ツールの実処理は agentTools の dispatchTool（@etax/shared の決定的な計算）に
 * 委ねる。ここでは入力スキーマ（zod）と説明文を持ち、実行結果を
 * ToolCallLog に積んで呼び出し側（画面操作の導出用）へ渡す。
 */
import { tool } from "ai";
import { z } from "zod";
import { TaxpayerProfile } from "../../schemas/taxpayer";
import { classifyAccount } from "../classification/classifyAccount";
import { loadClassifyDeps } from "../classification/loadClassifyDeps";
import { searchTaxKnowledge } from "../knowledge/searchTaxKnowledge";
import {
  addTransactionForAgent,
  deleteTransactionExact,
  loadAllTransactionsForAgent,
  updateTransactionsBulk,
} from "./agentDbWrites";
import {
  getClassificationRulesForAgent,
  getFilingStatusForAgent,
  getJevPromptForAgent,
  getSystemOneSettingsForAgent,
  getTaxpayerProfileForAgent,
  setClassificationRulesForAgent,
  setFilingStatusForAgent,
  setJevPromptForAgent,
  updateSystemOneSettingsForAgent,
  updateTaxpayerProfileForAgent,
} from "./agentSettingsTools";
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
  // 設定系ツール。失敗は例外にせず { ok: false, error } として LLM へ返し、説明させる。
  const runSettings = async (
    name: string,
    args: Record<string, unknown>,
    work: () => Promise<unknown>,
  ) => {
    let result: unknown;
    try {
      result = { ok: true, ...(await work()) as Record<string, unknown> };
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
      description:
        "指定年の事業所得・不動産所得を集計し、青色申告特別控除も計算する。控除は申告の種類と不動産の事業的規模で変わり、省略時は画面の申告入力（無ければ青色65万円・事業的規模でない）を使う。",
      inputSchema: z.object({
        year: z.number().int().describe("対象年（西暦）"),
        filing_type: z
          .enum(["blue65", "blue55", "blue10", "white"])
          .optional()
          .describe("申告の種類（省略時は画面の申告入力）"),
        real_estate_business_scale: z
          .boolean()
          .optional()
          .describe("不動産貸付けが事業的規模か（省略時は画面の申告入力）"),
      }),
      execute: async ({ year, filing_type, real_estate_business_scale }) =>
        run("aggregate_year", { year, filing_type, real_estate_business_scale }),
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
          .describe("区分（省略時は摘要と勘定科目から推定）"),
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
    classify_account: tool({
      description:
        "摘要1件の勘定科目を、現在の判定パイプライン（正規表現ルール→判定モデル→キーワードルール）で判定する。「この摘要は何の科目になる？」の確認や、ルール追加前のテストに使う。",
      inputSchema: z.object({
        description: z.string().describe("判定したい摘要（例: ヨドバシカメラ キーボード購入）"),
      }),
      execute: async ({ description }) =>
        runSettings("classify_account", { description }, async () =>
          classifyAccount(description, await loadClassifyDeps()),
        ),
    }),
    get_classification_rules: tool({
      description:
        "自動分類の正規表現ルール一式を返す。custom_rules は手編集されたカスタムルール、generated_rules は学習履歴からの自動生成、effective_rules は実際に判定へ使われるルール（カスタムがあればカスタム優先）。ルールの確認・追加・変更の前に必ずこれで現状を読むこと。",
      inputSchema: z.object({}),
      execute: async () => runSettings("get_classification_rules", {}, getClassificationRulesForAgent),
    }),
    set_classification_rules: tool({
      description:
        "自動分類の正規表現ルールを保存する（一式の上書き。保存したルールが実効ルールになる）。ルールは上から順に照合され、最初に当たったものが使われる。摘要は正規化（英数字は半角・小文字化、カタカナは全角化）された文字列に照合されるため、パターンの英数字は半角小文字、カタカナは全角で書くこと。1件だけ追加・変更したい場合も、get_classification_rules の effective_rules に変更を加えた一式を丸ごと渡すこと（渡さなかったルールは消える）。空配列を渡すとカスタムが消えて自動生成に戻る。",
      inputSchema: z.object({
        rules: z
          .array(
            z.object({
              pattern: z.string().describe("正規表現（正規化済み摘要への部分一致）"),
              category: z.string().describe("勘定科目（例: 消耗品費）"),
            }),
          )
          .describe("ルール一式（優先順）"),
      }),
      execute: async ({ rules }) =>
        runSettings("set_classification_rules", { rules }, () => setClassificationRulesForAgent(rules)),
    }),
    get_jev_prompt: tool({
      description:
        "科目判定モデル（jev）用プロンプトを返す。custom_prompt は手編集されたカスタム、generated_prompt は学習履歴からの自動生成、effective_prompt は実際に使われるもの（カスタム優先）。",
      inputSchema: z.object({}),
      execute: async () => runSettings("get_jev_prompt", {}, getJevPromptForAgent),
    }),
    set_jev_prompt: tool({
      description:
        "科目判定モデル（jev）用プロンプトを保存する。保存したプロンプトが自動生成より優先される。空文字を渡すとカスタムが消えて自動生成に戻る。",
      inputSchema: z.object({
        prompt: z.string().describe("プロンプト全文（空文字で自動生成に戻る）"),
      }),
      execute: async ({ prompt }) =>
        runSettings("set_jev_prompt", { prompt }, () => setJevPromptForAgent(prompt)),
    }),
    get_systemone_settings: tool({
      description:
        "科目判定モデル（SystemOne）の接続設定を返す。base_url / model は保存値（未保存なら空）、effective_base_url / effective_model は実際に使われる値。APIキーは有無（api_key_set）だけが返る。",
      inputSchema: z.object({}),
      execute: async () => runSettings("get_systemone_settings", {}, getSystemOneSettingsForAgent),
    }),
    update_systemone_settings: tool({
      description:
        "科目判定モデル（SystemOne）の接続設定を更新する。指定した項目だけが変わる（空文字は変更しない）。",
      inputSchema: z.object({
        base_url: z.string().optional().describe("接続先URL（例: http://127.0.0.1:11434）"),
        model: z.string().optional().describe("モデル名（例: tev1）"),
        api_key: z.string().optional().describe("APIキー（必要な場合のみ）"),
      }),
      execute: async ({ base_url, model, api_key }) =>
        runSettings("update_systemone_settings", { base_url, model }, () =>
          updateSystemOneSettingsForAgent({ baseUrl: base_url, model, apiKey: api_key }),
        ),
    }),
    get_filing_status: tool({
      description:
        "申告ステータス（帳簿の確認 confirmed / 控除・計算 calculated / 提出 submitted の済み状態）を返す。year を省略すると全年度分を返す。",
      inputSchema: z.object({
        year: z.number().int().optional().describe("対象年（西暦）。省略時は全年度"),
      }),
      execute: async ({ year }) =>
        runSettings("get_filing_status", { year }, () => getFilingStatusForAgent(year)),
    }),
    set_filing_status: tool({
      description:
        "指定年の申告ステータスを更新する。指定した項目だけが変わる（true で済み、false で未了に戻す）。提出（submitted）は e-Tax での送信を本人が終えた場合にだけ true にすること。",
      inputSchema: z.object({
        year: z.number().int().describe("対象年（西暦）"),
        confirmed: z.boolean().optional().describe("帳簿の確認"),
        calculated: z.boolean().optional().describe("控除・計算の確定"),
        submitted: z.boolean().optional().describe("提出"),
      }),
      execute: async ({ year, confirmed, calculated, submitted }) =>
        runSettings("set_filing_status", { year, confirmed, calculated, submitted }, () =>
          setFilingStatusForAgent(year, { confirmed, calculated, submitted }),
        ),
    }),
    get_taxpayer_profile: tool({
      description:
        "指定年の納税者情報（氏名・住所・税務署・インボイス番号など）を返す。対象年に保存が無ければ過去年からの引き継ぎ（carried_from に年が入る）。マイナンバーと利用者識別番号は外部へ出さない方針のため値は返らず、my_number_registered / user_id_registered で登録有無だけが分かる。",
      inputSchema: z.object({
        year: z.number().int().describe("対象年（西暦）"),
      }),
      execute: async ({ year }) =>
        runSettings("get_taxpayer_profile", { year }, () => getTaxpayerProfileForAgent(year)),
    }),
    update_taxpayer_profile: tool({
      description:
        "指定年の納税者情報を更新する。profile には変更する項目だけを snake_case のキーで渡す（name / name_kana / zip_code / address / address_line2 / birth_date / phone / tax_office_name / tax_office_code / my_number / user_id / occupation / shop_name / jan1_address / invoice_number / previous_zip_code / previous_address）。未指定の項目は現在の値を維持する。my_number / user_id は空文字を渡しても消えない。結果の my_number / user_id はマスクされ、登録有無だけが返る。",
      inputSchema: z.object({
        year: z.number().int().describe("対象年（西暦）"),
        profile: z
          .record(z.string(), z.string())
          .describe("変更する項目（snake_case のキーと値）"),
      }),
      execute: async ({ year, profile }) =>
        // ログにはマイナンバー・利用者識別番号の値を残さない（登録有無だけに丸める）
        runSettings(
          "update_taxpayer_profile",
          {
            year,
            profile: {
              ...profile,
              ...(profile.my_number !== undefined
                ? { my_number: profile.my_number ? "（値あり・マスク）" : "" }
                : {}),
              ...(profile.user_id !== undefined
                ? { user_id: profile.user_id ? "（値あり・マスク）" : "" }
                : {}),
            },
          },
          () => updateTaxpayerProfileForAgent(year, profile as Partial<TaxpayerProfile>),
        ),
    }),
    get_deductions: tool({
      description:
        "画面に保存されている控除入力（所得控除・税額控除・雑所得・申告の種類・内訳）を、対象年分まとめて返す。控除の確認や変更の前に使う。",
      inputSchema: z.object({}),
      execute: async () => run("get_deductions", {}),
    }),
    set_deductions: tool({
      description:
        "控除入力を変更する（画面側の保存値へ反映される）。deductions は DeductionInputs の部分JSON（例: {\"socialInsurancePaid\": 140080, \"donationsTotal\": 47000}。23歳未満の扶養親族がいる場合は {\"hasDependentUnder23\": true}。内訳がある控除は *_entries で明細を渡すと合計も自動で合う）。filing_type は blue65 / blue55 / blue10 / white。misc_income は雑所得（revenue / income / kubun）。expanded_income は配当・一時・株式等譲渡の入力。agriculture は農業所得の入力。",
      inputSchema: z.object({
        year: z.number().int().describe("対象年（西暦）"),
        deductions: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("控除入力の部分JSON（DeductionInputs のフィールド名で指定）"),
        filing_type: z
          .enum(["blue65", "blue55", "blue10", "white"])
          .optional()
          .describe("申告の種類"),
        misc_income: z
          .object({
            revenue: z.number().optional(),
            income: z.number().optional(),
            kubun: z.number().optional(),
          })
          .optional()
          .describe("雑所得（その他）の入力"),
        expanded_income: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "配当・一時・株式等譲渡の入力（ExpandedIncomeInput の部分JSON、camelCase）: temp{revenue,expenses}、dividend{listedRevenue,listedTrustRevenue,listedWithholding,listedMode(comprehensive/separate/none),generalRevenue,generalTrustRevenue,generalWithholding,interestExpense}、stocks{general/listed{revenue,otherRevenue,acquisitionCost,transferFees,otherExpenses},listedWithholding,specialAccounts[{brokerName,branchName,withholdingAccount,revenue,cost,withholding}]}",
          ),
        agriculture: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "農業所得の入力（AgricultureInput の部分JSON、camelCase）: farmName、salesAmount（販売金額）、householdConsumption（家事消費・事業消費金額）、miscRevenue（雑収入）、produceOpeningInventory/produceClosingInventory（農産物の棚卸高）、otherOpeningInventory/otherClosingInventory（農産物以外の棚卸高）、expenseTotals（科目名→金額の合計。支出は正の金額）、familyWorkerSalary（専従者給与・青色）、familyWorkerDeduction（専従者控除・白色）、badDebtProvisionIn/badDebtProvisionBack（貸倒引当金）、cultivationCostDeduction（育成費用）、beefCattleExemptionAmount（肉用牛特例金額・表示のみ）",
          ),
        donation_entries: z
          .array(z.object({ recipient: z.string(), amount: z.number() }))
          .optional()
          .describe("寄附金の内訳（名称と金額）"),
        social_insurance_entries: z
          .array(z.object({ recipient: z.string(), amount: z.number() }))
          .optional()
          .describe("社会保険料の内訳"),
        mutual_aid_entries: z
          .array(z.object({ recipient: z.string(), amount: z.number() }))
          .optional()
          .describe("小規模企業共済等掛金の内訳"),
        medical_entries: z
          .array(z.object({ recipient: z.string(), amount: z.number() }))
          .optional()
          .describe("医療費の内訳"),
      }),
      execute: async (args) => run("set_deductions", { ...args }),
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
