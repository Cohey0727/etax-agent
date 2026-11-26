import { StyleSheet, View } from "react-native";
import { FixedAssetImageRecord, FixedAssetRecord } from "@/api";
import { AppButton, AppText, Chip, LabeledValue } from "@/components";
import { colors, radius, space } from "@/theme";
import { formatDate, formatNumber, formatYen } from "@/utils";
import { INCOME_TYPE_LABELS, METHOD_LABELS, fullSchedule } from "../assetOptions";
import { FixedAssetImages } from "../FixedAssetImages";

export interface FixedAssetDetailProps {
  asset: FixedAssetRecord;
  year: number;
  images: FixedAssetImageRecord[] | undefined;
  imagesBusy: boolean;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUploadImage: (uri: string, mimeType: string) => void;
  onDeleteImage: (fileId: string) => void;
}

/** 選択中資産の詳細（画像・属性・全期間の償却スケジュール）。シートの中身として使う。 */
export function FixedAssetDetail({
  asset,
  year,
  images,
  imagesBusy,
  busy,
  onEdit,
  onDelete,
  onUploadImage,
  onDeleteImage,
}: FixedAssetDetailProps) {
  const schedule = fullSchedule(asset);
  const meta: readonly { label: string; value: string }[] = [
    { label: "取得日", value: formatDate(asset.acquisition_date) },
    { label: "事業供用日", value: asset.service_start_date ? formatDate(asset.service_start_date) : "（取得日と同じ）" },
    { label: "取得価額", value: formatYen(asset.cost) },
    { label: "数量", value: asset.quantity || "—" },
    { label: "耐用年数", value: `${asset.useful_life_years}年` },
    { label: "償却方法", value: METHOD_LABELS[asset.method] },
    { label: "所得区分", value: INCOME_TYPE_LABELS[asset.income_type] ?? asset.income_type },
    { label: "事業専用割合", value: `${asset.business_ratio_percent}%` },
    { label: "除却日", value: asset.disposed_date ? formatDate(asset.disposed_date) : "—" },
  ];

  return (
    <View style={styles.wrap}>
      <FixedAssetImages
        images={images}
        busy={imagesBusy}
        onUpload={onUploadImage}
        onDelete={onDeleteImage}
      />
      <View style={styles.actions}>
        <AppButton label="編集" variant="ghost" disabled={busy} onPress={onEdit} />
        <AppButton label="削除" variant="danger" disabled={busy} onPress={onDelete} />
      </View>
      <View>
        {meta.map((item) => (
          <LabeledValue key={item.label} label={item.label} value={item.value} />
        ))}
      </View>
      <View style={styles.schedule}>
        <AppText size="lg" weight="bold">
          減価償却スケジュール
        </AppText>
        {schedule.length === 0 ? (
          <AppText size="sm" tone="muted">
            スケジュールを計算できませんでした。
          </AppText>
        ) : (
          schedule.map((row) => (
            <View
              key={row.year}
              style={[styles.rowCard, row.year === year ? styles.rowCardCurrent : null]}
            >
              <View style={styles.rowHeader}>
                <AppText weight="bold">
                  {row.year}年（{row.months}か月）
                </AppText>
                {row.year === year ? <Chip label="対象年度" tone="accent" /> : null}
              </View>
              <LabeledValue label="期首残高" value={formatYen(row.openingBookValue)} />
              <LabeledValue label="償却率" value={row.rate > 0 ? row.rate.toFixed(3) : "—"} />
              <LabeledValue label="普通償却費" value={formatYen(row.ordinary)} />
              <LabeledValue label="必要経費算入額" value={formatYen(row.deductible)} />
              <LabeledValue label="期末残高" value={formatYen(row.closingBookValue)} strong />
            </View>
          ))
        )}
        <AppText size="xs" tone="muted">
          合計 {formatNumber(schedule.reduce((sum, row) => sum + row.deductible, 0))}
          円 が必要経費に算入されます（全期間）。
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.md },
  actions: { flexDirection: "row", gap: space.sm, justifyContent: "flex-end" },
  schedule: { gap: space.sm },
  rowCard: {
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.xs,
    padding: space.sm,
  },
  rowCardCurrent: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  rowHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
