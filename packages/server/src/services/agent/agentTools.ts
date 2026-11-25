/**
 * agentTools.ts — 対話エージェントのシステムプロンプトとツールの実処理（services/agent）。
 * ツールの宣言（AI SDK形式のスキーマと説明文）は agentAiTools が持ち、
 * 実処理はここの dispatchTool が担う。
 *
 * 役割分担:
 *   - お金の計算は全部 @etax/shared の決定的な関数が行う。
 *   - LLM は会話の進行、ツールの選択、結果の説明だけを担当する。
 *   - 数字が不足している場合は、LLM に推測させず「不足している」と
 *     ユーザーに伝えるようシステムプロンプトで強く指示する。
 *
 * HTTP はステートレスなので、取引データはリクエストに添付されてくる
 * （クライアントが保持する取引リスト）。ツールはそのデータに対して動く。
 */
import {
  aggregateIncome,
  amendmentDelta,
  blueDeduction,
  consumptionTax,
  estimateInputTax,
  filterYear,
  importCsvText,
  normalizeSearchText,
  residentialRentTotal,
  taxableSalesFromBreakdown,
  ConsumptionMethod,
  Transaction,
} from "@etax/shared";

export const SYSTEM_PROMPT = `あなたは日本の個人事業主（フリーランス）向けの確定申告「準備」アシスタントです。

厳守事項:
- 金額の計算は必ずツール（search_transactions / aggregate_year / consumption_tax / amendment_delta）の結果だけを使い、自分で暗算したり、数字を作ったりしないでください。
- 店舗名・取引先名・キーワードでの支出や収入を聞かれたら、search_transactions で実際に検索して答えてください。「集計できません」と断ったり、表計算ソフトなど外部の道具でユーザー自身に確認させる提案は絶対にしないでください。キーワードで年が特定できなければ year を省略して全年度を検索し、年別の内訳を伝えてください。
- ツールを使うには取引データが必要です。取引データが会話に添付されていない・対象年のデータが無いなどの場合は、その旨をはっきり伝えて、ユーザーにCSV取込やデータの用意をお願いしてください。不足を推測で埋めることは絶対にしないでください。
- 取引の変更・追加・削除もあなたがツールで行えます。「変更できません」「私には権限がありません」と断るのは誤りです。科目・区分・税区分の付け替えは update_transactions、取引の追加は add_transaction、削除は delete_transaction を使ってください。これらは帳簿DB（正本）へ直接書き込みます。表示中のデータが帳簿DBに無いもの（サンプルデータ等）の場合はツールがエラーを返すので、そのときだけ理由を説明してください。
- 設定も含め、アプリでできることは原則あなたがツールで行えます。「ツールが用意されていません」と断るのは誤りです。自動分類の正規表現ルールは get_classification_rules で確認し、set_classification_rules で保存できます（保存は一式の上書きです。1件の追加・変更でも、まず現在の実効ルールを読み、既存ルールを壊さないよう「実効ルール＋変更分」を丸ごと保存してください）。jev 用プロンプトは get_jev_prompt / set_jev_prompt、SystemOne の接続設定は get_systemone_settings / update_systemone_settings、申告ステータス（帳簿の確認・控除計算・提出の済み）は get_filing_status / set_filing_status、納税者情報は get_taxpayer_profile / update_taxpayer_profile、控除・雑所得・配当/一時/株式等譲渡・農業所得・申告の種類の入力は get_deductions / set_deductions（画面側の保存値へ反映されます）で扱えます。摘要の科目判定を試すときは classify_account を使ってください。
- 一括変更（update_transactions）の前に、必ず search_transactions で対象の件数と合計金額を確認してください。実行後は、結果の変更件数・合計金額・変更内容（変更前→変更後）を報告してください。
- 削除（delete_transaction）は取り消せません。日付・摘要・金額で1件に特定できる場合だけ実行し、実行前に search_transactions で対象が1件であることを確認してください。
- あなたは申告書の「作成準備と計算」までを手伝います。e-Tax への最終提出は納税者本人が行うものであり、あなたが提出を代行することはできません。その境界を聞かれたら説明してください。
- 税務判断の境界（税理士法）: 個別の事案への当てはめ判断（「この支出は経費にできるか」「この取引は課税か非課税か」「この金額までなら認められるか」など、その人の具体的な取引や状況に対する判断）は行わないでください。あなたができるのは、(1) 税制の一般的な説明（知識ベースの出典つき）、(2) 帳簿データの集計・計算・操作の代行、(3) 制度や手続きの一般的な案内、までです。個別判断を求められたら、一般論の範囲で制度を説明したうえで「あなたの個別の状況への当てはめは税務判断になるため、税理士への相談をおすすめします」と案内してください。「計上できます」「問題ありません」といった断定で個別事案に答えることは絶対にしないでください。科目の付け替えなど操作の代行はユーザーの指示として実行して構いません（判断の主体はユーザーです）。
- 税制の前提（青色申告特別控除の上限、簡易課税のみなし仕入率、2割特例、住宅家賃は消費税非課税など）・控除の要件・申告や納付の手続き・期限などで不確かな点があれば、推測で答えず、まず search_tax_knowledge で税務知識ベース（国税庁タックスアンサー）を検索してから答えてください。知識ベースの内容を使って答えるときは、出典（国税庁タックスアンサー No.XXXX）を添えてください。検索しても見つからない場合は、その旨を明言してください。
- 回答は簡潔な日本語で。金額にはカンマ区切りと「円」を付けてください。

進め方:
1. まず対象年と取引データの有無を確認する（import_csv_info で添付データの概要が分かります）。
2. aggregate_year → consumption_tax の順で進め、方式（本則/簡易/2割特例）の比較を提示する。
3. 修正申告の相談なら申告済みと修正後のJSONを用意してもらい amendment_delta で差分を出す。
4. 科目の付け替え・取引の追加や削除を頼まれたら、対象を確認してから書き込み系ツール（update_transactions / add_transaction / delete_transaction）で実行する。書き込み後は帳簿が最新状態に更新されるので、続けて集計を頼まれたらそのまま計算してよい。

画面操作:
- 画面のテーマ（ダークモード/ライトモード/端末に合わせる）の変更を頼まれたら、set_theme ツールで切り替えてください。「私ではできません」と断らないでください。`;

export interface AgentContext {
  transactions: Transaction[];
  /** 内部形式CSVの生テキスト（任意）。import_csv_info が優先的に読む。 */
  csvText?: string;
  /**
   * 画面が保持する控除入力（対象年のスナップショット）。
   * get_deductions はこれを返し、set_deductions の結果は画面側が適用する。
   */
  deductions?: { year: number; state: unknown };
}

export interface ToolCallLog {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

/** 対象年の取引を取り出す。添付データ自体が無ければエラーを投げる（LLMへ返す）。 */
function yearTransactions(ctx: AgentContext, year: number): Transaction[] {
  if (ctx.transactions.length === 0) {
    throw new Error(
      "取引データが添付されていません。先に「取引・CSV取込」画面でCSVを取り込むか、サンプルデータを読み込んでください。",
    );
  }
  return filterYear(ctx.transactions, year);
}

/** ツール実行のディスパッチ。 */
export function dispatchTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AgentContext,
): unknown {
  try {
    switch (name) {
      case "import_csv_info": {
        let tx = ctx.transactions;
        let viaCsv = false;
        if (ctx.csvText) {
          tx = importCsvText(ctx.csvText);
          viaCsv = true;
        }
        const byYear: Record<string, number> = {};
        for (const t of tx) byYear[String(t.year)] = (byYear[String(t.year)] ?? 0) + 1;
        return {
          ok: true,
          source: viaCsv ? "csvText" : "attachedTransactions",
          count: tx.length,
          years: Object.keys(byYear).map(Number).sort(),
          byYear,
        };
      }
      case "search_transactions": {
        if (ctx.transactions.length === 0) {
          throw new Error(
            "取引データが添付されていません。先に「取引・CSV取込」画面でCSVを取り込むか、サンプルデータを読み込んでください。",
          );
        }
        const keyword = typeof args["keyword"] === "string" ? args["keyword"].trim() : "";
        if (!keyword) throw new Error("keyword（検索キーワード）が必要です");
        const year = typeof args["year"] === "number" ? args["year"] : null;
        const direction =
          args["direction"] === "expense" || args["direction"] === "income"
            ? args["direction"]
            : "all";
        const needle = normalizeSearchText(keyword);
        const matched = ctx.transactions
          .filter((t) => {
            // 年度は割り当て年度（Transaction.year）で判定する。DB 読み込み
            // 時は fiscal_year が入り、日付の年とは限らない（書き込み側の
            // update_transactions と基準を揃える。Issue #11）。
            if (year !== null && t.year !== year) return false;
            if (direction === "expense" && t.amount >= 0) return false;
            if (direction === "income" && t.amount <= 0) return false;
            return (
              normalizeSearchText(t.description).includes(needle) ||
              normalizeSearchText(t.account).includes(needle) ||
              normalizeSearchText(t.category).includes(needle)
            );
          })
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
        const byYear: Record<string, { count: number; expense_total: number; income_total: number }> = {};
        const byCategory: Record<string, { count: number; expense_total: number; income_total: number }> = {};
        let expenseTotal = 0;
        let incomeTotal = 0;
        for (const t of matched) {
          const yearBucket = (byYear[String(t.year)] ??= { count: 0, expense_total: 0, income_total: 0 });
          const categoryBucket = (byCategory[t.category] ??= { count: 0, expense_total: 0, income_total: 0 });
          yearBucket.count += 1;
          categoryBucket.count += 1;
          if (t.amount < 0) {
            expenseTotal -= t.amount;
            yearBucket.expense_total -= t.amount;
            categoryBucket.expense_total -= t.amount;
          } else if (t.amount > 0) {
            incomeTotal += t.amount;
            yearBucket.income_total += t.amount;
            categoryBucket.income_total += t.amount;
          }
        }
        return {
          keyword,
          year: year ?? "all",
          direction,
          count: matched.length,
          expense_total: expenseTotal,
          income_total: incomeTotal,
          by_year: byYear,
          by_category: byCategory,
          transactions: matched.slice(0, 20).map((t) => ({
            date: t.date,
            description: t.description,
            amount: t.amount,
            account: t.account,
            category: t.category,
          })),
          truncated: matched.length > 20,
        };
      }
      case "aggregate_year": {
        const year = Number(args["year"]);
        const tx = yearTransactions(ctx, year);
        const b = aggregateIncome(tx);
        const blue = blueDeduction(b.realEstateIncome, b.businessIncome);
        return {
          year,
          business_revenue: b.businessRevenue,
          business_expenses: b.businessExpenses,
          business_income: b.businessIncome,
          real_estate_revenue: b.realEstateRevenue,
          real_estate_expenses: b.realEstateExpenses,
          real_estate_income: b.realEstateIncome,
          blue_deduction_real_estate: blue.realEstate,
          blue_deduction_business: blue.business,
          blue_deduction_total: blue.total,
          business_income_after_blue: b.businessIncome - blue.business,
          real_estate_income_after_blue: b.realEstateIncome - blue.realEstate,
        };
      }
      case "consumption_tax": {
        const year = Number(args["year"]);
        const method = (typeof args["method"] === "string" ? args["method"] : "standard") as ConsumptionMethod;
        const tx = yearTransactions(ctx, year);
        const b = aggregateIncome(tx);
        const rent = residentialRentTotal(tx);
        const [taxable, nontaxable] = taxableSalesFromBreakdown(b, rent);
        const inputTax = method === "standard" ? estimateInputTax(tx) : 0;
        const r = consumptionTax({
          taxableSalesIncl: taxable,
          nontaxableSalesIncl: nontaxable,
          inputTax,
          method,
        });
        return {
          year,
          method: r.method,
          taxable_sales_incl_tax: r.taxableSalesIncl,
          nontaxable_sales_incl_tax: r.nontaxableSalesIncl,
          output_tax: r.outputTax,
          input_tax: r.inputTax,
          payable: r.payable,
          detail: r.detail,
          note: "仕入税額は経費からの概算です（本則の場合）。正式には請求書等で確定してください。",
        };
      }
      case "amendment_delta": {
        const original = args["original"];
        const corrected = args["corrected"];
        if (typeof original !== "object" || original === null || typeof corrected !== "object" || corrected === null) {
          throw new Error("original と corrected の両方（JSONオブジェクト）が必要です");
        }
        const d = amendmentDelta(
          original as Record<string, unknown>,
          corrected as Record<string, unknown>,
        );
        return { year: d.year, field_diffs: d.fieldDiffs, tax_delta: d.taxDelta };
      }
      case "get_deductions": {
        if (!ctx.deductions) {
          return {
            ok: false,
            error:
              "控除の入力が会話に添付されていません。画面を開いた状態で再度お試しください。",
          };
        }
        return { ok: true, year: ctx.deductions.year, state: ctx.deductions.state };
      }
      case "set_deductions": {
        // 実際の保存はクライアント側（画面の控除入力）が行う。ここでは適用内容を返す。
        const year = Number(args["year"]);
        if (!Number.isInteger(year)) throw new Error("year（対象年）が必要です");
        const patch: Record<string, unknown> = {};
        if (typeof args["deductions"] === "object" && args["deductions"] !== null) {
          patch["deductions"] = args["deductions"];
        }
        if (typeof args["filing_type"] === "string") patch["filingType"] = args["filing_type"];
        if (typeof args["misc_income"] === "object" && args["misc_income"] !== null) {
          patch["miscIncome"] = args["misc_income"];
        }
        if (typeof args["expanded_income"] === "object" && args["expanded_income"] !== null) {
          patch["expandedIncome"] = args["expanded_income"];
        }
        if (typeof args["agriculture"] === "object" && args["agriculture"] !== null) {
          patch["agriculture"] = args["agriculture"];
        }
        const entries: Record<string, unknown> = {};
        const entryKeys = [
          ["donation_entries", "donations"],
          ["social_insurance_entries", "socialInsurance"],
          ["mutual_aid_entries", "mutualAid"],
          ["medical_entries", "medical"],
        ] as const;
        for (const [argKey, patchKey] of entryKeys) {
          if (Array.isArray(args[argKey])) entries[patchKey] = args[argKey];
        }
        if (Object.keys(entries).length > 0) patch["entries"] = entries;
        if (Object.keys(patch).length === 0) {
          throw new Error("変更内容（deductions / filing_type / misc_income / expanded_income / agriculture / 内訳のいずれか）が必要です");
        }
        return { ok: true, applied: "deductions", year, patch };
      }
      case "set_theme": {
        // 実際の切替はクライアント側が行う。ここでは依頼を記録として返すだけ。
        const mode = typeof args["mode"] === "string" ? args["mode"] : "";
        if (mode !== "light" && mode !== "dark" && mode !== "system") {
          throw new Error("mode は light / dark / system のいずれかを指定してください");
        }
        return { ok: true, applied: "theme", mode };
      }
      default:
        return { error: `未知のツールです: ${name}` };
    }
  } catch (e) {
    // ツール側の例外はLLMへ返して判断させる
    return { error: `${e instanceof Error ? e.name : "Error"}: ${e instanceof Error ? e.message : String(e)}` };
  }
}
