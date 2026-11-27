/**
 * 選択肢に現在の値が無ければ末尾に足す。一致する option が無い select は先頭の選択肢を
 * 選んだ表示になり、保存される値と食い違ううえ、その先頭の選択肢へ選び直せない。
 */
export const withCurrentOption = (options: readonly string[], current: string): string[] =>
  options.includes(current) ? [...options] : [...options, current];
