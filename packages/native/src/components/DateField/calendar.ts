/** DateField 用の日付ユーティリティ。値はすべて "YYYY-MM-DD" 形式の文字列で扱う。 */

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
/** 年チップの最初の年。生年月日や古い固定資産の取得日も選べるようにする。 */
const EARLIEST_YEAR = 1900;
/** 年チップを今年から何年先まで並べるか。 */
const YEARS_AHEAD = 15;

/** "YYYY-MM-DD" を分解する。不正な値・存在しない日は null。 */
export function parseDateValue(value: string): DateParts | null {
  const match = DATE_PATTERN.exec(value);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.month < 1 || parts.month > 12) return null;
  if (parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) return null;
  return parts;
}

export function formatDateValue({ year, month, day }: DateParts): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** その月の1日の曜日（0=日曜）。 */
export function firstWeekday(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

export function todayParts(now: Date = new Date()): DateParts {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** 表示用ラベル（例: 2026年1月5日）。 */
export function dateDisplayLabel(parts: DateParts): string {
  return `${parts.year}年${parts.month}月${parts.day}日`;
}

/** 表示中の月を delta か月ずらす。 */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 年チップに並べる年（昇順）。範囲外の値が入っていても、その年は必ず含める。 */
export function selectableYears(todayYear: number, valueYear: number | null): number[] {
  const first = Math.min(EARLIEST_YEAR, valueYear ?? EARLIEST_YEAR);
  const last = Math.max(todayYear + YEARS_AHEAD, valueYear ?? todayYear);
  const years: number[] = [];
  for (let year = first; year <= last; year += 1) years.push(year);
  return years;
}
