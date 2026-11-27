import { Col } from "@components/atoms";
import { ReceiptLibraryPanel, ReceiptPanel } from "@components/organisms/receipt";
import { ViewPageProps } from "@types";

export const ReceiptPage = ({ year, onRegisterTransaction }: ViewPageProps) => {
  return (
    <Col gap="md">
      {/* 登録しても画面に留まる（続けて撮影・登録できるように）。 */}
      <ReceiptPanel onRegistered={(tx) => onRegisterTransaction?.(tx)} />
      <ReceiptLibraryPanel year={year} />
    </Col>
  );
};
