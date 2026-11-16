import { Card, Col, Row, SkeletonBar } from "@components/atoms";

/** フィルタチップの幅。 */
const CHIP_WIDTHS: readonly string[] = ["84px", "96px", "72px", "88px", "64px"];
/** 表の行数。 */
const TABLE_ROWS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * 表が主体の画面（帳簿など）の読み込み中スケルトン。
 * フィルタチップの列＋表（見出し行＋データ行）の形を再現する。
 */
export const TableSkeleton = () => {
  return (
    <Col gap="md">
      <Row gap="sm" aria-hidden="true">
        {CHIP_WIDTHS.map((width) => (
          <SkeletonBar key={width} width={width} height={32} radius={10} />
        ))}
      </Row>
      <Card>
        <Col gap="sm" aria-hidden="true">
          <Row gap="md">
            <SkeletonBar width="10%" height={12} />
            <SkeletonBar width="34%" height={12} />
            <SkeletonBar width="14%" height={12} />
            <SkeletonBar width="12%" height={12} />
            <SkeletonBar width="16%" height={12} />
          </Row>
          {TABLE_ROWS.map((row) => (
            <Row key={row} gap="md">
              <SkeletonBar width="10%" />
              <SkeletonBar width="34%" />
              <SkeletonBar width="14%" />
              <SkeletonBar width="12%" />
              <SkeletonBar width="16%" />
            </Row>
          ))}
        </Col>
      </Card>
    </Col>
  );
};
