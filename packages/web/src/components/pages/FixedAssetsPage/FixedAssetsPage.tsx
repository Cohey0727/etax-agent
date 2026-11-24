import { FixedAssetPanel } from "@components/organisms/fixedAssets";
import { ViewPageProps } from "@types";

/** 固定資産台帳。集計の対象年度は左上の年度切替（AppPage が保持）に従う。 */
export const FixedAssetsPage = ({ year }: ViewPageProps) => {
  return <FixedAssetPanel year={year} />;
};
