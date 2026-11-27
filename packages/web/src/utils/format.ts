/**
 * 金額を「1,234円」表記にする。数値は number のまま持ち回り、
 * 文字列化は表示直前（JSX の中）でのみ行う。
 */
export const formatYen = (value: number): string =>
  `${Math.trunc(value).toLocaleString("ja-JP")}円`;

/** 件数・金額を桁区切り文字列にする。表示直前（JSX の中）でのみ使う。 */
export const formatNumber = (value: number): string =>
  Math.trunc(value).toLocaleString("ja-JP");

/**
 * ISO 日時や日付文字列を YYYY/MM/DD にする。サーバーは UTC で返すので、
 * 文字列を切り出さずに端末の現地時刻へ直してから日付を取る。
 */
export const formatDate = (value: string | null | undefined): string => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}/${m}/${d}`;
};

/** ISO 日時を画面表示用に整える。解釈できない場合はそのまま返す。 */
export const formatDateTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
};

/** API キーのマスク表示。接頭辞だけを見せ、残りは伏せる。 */
export const maskApiKey = (keyPrefix: string): string => `${keyPrefix}…`;

/** 最終利用日時の表示。未使用ならその旨を返す。 */
export const formatApiKeyLastUsed = (iso: string | null): string =>
  iso ? formatDateTime(iso) : "まだ使われていません";
