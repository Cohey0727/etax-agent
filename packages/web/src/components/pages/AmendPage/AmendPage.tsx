import { AmendDiffPanel } from "@components/organisms/amend";
import { ViewPageProps } from "@types";

export const AmendPage = ({ transactions, year }: ViewPageProps) => {
  // 年度が変わったらフォームを作り直す（申告済みの初期値は年度ごとに読み込む）。
  return <AmendDiffPanel key={year} transactions={transactions} year={year} />;
};
