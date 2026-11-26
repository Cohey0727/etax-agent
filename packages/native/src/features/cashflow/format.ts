/** YYYY-MM を「YYYY年M月」にする。 */
export function monthLabel(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5, 7))}月`;
}
