/**
 * reconciliation.ts — 入金消込の決定的ロジック（shared）。
 *
 * 発行済み請求書と入金取引の突合は、金額の集計（消込済み額・残額・状態）と
 * 候補の推測（金額一致・取引先名の近似・期日の近接）をすべて純関数で持ち、
 * サーバーと画面が同じ結果を参照する。推測は候補提示までで、消込の確定は
 * 必ずユーザーの承認操作を経る（自動で確定させない）。
 */

import { normalizeSearchText } from "./text";

/** 消込レコードの種別。payment は入金取引の充当、fee / discount は差額調整、
 * overpayment は過入金（預り金）の記録で、消込済み額には数えない。 */
export const InvoicePaymentKind = {
  Payment: "payment",
  Fee: "fee",
  Discount: "discount",
  Overpayment: "overpayment",
} as const;
export type InvoicePaymentKind = (typeof InvoicePaymentKind)[keyof typeof InvoicePaymentKind];

/** 請求書の消込状態。 */
export const InvoicePaymentStatus = {
  Unpaid: "unpaid",
  Partial: "partial",
  Paid: "paid",
} as const;
export type InvoicePaymentStatus =
  (typeof InvoicePaymentStatus)[keyof typeof InvoicePaymentStatus];

export interface InvoicePaymentEntry {
  kind: InvoicePaymentKind;
  /** 正の金額（円）。 */
  amount: number;
}

export interface InvoiceSettlement {
  /** 消込済み額（payment + fee + discount の合計。請求額を超えない）。 */
  settledAmount: number;
  /** 未消込の残額。 */
  remainingAmount: number;
  /** 過入金として預り金処理した額（消込済み額には含めない）。 */
  overpaidAmount: number;
  status: InvoicePaymentStatus;
}

/** 消込レコードの集合から、請求書の消込状態を決める。 */
export function computeInvoiceSettlement(
  totalAmount: number,
  payments: readonly InvoicePaymentEntry[],
): InvoiceSettlement {
  let settled = 0;
  let overpaid = 0;
  for (const payment of payments) {
    if (payment.kind === InvoicePaymentKind.Overpayment) {
      overpaid += payment.amount;
    } else {
      settled += payment.amount;
    }
  }
  const settledAmount = Math.min(settled, totalAmount);
  const remainingAmount = Math.max(totalAmount - settled, 0);
  const status =
    remainingAmount === 0 && totalAmount > 0
      ? InvoicePaymentStatus.Paid
      : settledAmount > 0
        ? InvoicePaymentStatus.Partial
        : InvoicePaymentStatus.Unpaid;
  return { settledAmount, remainingAmount, overpaidAmount: overpaid, status };
}

/** 候補スコアの内訳（表示・並び替えの根拠）。 */
export const ReconciliationReason = {
  AmountExact: "amount_exact",
  AmountPartial: "amount_partial",
  NameMatch: "name_match",
  DateClose: "date_close",
} as const;
export type ReconciliationReason =
  (typeof ReconciliationReason)[keyof typeof ReconciliationReason];

export interface ReconciliationInvoice {
  totalAmount: number;
  remainingAmount: number;
  counterpartyName: string;
  issueDate: string;
  dueDate: string | null;
}

export interface ReconciliationTransaction {
  id: number;
  date: string;
  description: string;
  /** 取引の金額（入金は正）。 */
  amount: number;
  /** すでに他の請求書へ消し込まれた額。 */
  appliedAmount: number;
}

export interface ReconciliationCandidate {
  transactionId: number;
  /** この取引の未消込額（金額 − 消込済み額）。 */
  unappliedAmount: number;
  /** 承認した場合に充当される額（未消込額と請求残額の小さい方）。 */
  suggestedAmount: number;
  score: number;
  reasons: ReconciliationReason[];
}

const corporateMarkers = ["株式会社", "有限会社", "合同会社", "（株）", "(株)", "㈱"];

/** 取引先名の照合用に、法人格の表記を落とした正規化名を作る。 */
function strippedCounterpartyName(counterpartyName: string): string {
  let name = normalizeSearchText(counterpartyName);
  for (const marker of corporateMarkers) {
    name = name.split(normalizeSearchText(marker)).join("");
  }
  return name.replace(/\s+/g, "");
}

function nameMatches(counterpartyName: string, description: string): boolean {
  const target = normalizeSearchText(description).replace(/\s+/g, "");
  if (!target) return false;
  const full = normalizeSearchText(counterpartyName).replace(/\s+/g, "");
  if (full.length >= 2 && target.includes(full)) return true;
  const stripped = strippedCounterpartyName(counterpartyName);
  return stripped.length >= 2 && target.includes(stripped);
}

/** YYYY-MM-DD 同士の日数差（b − a）。形式が不正なら null。 */
function dayDiff(a: string, b: string): number | null {
  const aTime = Date.parse(`${a}T00:00:00Z`);
  const bTime = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(aTime) || Number.isNaN(bTime)) return null;
  return Math.round((bTime - aTime) / 86_400_000);
}

/**
 * 入金取引1件を請求書への消込候補として採点する。
 * 金額の完全一致を最重視し、取引先名の近似と期日の近接を加える。
 * 候補として提示する最低スコアは suggestReconciliations 側で決める。
 */
export function scoreReconciliationCandidate(
  invoice: ReconciliationInvoice,
  transaction: ReconciliationTransaction,
): ReconciliationCandidate | null {
  const unappliedAmount = transaction.amount - transaction.appliedAmount;
  if (unappliedAmount <= 0 || invoice.remainingAmount <= 0) return null;
  const reasons: ReconciliationReason[] = [];
  let score = 0;
  if (unappliedAmount === invoice.remainingAmount) {
    score += 100;
    reasons.push(ReconciliationReason.AmountExact);
  } else if (unappliedAmount < invoice.remainingAmount) {
    score += 40;
    reasons.push(ReconciliationReason.AmountPartial);
  }
  if (nameMatches(invoice.counterpartyName, transaction.description)) {
    score += 50;
    reasons.push(ReconciliationReason.NameMatch);
  }
  const sinceIssue = dayDiff(invoice.issueDate, transaction.date);
  if (sinceIssue !== null && sinceIssue >= 0 && sinceIssue <= 62) {
    score += 10;
    reasons.push(ReconciliationReason.DateClose);
  }
  return {
    transactionId: transaction.id,
    unappliedAmount,
    suggestedAmount: Math.min(unappliedAmount, invoice.remainingAmount),
    score,
    reasons,
  };
}

/** 候補として提示する最低スコア（部分一致の金額だけでも提示する）。 */
export const RECONCILIATION_CANDIDATE_MIN_SCORE = 40;

/**
 * 入金取引の集合から消込候補を推測し、スコア順に返す。
 * あくまで候補提示であり、消込はユーザーの承認で初めて確定する。
 */
export function suggestReconciliations(
  invoice: ReconciliationInvoice,
  transactions: readonly ReconciliationTransaction[],
): ReconciliationCandidate[] {
  const candidates: ReconciliationCandidate[] = [];
  for (const transaction of transactions) {
    const candidate = scoreReconciliationCandidate(invoice, transaction);
    if (candidate && candidate.score >= RECONCILIATION_CANDIDATE_MIN_SCORE) {
      candidates.push(candidate);
    }
  }
  return candidates.sort((a, b) => b.score - a.score || a.transactionId - b.transactionId);
}
