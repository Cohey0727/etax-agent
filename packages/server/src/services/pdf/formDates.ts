/**
 * formDates.ts — 様式 PDF へ重ねる日付・番号の整形ヘルパー（services/pdf）。
 *
 * 異動申出書・開業届・青色申告承認申請書で共通に使う、ISO 日付の分解、
 * 元号変換、郵便番号・電話番号の分割をここに集める。
 */
import { toEraDate } from "@etax/shared";

/** ISO 日付文字列を年月日に分解する（不正なら null）。 */
export function parseIsoDate(
  iso: string,
): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
}

const ERA_TABLE: readonly { from: number; name: string }[] = [
  { from: 2019, name: "令和" },
  { from: 1989, name: "平成" },
  { from: 1926, name: "昭和" },
  { from: 1912, name: "大正" },
];

/**
 * 西暦年を元号名＋元号年に変換する。「令和元年分」のような年分の表記用で、
 * 改元の年はその年の新しい元号で表す。日付の変換には eraDateOf を使う。
 */
export function eraOf(year: number): { eraName: string; eraYear: number } {
  for (const era of ERA_TABLE) {
    if (year >= era.from) return { eraName: era.name, eraYear: year - era.from + 1 };
  }
  return { eraName: "明治", eraYear: year - 1867 };
}

/** toEraDate の元号番号（1=明治〜5=令和）→ 元号名。 */
const ERA_NAMES: Record<number, string> = {
  1: "明治",
  2: "大正",
  3: "昭和",
  4: "平成",
  5: "令和",
};

/**
 * ISO 日付を元号表記（元号名・元号年・月・日）にする。元号は改元日で分ける
 * （1989-01-07 は昭和64年、2019-04-30 は平成31年）。日付が読めなければ null。
 */
export function eraDateOf(
  iso: string,
): { eraName: string; eraYear: number; month: number; day: number } | null {
  const era = toEraDate(iso);
  const eraName = era ? ERA_NAMES[era.era] : undefined;
  if (!era || !eraName) return null;
  return { eraName, eraYear: era.yy, month: era.mm, day: era.dd };
}

/** 郵便番号を ― の前（3桁）と後（4桁）に分ける。7桁でなければ全体を前に返す。 */
export function splitZip(zipCode: string): { first: string; second: string } {
  const digits = zipCode.replace(/\D/g, "");
  if (digits.length === 7) return { first: digits.slice(0, 3), second: digits.slice(3) };
  return { first: zipCode, second: "" };
}

/** 電話番号をハイフン区切りの3部分に分ける。区切れなければ全体を1要素で返す。 */
export function splitPhone(phone: string): readonly string[] {
  const parts = phone.split("-");
  return parts.length === 3 ? parts : [phone];
}
