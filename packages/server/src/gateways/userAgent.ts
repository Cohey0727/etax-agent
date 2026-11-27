/**
 * userAgent.ts — 外部 API へ送る User-Agent（gateways）。
 *
 * ランタイム既定の User-Agent は、接続先の前段にいる Cloudflare に
 * ボット判定で弾かれる（error 1010）ことがあるため、すべての外部呼び出しで
 * この値を明示する。
 */
export const USER_AGENT = "etax-agent/0.1";
