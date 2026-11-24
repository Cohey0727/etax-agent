import { FilingType } from "@etax/shared";
import { useEffect, useState } from "react";
import { Card, Col, Text } from "@components/atoms";
import {
  DeductionState,
  hydrateDeductionStateFromServer,
  loadDeductionState,
  saveDeductionState,
} from "@components/organisms/filing/DeductionPanel/deductionStorage";
import { FilingTypeFields } from "@components/organisms/filing/FilingTypeFields";
import { TaxpayerProfilePanel } from "@components/organisms/filing/TaxpayerProfilePanel";
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
  const [deductionState, setDeductionState] = useState<DeductionState>(() =>
    loadDeductionState(year),
  );
  // 申告入力の正はサーバーDB（確定申告画面と共有）。表示時にサーバー値を
  // 取り込んでから再読込する。取り込みが終わるまでは保存しない
  // （端末に値が無い状態で編集すると空状態がサーバーへ全体置換され、
  // 保存済みの控除等が消えてしまうため。Issue #10-4）。
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void hydrateDeductionStateFromServer(year).then(() => {
      if (cancelled) return;
      setDeductionState(loadDeductionState(year));
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const updateFilingSettings = (filingType: FilingType, realEstateBusinessScale: boolean) => {
    const state = { ...deductionState, filingType, realEstateBusinessScale };
    setDeductionState(state);
    if (hydrated) saveDeductionState(year, state);
  };

  return (
    <Col gap="md">
      <Text variant="muted">
        {year}年度の納税者情報と申告の種類です。年度を切り替えると、過去年度分（履歴）も同じように見られます。
      </Text>
      <Card>
        <Col gap="sm">
          <Text variant="sectionTitle">申告の種類</Text>
          <FilingTypeFields
            filingType={deductionState.filingType}
            realEstateBusinessScale={deductionState.realEstateBusinessScale}
            onChange={updateFilingSettings}
          />
        </Col>
      </Card>
      <TaxpayerProfilePanel year={year} />
    </Col>
  );
};
