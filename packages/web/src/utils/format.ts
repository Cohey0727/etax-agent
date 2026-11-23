/**
 * 金額を「1,234円」表記にする。数値は number のまま持ち回り、
 * 文字列化は表示直前（JSX の中）でのみ行う。
 */
export const formatYen = (value: number): string =>
  `${Math.trunc(value).toLocaleString("ja-JP")}円`;

/** 件数・金額を桁区切り文字列にする。表示直前（JSX の中）でのみ使う。 */
export const formatNumber = (value: number): string =>
  Math.trunc(value).toLocaleString("ja-JP");
