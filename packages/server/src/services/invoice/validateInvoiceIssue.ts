/**
 * validateInvoiceIssue.ts — 請求書の発行前チェック（services/invoice）。
 *
 * 適格請求書として発行する場合は、消費税法57条の4第1項の6記載事項が
 * 欠けないことを発行前に検証する。登録番号は納税者プロフィールの値を
 * そのまま使うだけで、自動生成・補完は絶対にしない（未登録者が適格
 * 請求書と誤認される書類を交付すると罰則対象になるため）。
 */
import { InvoiceIssuer } from "../../schemas/invoice";
import { TaxpayerProfile } from "../../schemas/taxpayer";

/** 適格請求書発行事業者の登録番号の形式（T＋数字13桁）。 */
const INVOICE_NUMBER_PATTERN = /^T\d{13}$/;

/** 適格請求書に記載できる税率（標準10%・軽減8%・対象外0%）。 */
const QUALIFIED_TAX_RATES: readonly number[] = [10, 8, 0];

/** 発行者スナップショットをプロフィールから作る。屋号があれば屋号を名称にする。 */
export function buildIssuerSnapshot(profile: TaxpayerProfile, isQualified: boolean): InvoiceIssuer {
  const address = [profile.address, profile.address_line2].filter((part) => part !== "").join(" ");
  return {
    name: profile.shop_name !== "" ? profile.shop_name : profile.name,
    zip_code: profile.zip_code,
    address,
    invoice_number: isQualified ? profile.invoice_number : "",
  };
}

/** 発行チェックの対象（帳票ヘッダと明細の最小形）。 */
export interface InvoiceIssueTarget {
  is_qualified: boolean;
  counterparty_name: string;
  issue_date: string;
  lines: readonly { item_name: string; tax_rate_percent: number; is_reduced_rate: boolean }[];
}

/**
 * 発行できるかを検証し、問題があれば利用者向けの文言で列挙する（空なら発行可）。
 * 適格請求書の6記載事項のうち、税率ごとの合計・消費税額は計算で常に満たすため、
 * ここでは残りの人的入力項目（発行者・登録番号・取引年月日・取引内容・交付先）を診る。
 */
export function validateInvoiceIssue(
  target: InvoiceIssueTarget,
  profile: TaxpayerProfile,
): string[] {
  const problems: string[] = [];
  if (target.issue_date === "") {
    problems.push("発行日（取引年月日）が未入力です");
  }
  if (target.counterparty_name.trim() === "") {
    problems.push("交付先の氏名又は名称が未入力です");
  }
  if (target.lines.length === 0) {
    problems.push("明細が1行もありません");
  }
  if (target.lines.some((line) => line.item_name.trim() === "")) {
    problems.push("取引内容（品目）が未入力の明細があります");
  }
  if (!target.is_qualified) return problems;

  const issuer = buildIssuerSnapshot(profile, true);
  if (issuer.name.trim() === "") {
    problems.push("発行者の氏名又は名称が納税者プロフィールに未設定です");
  }
  if (profile.invoice_number === "") {
    problems.push(
      "インボイス登録番号が納税者プロフィールに未設定です。登録番号がないと適格請求書は発行できません（番号の自動生成はしません）",
    );
  } else if (!INVOICE_NUMBER_PATTERN.test(profile.invoice_number)) {
    problems.push("インボイス登録番号の形式が正しくありません（T＋数字13桁）");
  }
  if (target.lines.some((line) => !QUALIFIED_TAX_RATES.includes(line.tax_rate_percent))) {
    problems.push("税率は 10%・8%（軽減）・対象外（0%）のいずれかにしてください");
  }
  if (
    target.lines.some((line) => line.tax_rate_percent === 8 && !line.is_reduced_rate)
  ) {
    problems.push("税率8%の明細は軽減税率の対象として明示してください（取引内容への記載が必要です）");
  }
  if (target.lines.some((line) => line.tax_rate_percent !== 8 && line.is_reduced_rate)) {
    problems.push("軽減税率の対象にできるのは税率8%の明細だけです");
  }
  return problems;
}
