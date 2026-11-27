import { ClassificationSource } from "@/api";

/** 勘定科目の判定結果の出所の表示名。 */
export const classificationSourceLabels: Record<ClassificationSource, string> = {
  generated: "生成ルール",
  systemone: "AI判定",
  rules: "キーワードルール",
  none: "判定なし",
};
