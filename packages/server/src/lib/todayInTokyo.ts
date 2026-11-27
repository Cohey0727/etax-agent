/**
 * todayInTokyo.ts — 日本時間の今日の日付（lib）。
 *
 * 申告・請求・資金繰りの基準日は日本時間で決める。サーバーやコンテナの
 * タイムゾーン設定に依らないよう、タイムゾーンを明示して日付を取り出す。
 */

/** 日本時間の日付（YYYY-MM-DD）。now を省略すると現在時刻。 */
export function todayInTokyo(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
