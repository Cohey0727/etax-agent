import { Transaction } from "@etax/shared";

export interface SampleRegistrationPlan {
  /** 帳簿へ追加するサンプル取引（帳簿に取引が無い年の分だけ）。 */
  register: Transaction[];
  /** 帳簿に取引があるため追加しない年（昇順）。 */
  skippedYears: number[];
}

/**
 * サンプル取引のうち、帳簿に取引が無い年の分だけを追加の対象にする。
 * 取引がある年に混ぜると実データとサンプルの区別がつかなくなるため、その年は丸ごと除く。
 */
export function planSampleRegistration(
  sample: readonly Transaction[],
  yearsWithRows: ReadonlySet<number>,
): SampleRegistrationPlan {
  const sampleYears = [...new Set(sample.map((tx) => tx.year))].sort((a, b) => a - b);
  return {
    register: sample.filter((tx) => !yearsWithRows.has(tx.year)),
    skippedYears: sampleYears.filter((year) => yearsWithRows.has(year)),
  };
}
