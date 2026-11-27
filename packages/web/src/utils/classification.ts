import { ACCOUNT_NAMES } from "@etax/shared";
import { ClassificationSource } from "@types";

/** 勘定科目の選択肢（科目一覧＋未分類）。 */
export const accountChoices: readonly string[] = [...ACCOUNT_NAMES, "未分類"];

/** 科目判定の根拠の表示名。 */
export const classificationSourceLabels = {
  generated: "生成ルール",
  systemone: "AI判定",
  rules: "キーワードルール",
  none: "判定なし",
} as const satisfies Record<ClassificationSource, string>;
