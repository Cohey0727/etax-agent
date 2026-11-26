import { formatYen } from "@/utils";

/** グラフのラベル用の短い金額（万円単位）。 */
export function formatCompactYen(amount: number): string {
  if (Math.abs(amount) < 10000) return formatYen(amount);
  return `¥${Math.round(amount / 10000).toLocaleString("ja-JP")}万`;
}
