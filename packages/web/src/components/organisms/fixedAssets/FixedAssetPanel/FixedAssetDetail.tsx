import {
  Button,
  Col,
  Row,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { FixedAssetImageRecord, FixedAssetRecord } from "@types";
import { formatNumber, formatYen } from "@utils/format";
import { FixedAssetImages } from "./FixedAssetImages";
import styles from "./FixedAssetPanel.css";
import { INCOME_TYPE_LABELS, METHOD_LABELS, fullSchedule } from "./fixedAssetOptions";

export interface FixedAssetDetailProps {
  asset: FixedAssetRecord;
  year: number;
  images: FixedAssetImageRecord[] | undefined;
  imagesBusy: boolean;
  busy: boolean;
  deleteArmed: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onUploadImages: (files: File[]) => void;
  onDeleteImage: (fileId: string) => void;
}

/** 選択中資産の詳細（属性・全期間の償却スケジュール・画像）。右 Drawer の中身として使う。 */
export const FixedAssetDetail = ({
  asset,
  year,
  images,
  imagesBusy,
  busy,
  deleteArmed,
  onEdit,
  onDelete,
  onUploadImages,
  onDeleteImage,
}: FixedAssetDetailProps) => {
  const schedule = fullSchedule(asset);
  const meta: readonly { label: string; value: string }[] = [
    { label: "取得日", value: asset.acquisition_date },
    { label: "事業供用日", value: asset.service_start_date ?? "（取得日と同じ）" },
    { label: "取得価額", value: formatYen(asset.cost) },
    { label: "数量", value: asset.quantity || "—" },
    { label: "耐用年数", value: `${asset.useful_life_years}年` },
    { label: "償却方法", value: METHOD_LABELS[asset.method] },
    { label: "所得区分", value: INCOME_TYPE_LABELS[asset.income_type] ?? asset.income_type },
    { label: "事業専用割合", value: `${asset.business_ratio_percent}%` },
    { label: "除却日", value: asset.disposed_date ?? "—" },
  ];

  return (
    <Col gap="lg">
      <Row justify="end" gap="sm">
        <Button variant="ghost" onClick={onEdit} disabled={busy}>
          編集
        </Button>
        <Button variant="danger" onClick={onDelete} disabled={busy}>
          {deleteArmed ? "本当に削除しますか" : "削除"}
        </Button>
      </Row>

      <div className={styles.formGrid}>
        {meta.map((item) => (
          <Col key={item.label} gap="none">
            <Text variant="caption">{item.label}</Text>
            <Text variant="body">{item.value}</Text>
          </Col>
        ))}
      </div>

      <Col gap="sm">
        <Text variant="sectionTitle">減価償却スケジュール</Text>
        {schedule.length === 0 ? (
          <Text variant="muted">スケジュールを計算できませんでした。</Text>
        ) : (
          <div className={styles.tableWrap}>
            <Table>
              <thead>
                <tr>
                  <TableHeaderCell>年度</TableHeaderCell>
                  <TableHeaderCell>月数</TableHeaderCell>
                  <TableHeaderCell>期首残高</TableHeaderCell>
                  <TableHeaderCell>償却率</TableHeaderCell>
                  <TableHeaderCell>普通償却費</TableHeaderCell>
                  <TableHeaderCell>必要経費算入額</TableHeaderCell>
                  <TableHeaderCell>期末残高</TableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {schedule.map((row) => (
                  <tr key={row.year} className={row.year === year ? styles.scheduleRowCurrent : undefined}>
                    <TableCell>{row.year}年</TableCell>
                    <TableCell>{row.months}か月</TableCell>
                    <TableCell>{formatYen(row.openingBookValue)}</TableCell>
                    <TableCell>{row.rate > 0 ? row.rate.toFixed(3) : "—"}</TableCell>
                    <TableCell>{formatYen(row.ordinary)}</TableCell>
                    <TableCell>{formatYen(row.deductible)}</TableCell>
                    <TableCell>{formatYen(row.closingBookValue)}</TableCell>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
        <Text variant="caption">
          合計 {formatNumber(schedule.reduce((sum, row) => sum + row.deductible, 0))}円
          が必要経費に算入されます（全期間）。
        </Text>
      </Col>

      <FixedAssetImages
        images={images}
        busy={imagesBusy}
        onUpload={onUploadImages}
        onDelete={onDeleteImage}
      />
    </Col>
  );
};
