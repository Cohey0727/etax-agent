/**
 * agentChatHelpers.ts — チャットのツール表示に添える引数の要約。
 */

/** チップに出す引数の要約（主要なものだけ短く）。 */
export const summarizeToolArgs = (args: Record<string, unknown>): string => {
  const parts: string[] = [];
  const text = (v: unknown, max = 18): string => {
    const s = String(v);
    return s.length > max ? `${s.slice(0, max)}…` : s;
  };
  if (typeof args.year === "number") parts.push(`${args.year}年`);
  if (typeof args.keyword === "string" && args.keyword) parts.push(text(args.keyword));
  if (typeof args.description === "string" && args.description) parts.push(text(args.description));
  if (typeof args.query === "string" && args.query) parts.push(text(args.query));
  if (typeof args.mode === "string") parts.push(args.mode);
  if (typeof args.method === "string") parts.push(args.method);
  if (typeof args.set_category === "string") parts.push(`→ ${args.set_category}`);
  if (typeof args.category === "string" && !args.set_category) parts.push(args.category);
  if (Array.isArray(args.rules)) parts.push(`${args.rules.length}件のルール`);
  if (typeof args.prompt === "string") {
    parts.push(args.prompt === "" ? "自動生成に戻す" : `${args.prompt.length}文字`);
  }
  return parts.join("・");
};
