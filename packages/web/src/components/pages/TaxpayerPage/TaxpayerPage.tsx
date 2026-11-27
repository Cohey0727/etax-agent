import { Card, Col, Text } from "@components/atoms";
import { RetryNotice } from "@components/molecules/RetryNotice";
import {
  BusinessStartPanel,
  DEDUCTION_STATE_LOAD_FAILED,
  FilingTypeFields,
  TaxpayerProfilePanel,
  useDeductionState,
} from "@components/organisms/filing";
import { ViewPageProps } from "@types";

export const TaxpayerPage = ({ year }: ViewPageProps) => {
  return <TaxpayerWorkspace key={year} year={year} />;
};

/**
 * 納税者情報の独立画面。申告書の見出し情報（納税者プロフィール）と
 * 申告の種類・不動産貸付けの規模を、確定申告画面から切り離してここで管理する。
 * どちらも年度別の保存値で、サイドバーの年度切替で過去年度分（履歴）が
 * そのまま見られる・直せる。申告の種類の保存先は確定申告画面と共有する。
 */
const TaxpayerWorkspace = ({ year }: { year: number }) => {
  const deduction = useDeductionState(year);

  return (
    <Col gap="md">
      <Text variant="muted">
        {year}年度の納税者情報と申告の種類です。年度を切り替えると、過去年度分（履歴）も同じように見られます。
      </Text>
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">申告の種類</Text>
          {deduction.loadFailed ? (
            <RetryNotice message={DEDUCTION_STATE_LOAD_FAILED} onRetry={deduction.retry} />
          ) : null}
          <FilingTypeFields
            filingType={deduction.state.filingType}
            realEstateBusinessScale={deduction.state.realEstateBusinessScale}
            onChange={(filingType, realEstateBusinessScale) =>
              deduction.update({ filingType, realEstateBusinessScale })
            }
          />
        </Col>
      </Card>
      <TaxpayerProfilePanel year={year} />
      <BusinessStartPanel year={year} />
    </Col>
  );
};
