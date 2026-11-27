import { Card, Col, SkeletonBar } from "@components/atoms";

/** レポート（残高試算表・資金繰り）の読み込み中のスケルトン。表組みのカードに似せた形。 */
export const ReportSkeleton = () => (
  <Col gap="md">
    {[0, 1].map((card) => (
      <Card key={card}>
        <Col gap="sm">
          <SkeletonBar width="30%" height={14} />
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <SkeletonBar key={row} width="100%" height={12} />
          ))}
        </Col>
      </Card>
    ))}
  </Col>
);
