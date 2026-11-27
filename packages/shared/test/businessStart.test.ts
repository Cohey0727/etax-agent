/**
 * businessStart.test.ts — 開業に伴う届出の期限計算の検証。
 * 期待日は国税庁の手続案内（A1-5 / A1-8）と実例で裏取りしたもの。
 */
import { describe, expect, test } from "bun:test";
import {
  businessStartDeadlines,
  incomeTaxFilingDeadline,
  isBusinessDay,
  japaneseHolidays,
} from "../src/businessStart";

describe("国民の祝日", () => {
  test("固定日とハッピーマンデーが入る", () => {
    const holidays = japaneseHolidays(2026);
    expect(holidays.has("2026-01-01")).toBe(true); // 元日
    expect(holidays.has("2026-01-12")).toBe(true); // 成人の日（第2月曜）
    expect(holidays.has("2026-09-21")).toBe(true); // 敬老の日（第3月曜）
    expect(holidays.has("2026-03-20")).toBe(true); // 春分の日
    expect(holidays.has("2026-09-23")).toBe(true); // 秋分の日
  });

  test("振替休日: 祝日が日曜なら翌日以降の平日が休みになる", () => {
    const holidays = japaneseHolidays(2026);
    // 2026年の憲法記念日は5月3日（日曜）。5月4日・5日も祝日のため振替は5月6日。
    expect(holidays.has("2026-05-06")).toBe(true);
  });

  test("国民の休日: 祝日に挟まれた平日が休みになる", () => {
    const holidays = japaneseHolidays(2026);
    // 敬老の日（9月21日）と秋分の日（9月23日）に挟まれた9月22日。
    expect(holidays.has("2026-09-22")).toBe(true);
  });
});

describe("確定申告期限", () => {
  test("3月15日が平日ならそのまま、日曜なら翌平日", () => {
    expect(incomeTaxFilingDeadline(2026)).toBe("2027-03-15"); // 月曜
    expect(incomeTaxFilingDeadline(2025)).toBe("2026-03-16"); // 3月15日が日曜
  });
});

describe("開業からの期限計算", () => {
  test("開業届は開業した年分の確定申告期限まで", () => {
    const deadlines = businessStartDeadlines("2026-06-01");
    expect(deadlines?.openingNotice.date).toBe("2027-03-15");
  });

  test("青色申告承認申請: 1月15日までの開業はその年の3月15日（平日シフト）", () => {
    const deadlines = businessStartDeadlines("2026-01-10");
    // 2026年3月15日は日曜のため翌平日の3月16日。
    expect(deadlines?.blueReturnApplication.date).toBe("2026-03-16");
  });

  test("青色申告承認申請: 1月16日以後の開業は開始日から2か月以内", () => {
    expect(businessStartDeadlines("2026-01-16")?.blueReturnApplication.date).toBe(
      "2026-03-16",
    );
    expect(businessStartDeadlines("2026-02-10")?.blueReturnApplication.date).toBe(
      "2026-04-10",
    );
  });

  test("青色申告承認申請: 満了日が土曜なら翌平日へシフトする", () => {
    // 2027年2月10日開業 → 満了は4月10日（土曜）→ 4月12日（月曜）。
    expect(businessStartDeadlines("2027-02-10")?.blueReturnApplication.date).toBe(
      "2027-04-12",
    );
  });

  test("青色申告承認申請: 応当日のない月は月末が満了になる", () => {
    // 3月31日開業 → 起算日4月1日、応当日6月1日の前日 = 5月31日（日曜）→ 6月1日。
    expect(businessStartDeadlines("2026-03-31")?.blueReturnApplication.date).toBe(
      "2026-06-01",
    );
  });

  test("給与支払事務所等の開設届は開設から1か月以内", () => {
    expect(businessStartDeadlines("2026-02-10")?.salaryOffice.date).toBe("2026-03-10");
    // 1月31日開業 → 応当日がないため2月末日（2026年は2月28日・土曜）→ 3月2日（月曜）。
    expect(businessStartDeadlines("2026-01-31")?.salaryOffice.date).toBe("2026-03-02");
  });

  test("不正な日付は null", () => {
    expect(businessStartDeadlines("")).toBeNull();
    expect(businessStartDeadlines("2026-13-01")).toBeNull();
    expect(businessStartDeadlines("2026-02-30")).toBeNull();
  });
});

describe("年末年始（12月29日〜1月3日）の期限", () => {
  test("12月29〜31日・1月2〜3日は期限にならず、次の平日に延びる（国税通則法10条2項）", () => {
    for (const day of ["2026-12-29", "2026-12-30", "2026-12-31", "2027-01-02", "2027-01-03"]) {
      expect(isBusinessDay(day)).toBe(false);
    }
    expect(isBusinessDay("2027-01-04")).toBe(true);
  });

  test("期限が年末年始に当たる届出は翌年1月4日（平日）まで", () => {
    expect(businessStartDeadlines("2026-11-29")?.salaryOffice.date).toBe("2027-01-04");
    expect(businessStartDeadlines("2026-10-30")?.blueReturnApplication.date).toBe("2027-01-04");
  });
});
