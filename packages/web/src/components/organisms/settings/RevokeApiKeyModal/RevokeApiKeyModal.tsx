/**
 * RevokeApiKeyModal.tsx — API キーの失効確認モーダル。
 * 失効は取り消せないことと、連携が直ちに使えなくなることを明示する。
 */
import { Button, Col, Row, Text } from "@components/atoms";
import { Modal } from "@components/molecules";
import { ApiKeyItem } from "@types";
import { maskApiKey } from "@utils";

export interface RevokeApiKeyModalProps {
  target: ApiKeyItem;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const RevokeApiKeyModal = ({ target, busy, onClose, onConfirm }: RevokeApiKeyModalProps) => {
  return (
    <Modal title="APIキーを失効させる" onClose={onClose}>
      <Col gap="md">
        <Text variant="body">
          「{target.name !== "" ? target.name : "（名前なし）"}」（{maskApiKey(target.key_prefix)}
          ）を失効させます。
        </Text>
        <Text variant="caption">
          このキーを使っている連携（MCP クライアント等）は直ちに使えなくなります。失効は取り消せません。必要になったら新しいキーを発行してください。
        </Text>
        <Row gap="sm" align="center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            disabled={busy}
            disabledReason="処理中です"
          >
            キャンセル
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            disabledReason="処理中です"
          >
            {busy ? "失効中…" : "失効させる"}
          </Button>
        </Row>
      </Col>
    </Modal>
  );
};
