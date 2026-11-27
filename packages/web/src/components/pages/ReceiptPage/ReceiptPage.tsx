import { Transaction } from "@etax/shared";
import { useState } from "react";
import { Col } from "@components/atoms";
import { ReceiptLibraryPanel, ReceiptPanel } from "@components/organisms/receipt";
import { ViewPageProps } from "@types";

export const ReceiptPage = ({ year, onRegisterTransaction }: ViewPageProps) => {
  // 解析・登録のたびに証憑の一覧を作り直し、新しい証憑と紐付け先の候補を出す。
  const [libraryVersion, setLibraryVersion] = useState(0);
  const refreshLibrary = () => setLibraryVersion((version) => version + 1);
  const handleRegistered = (tx: Transaction) => {
    onRegisterTransaction?.(tx);
    refreshLibrary();
  };
  return (
    <Col gap="md">
      {/* 登録しても画面に留まる（続けて撮影・登録できるように）。 */}
      <ReceiptPanel onAnalyzed={refreshLibrary} onRegistered={handleRegistered} />
      <ReceiptLibraryPanel key={libraryVersion} year={year} />
    </Col>
  );
};
