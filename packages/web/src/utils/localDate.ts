/** 今日の日付（端末の現地時刻）を YYYY-MM-DD で返す。日付入力欄の初期値に使う。 */
export function todayIso(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}
