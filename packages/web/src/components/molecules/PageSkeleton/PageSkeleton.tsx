import { Card, Col, Row, SkeletonBar } from "@components/atoms";

/** カード内の行バー（見出し＋本文の組）の並び。 */
const CARD_ROWS: readonly { titleWidth: string; bodyWidths: readonly string[] }[] = [
  { titleWidth: "180px", bodyWidths: ["62%", "48%"] },
  { titleWidth: "140px", bodyWidths: ["80%", "70%"] },
];

/**
 * 画面のデータ読み込みが終わるまで、実データの代わりに出す画面全体のスケルトン。
 * 実レイアウト（見出しつきカードの縦並び）と近い形にして、出現時のずれを抑える。
 */
export const PageSkeleton = () => {
  return (
    <Col gap="md">
      {CARD_ROWS.map((card) => (
        <Card key={card.titleWidth}>
          <Col gap="sm">
            <SkeletonBar width={card.titleWidth} height={18} />
            <Row gap="sm">
              <SkeletonBar height={36} />
              <SkeletonBar height={36} />
              <SkeletonBar height={36} />
            </Row>
            {card.bodyWidths.map((width) => (
              <SkeletonBar key={width} width={width} />
            ))}
          </Col>
        </Card>
      ))}
    </Col>
  );
};
