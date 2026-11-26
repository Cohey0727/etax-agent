import { FilingType } from "@etax/shared";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText, Card } from "@/components";
import { useAuth } from "@/auth/AuthContext";
import { useAppState } from "@/state/AppContext";
import { space } from "@/theme";
import {
  DeductionState,
  freshDeductionState,
  hydrateDeductionStateFromServer,
  loadDeductionState,
  saveDeductionState,
} from "../deductionState";
import { BusinessStartPanel } from "../BusinessStartPanel";
import { FilingTypeFields } from "../FilingTypeFields";
import { SectionHead } from "../fields";
import { TaxpayerProfilePanel } from "../TaxpayerProfilePanel";

/**
 * 納税者情報の独立画面。申告書の見出し情報（納税者プロフィール）と
 * 申告の種類・不動産貸付けの規模を、確定申告画面から切り離してここで管理する。
 * どちらも年度別の保存値で、年度切替で過去年度分（履歴）がそのまま
 * 見られる・直せる。申告の種類の保存先は確定申告画面と共有する。
 * 申告入力の正はサーバーDB。取り込みが終わるまでは保存しない
 * （空状態がサーバーへ全体置換され、保存済みの控除等が消えてしまうため）。
 */
export function TaxpayerWorkspace() {
  const { user } = useAuth();
  const { year } = useAppState();
  const userId = user?.id ?? null;
  const [deductionState, setDeductionState] = useState<DeductionState>(() => freshDeductionState());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHydrated(false);
    void loadDeductionState(userId, year).then((local) => {
      if (!cancelled) setDeductionState(local);
    });
    void hydrateDeductionStateFromServer(userId, year).then((remote) => {
      if (cancelled) return;
      setDeductionState(remote);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, year]);

  const updateFilingSettings = (filingType: FilingType, realEstateBusinessScale: boolean) => {
    const state = { ...deductionState, filingType, realEstateBusinessScale };
    setDeductionState(state);
    if (hydrated) saveDeductionState(userId, year, state);
  };

  return (
    <View style={styles.wrap}>
      <AppText size="sm" tone="muted">
        {year}年度の納税者情報と申告の種類です。年度を切り替えると、過去年度分（履歴）も同じように見られます。
      </AppText>
      <Card>
        <View style={styles.cardBody}>
          <SectionHead title="申告の種類" />
          <FilingTypeFields
            filingType={deductionState.filingType}
            realEstateBusinessScale={deductionState.realEstateBusinessScale}
            onChange={updateFilingSettings}
          />
        </View>
      </Card>
      <TaxpayerProfilePanel year={year} />
      <BusinessStartPanel year={year} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  cardBody: { gap: space.sm },
});
