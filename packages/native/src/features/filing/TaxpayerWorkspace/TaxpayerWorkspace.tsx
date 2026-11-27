import { FilingType } from "@etax/shared";
import { StyleSheet, View } from "react-native";
import { AppText, Card, SkeletonBar } from "@/components";
import { useAppState } from "@/state/AppContext";
import { space } from "@/theme";
import { BusinessStartPanel } from "../BusinessStartPanel";
import { filingInputsStore } from "../deductionState";
import { FilingTypeFields } from "../FilingTypeFields";
import { LoadFailedNotice, SectionHead } from "../fields";
import { TaxpayerProfilePanel } from "../TaxpayerProfilePanel";
import { useYearInput } from "../useYearInput";

/**
 * 納税者情報の独立画面。申告書の見出し情報（納税者プロフィール）と
 * 申告の種類・不動産貸付けの規模を、確定申告画面から切り離してここで管理する。
 * どちらも年度別の保存値で、年度切替で過去年度分（履歴）がそのまま
 * 見られる・直せる。申告の種類は確定申告画面と同じ申告入力のストアを読み書きする。
 */
export function TaxpayerWorkspace() {
  const { year } = useAppState();
  const { entry, update, reload } = useYearInput(filingInputsStore, year);

  const updateFilingSettings = (filingType: FilingType, realEstateBusinessScale: boolean) =>
    update((s) => ({ ...s, filingType, realEstateBusinessScale }));

  return (
    <View style={styles.wrap}>
      <AppText size="sm" tone="muted">
        {year}年度の納税者情報と申告の種類です。年度を切り替えると、過去年度分（履歴）も同じように見られます。
      </AppText>
      <Card>
        <View style={styles.cardBody}>
          <SectionHead title="申告の種類" />
          {entry.status === "ready" ? (
            <FilingTypeFields
              filingType={entry.value.filingType}
              realEstateBusinessScale={entry.value.realEstateBusinessScale}
              onChange={updateFilingSettings}
            />
          ) : entry.status === "failed" ? (
            <LoadFailedNotice message="申告の種類を取得できませんでした。" onRetry={reload} />
          ) : (
            <SkeletonBar height={44} />
          )}
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
