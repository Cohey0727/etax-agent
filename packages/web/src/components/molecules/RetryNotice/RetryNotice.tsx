import { Button, Row, Text } from "@components/atoms";
import { AlertBox } from "../AlertBox";

export interface RetryNoticeProps {
  /** 何が失敗したか、その間どうなるか。 */
  message: string;
  onRetry: () => void;
}

/** 読み込みに失敗したことを知らせ、もう一度読み込むボタンを添える。 */
export const RetryNotice = ({ message, onRetry }: RetryNoticeProps) => (
  <AlertBox variant="notice">
    <Row gap="sm" align="center" justify="spaceBetween" wrap>
      <Text>{message}</Text>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        再読み込み
      </Button>
    </Row>
  </AlertBox>
);
