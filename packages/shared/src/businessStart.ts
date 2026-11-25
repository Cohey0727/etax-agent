/**
 * businessStart.ts — 開業に伴う届出の提出期限の計算（@etax/shared）。
 *
 * 開業日（事業開始等の日）から、3つの届出の期限を決定的に計算する。
 * - 個人事業の開業・廃業等届出書（開業届）: 開業した年分の所得税の
 *   確定申告期限まで（所得税法第229条。旧「1か月以内」は2025年末までの
 *   開業分への経過措置で、現行の一般ルールではない）。
 * - 所得税の青色申告承認申請書: 青色申告をしようとする年の3月15日まで。
 *   ただしその年の1月16日以後新たに事業を開始した場合は、事業開始等の
 *   日から2か月以内（所得税法第144条・国税庁手続案内 A1-8）。
 * - 給与支払事務所等の開設届出書: 給与支払事務所等を開設した日から
 *   1か月以内（所得税法第230条）。
 * 「◯か月以内」の期間計算は国税通則法第10条第1項が準用する民法の原則
 * （初日不算入・応当日の前日満了、応当日が無い月はその月の末日）に従う。
 * 期限が土曜日・日曜日・祝日等に当たる場合は、その翌日（次の平日）が
 * 期限になる（国税通則法第10条第2項）。
 */

/** ISO 日付文字列（YYYY-MM-DD）を UTC の Date にする。不正なら null。 */
function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (
    date.getUTCFullYear() !== Number(m[1]) ||
    date.getUTCMonth() !== Number(m[2]) - 1 ||
    date.getUTCDate() !== Number(m[3])
  ) {
    return null;
  }
  return date;
}

/** UTC の Date を ISO 日付文字列にする。 */
function toIsoDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** その月の末日（1始まりの月指定）。 */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 第n月曜日などの日付を求める（weekday: 0=日曜〜6=土曜）。 */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): Date {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month - 1, 1 + offset + (n - 1) * 7));
}

/** 春分の日（3月、1980〜2099年に有効な近似式）。 */
function vernalEquinoxDay(year: number): number {
  return (
    Math.floor(20.8431 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4)
  );
}

/** 秋分の日（9月、1980〜2099年に有効な近似式）。 */
function autumnalEquinoxDay(year: number): number {
  return (
    Math.floor(23.2488 + 0.242194 * (year - 1980)) - Math.floor((year - 1980) / 4)
  );
}

/**
 * その年の国民の祝日（振替休日・国民の休日を含む）の ISO 日付集合。
 * 祝日法の現行ルール（固定日・ハッピーマンデー・春分/秋分）から決定的に
 * 計算する。特別法による一回限りの祝日移動（五輪等）は含まない。
 */
export function japaneseHolidays(year: number): ReadonlySet<string> {
  const holidays = new Set<string>();
  const add = (month: number, day: number) => {
    holidays.add(toIsoDate(new Date(Date.UTC(year, month - 1, day))));
  };
  // 固定日
  add(1, 1); // 元日
  add(2, 11); // 建国記念の日
  add(2, 23); // 天皇誕生日
  add(4, 29); // 昭和の日
  add(5, 3); // 憲法記念日
  add(5, 4); // みどりの日
  add(5, 5); // こどもの日
  add(8, 11); // 山の日
  add(11, 3); // 文化の日
  add(11, 23); // 勤労感謝の日
  // ハッピーマンデー
  const monday = 1;
  for (const [month, n] of [
    [1, 2], // 成人の日
    [7, 3], // 海の日
    [9, 3], // 敬老の日
    [10, 2], // スポーツの日
  ] as const) {
    holidays.add(toIsoDate(nthWeekdayOfMonth(year, month, monday, n)));
  }
  // 春分・秋分
  add(3, vernalEquinoxDay(year));
  add(9, autumnalEquinoxDay(year));
  // 振替休日: 祝日が日曜なら、直後の祝日でない日を休日にする。
  for (const iso of [...holidays]) {
    const date = parseIsoDate(iso);
    if (!date || date.getUTCDay() !== 0) continue;
    let substitute = addDays(date, 1);
    while (holidays.has(toIsoDate(substitute))) substitute = addDays(substitute, 1);
    holidays.add(toIsoDate(substitute));
  }
  // 国民の休日: 祝日と祝日に挟まれた平日（日曜・既存の休日を除く）を休日にする。
  for (const iso of [...holidays]) {
    const date = parseIsoDate(iso);
    if (!date) continue;
    const between = addDays(date, 1);
    const after = addDays(date, 2);
    if (
      holidays.has(toIsoDate(after)) &&
      !holidays.has(toIsoDate(between)) &&
      between.getUTCDay() !== 0
    ) {
      holidays.add(toIsoDate(between));
    }
  }
  return holidays;
}

/** 土日・祝日でない日か。 */
export function isBusinessDay(iso: string): boolean {
  const date = parseIsoDate(iso);
  if (!date) return false;
  const day = date.getUTCDay();
  if (day === 0 || day === 6) return false;
  return !japaneseHolidays(date.getUTCFullYear()).has(iso);
}

/**
 * 期限日のシフト（国税通則法第10条第2項）: 土日・祝日に当たる場合は
 * 次の平日まで後ろ倒しする。
 */
export function shiftDeadlineToBusinessDay(iso: string): string {
  let current = iso;
  while (!isBusinessDay(current)) {
    const date = parseIsoDate(current);
    if (!date) return iso;
    current = toIsoDate(addDays(date, 1));
  }
  return current;
}

/**
 * 「◯か月以内」の満了日。初日不算入で、起算日の翌日から数え、
 * 応当日の前日に満了する。応当日が存在しない月はその月の末日に満了する
 * （民法第140条・第141条、国税通則法第10条第1項で準用）。
 */
function monthsWithinDeadline(start: Date, months: number): Date {
  const firstDay = addDays(start, 1); // 初日不算入: 翌日が起算日
  const targetYear = firstDay.getUTCFullYear();
  const targetMonthIndex = firstDay.getUTCMonth() + months; // 0始まり + 月数
  const year = targetYear + Math.floor(targetMonthIndex / 12);
  const month = (targetMonthIndex % 12) + 1;
  const day = firstDay.getUTCDate();
  // 応当日（同日）があればその前日、無ければ対象月の末日。
  const corresponding =
    day <= lastDayOfMonth(year, month)
      ? new Date(Date.UTC(year, month - 1, day))
      : new Date(Date.UTC(year, month - 1, lastDayOfMonth(year, month)));
  return day <= lastDayOfMonth(year, month) ? addDays(corresponding, -1) : corresponding;
}

/** 所得税の確定申告期限（対象年の翌年3月15日を平日へシフトした日）。 */
export function incomeTaxFilingDeadline(year: number): string {
  return shiftDeadlineToBusinessDay(toIsoDate(new Date(Date.UTC(year + 1, 2, 15))));
}

/** 1件分の期限（日付と、根拠の説明）。 */
export interface BusinessStartDeadline {
  /** 期限日（YYYY-MM-DD、平日シフト済み）。 */
  date: string;
  /** 期限の決まり方の説明（画面表示用）。 */
  rule: string;
}

/** 開業日から計算した、開業に伴う届出の期限一式。 */
export interface BusinessStartDeadlines {
  /** 開業日（YYYY-MM-DD）。 */
  startDate: string;
  /** 個人事業の開業・廃業等届出書（所得税法第229条）。 */
  openingNotice: BusinessStartDeadline;
  /** 所得税の青色申告承認申請書（所得税法第144条）。 */
  blueReturnApplication: BusinessStartDeadline;
  /** 給与支払事務所等の開設届出書（所得税法第230条）。 */
  salaryOffice: BusinessStartDeadline;
}

/**
 * 開業日から各届出の期限を計算する。開業日が読めなければ null。
 */
export function businessStartDeadlines(startDateIso: string): BusinessStartDeadlines | null {
  const start = parseIsoDate(startDateIso);
  if (!start) return null;
  const startYear = start.getUTCFullYear();

  const openingNoticeDate = incomeTaxFilingDeadline(startYear);

  // 青色申告承認申請: その年の1月15日までに開始した場合は、その年の
  // 3月15日（確定申告期限と同じシフト）。1月16日以後は開始日から2か月以内。
  const jan15 = new Date(Date.UTC(startYear, 0, 15));
  const blueDate =
    start.getTime() <= jan15.getTime()
      ? shiftDeadlineToBusinessDay(toIsoDate(new Date(Date.UTC(startYear, 2, 15))))
      : shiftDeadlineToBusinessDay(toIsoDate(monthsWithinDeadline(start, 2)));

  const salaryOfficeDate = shiftDeadlineToBusinessDay(
    toIsoDate(monthsWithinDeadline(start, 1)),
  );

  return {
    startDate: startDateIso,
    openingNotice: {
      date: openingNoticeDate,
      rule: "開業した年分の所得税の確定申告期限まで（所得税法第229条）",
    },
    blueReturnApplication: {
      date: blueDate,
      rule:
        start.getTime() <= jan15.getTime()
          ? "青色申告をしようとする年の3月15日まで"
          : "その年の1月16日以後に事業を開始したため、事業開始の日から2か月以内",
    },
    salaryOffice: {
      date: salaryOfficeDate,
      rule: "給与支払事務所等を開設した日から1か月以内（給与の支払がある場合）",
    },
  };
}
