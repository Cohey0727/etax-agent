import { Button, Col, Row, Text } from "@components/atoms";
import { PAGE_SIZE, pageList } from "./ledgerOptions";

export interface LedgerPaginationProps {
  /** 絞り込み後の件数 */
  visibleCount: number;
  /** 表示中のページの件数 */
  displayedCount: number;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

/** 帳簿の取引テーブルのページ送り。 */
export const LedgerPagination = ({
  visibleCount,
  displayedCount,
  currentPage,
  totalPages,
  onPageChange,
}: LedgerPaginationProps) => (
  <Col gap="sm">
    <Row justify="end">
      <Text variant="muted">
        全{visibleCount}件中 {(currentPage - 1) * PAGE_SIZE + 1}–
        {(currentPage - 1) * PAGE_SIZE + displayedCount}件目
      </Text>
    </Row>
    <Row gap="sm" align="center" justify="center">
      <Button
        variant="ghost"
        size="sm"
        disabled={currentPage <= 1}
        disabledReason="最初のページです"
        onClick={() => onPageChange(currentPage - 1)}
      >
        前へ
      </Button>
      {pageList(currentPage, totalPages).map((item, index) =>
        item === "gap" ? (
          <Text key={`gap-${index}`} variant="muted">
            …
          </Text>
        ) : (
          <Button
            key={item}
            variant={item === currentPage ? "primary" : "ghost"}
            size="sm"
            onClick={() => onPageChange(item)}
          >
            {item}
          </Button>
        ),
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={currentPage >= totalPages}
        disabledReason="最後のページです"
        onClick={() => onPageChange(currentPage + 1)}
      >
        次へ
      </Button>
    </Row>
  </Col>
);
