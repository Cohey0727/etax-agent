/**
 * ApiKeysPanel.tsx — 外部エージェント連携（MCP）用 API キーの管理パネル。
 *
 * 発行（名前＋有効期限）・一覧（マスク表示＋状態）・失効を扱う。
 * 平文キーは発行時の応答でしか返らないため、発行直後だけ画面に残して
 * コピーさせる。DB にはハッシュだけが保存される。
 * 未ログイン（認証オフのローカル運用含む）では管理できないため案内だけ出す。
 */
import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Col,
  Icon,
  Input,
  Row,
  SkeletonBar,
  Table,
  TableCell,
  TableHeaderCell,
  Text,
} from "@components/atoms";
import { ApiKeyItem, ApiKeyStatus, CreatedApiKey } from "@types";
import { createApiKey, fetchApiKeys, formatApiKeyLastUsed, formatDateTime, maskApiKey, revokeApiKey } from "@utils";
import { CreateApiKeyModal } from "../CreateApiKeyModal";
import { RevokeApiKeyModal } from "../RevokeApiKeyModal";

type LoadState = "loading" | "anonymous" | "ready";

interface StatusMessage {
  ok: boolean;
  text: string;
}

/** ステータスの表示ラベル（列挙分岐はマッピング表で持つ）。 */
const STATUS_LABELS: Record<ApiKeyStatus, string> = {
  active: "有効",
  revoked: "失効",
  expired: "期限切れ",
};

/** 読み込み中に表の代わりへ出すスケルトンの行数。 */
const SKELETON_ROWS: readonly number[] = [1, 2, 3];

export const ApiKeysPanel = () => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchApiKeys();
      setKeys(rows);
      setLoadState("ready");
    } catch {
      setLoadState("anonymous");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async (name: string, expiresAt: string | null) => {
    setBusy(true);
    setMessage(null);
    try {
      const created = await createApiKey(name, expiresAt);
      setCreatedKey(created);
      setCreateOpen(false);
      await reload();
      setMessage({ ok: true, text: "APIキーを発行しました。下のキーを控えてください" });
    } catch {
      setMessage({ ok: false, text: "APIキーの発行に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    setMessage(null);
    try {
      await revokeApiKey(revokeTarget.id);
      if (createdKey?.id === revokeTarget.id) setCreatedKey(null);
      setRevokeTarget(null);
      await reload();
      setMessage({ ok: true, text: "APIキーを失効させました" });
    } catch {
      setMessage({ ok: false, text: "APIキーの失効に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const handleCopyCreated = async () => {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey.key);
      setMessage({ ok: true, text: "キーをコピーしました" });
    } catch {
      setMessage({ ok: false, text: "コピーに失敗しました。キーを選択して控えてください" });
    }
  };

  return (
    <Card>
      <Col gap="md">
        <Row gap="sm">
          <Text variant="sectionTitle">APIキー</Text>
          {loadState === "ready" ? (
            <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
              <Icon name="plus" size={14} />
              キーを発行
            </Button>
          ) : null}
        </Row>
        <Text variant="caption">
          MCP クライアントから接続するためのキーです。キーは発行時に一度だけ表示され、サーバーにはハッシュだけが保存されます。有効期限を過ぎたキーや失効させたキーは使えなくなります。
        </Text>
        {loadState === "loading" ? (
          <Col gap="sm" aria-hidden="true">
            {SKELETON_ROWS.map((row) => (
              <SkeletonBar key={row} height={28} />
            ))}
          </Col>
        ) : loadState === "anonymous" ? (
          <Text variant="caption">
            APIキーの発行・管理にはログインが必要です（認証が有効な運用でのみ使えます）。
          </Text>
        ) : (
          <>
            {createdKey ? (
              <Col gap="sm">
                <Text variant="statLabel">発行したキー（この画面を離れると二度と表示されません）</Text>
                <Row gap="sm">
                  <Input value={createdKey.key} readOnly aria-label="発行したAPIキー" />
                  <Button variant="ghost" size="sm" onClick={handleCopyCreated}>
                    コピー
                  </Button>
                </Row>
              </Col>
            ) : null}
            {keys.length === 0 ? (
              <Text variant="caption">
                まだAPIキーはありません。「キーを発行」から最初のキーを作成してください。
              </Text>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <TableHeaderCell>名前</TableHeaderCell>
                    <TableHeaderCell>キー</TableHeaderCell>
                    <TableHeaderCell>作成日</TableHeaderCell>
                    <TableHeaderCell>最終利用</TableHeaderCell>
                    <TableHeaderCell>有効期限</TableHeaderCell>
                    <TableHeaderCell>ステータス</TableHeaderCell>
                    <TableHeaderCell>操作</TableHeaderCell>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id}>
                      <TableCell>{key.name !== "" ? key.name : "（名前なし）"}</TableCell>
                      <TableCell>
                        <Badge>{maskApiKey(key.key_prefix)}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(key.created_at)}</TableCell>
                      <TableCell>{formatApiKeyLastUsed(key.last_used_at)}</TableCell>
                      <TableCell>
                        {key.expires_at ? formatDateTime(key.expires_at) : "無期限"}
                      </TableCell>
                      <TableCell>
                        <Badge>{STATUS_LABELS[key.status]}</Badge>
                      </TableCell>
                      <TableCell>
                        {key.status === "active" ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokeTarget(key)}
                            disabled={busy}
                            aria-label={`「${key.name}」を失効させる`}
                          >
                            <Icon name="trash" size={14} />
                            失効
                          </Button>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </>
        )}
        {message ? (
          <Text variant="caption">
            {message.ok ? "✓ " : "⚠ "}
            {message.text}
          </Text>
        ) : null}
      </Col>
      {createOpen ? (
        <CreateApiKeyModal
          busy={busy}
          onClose={() => setCreateOpen(false)}
          onSubmit={(name, expiresAt) => void handleCreate(name, expiresAt)}
        />
      ) : null}
      {revokeTarget ? (
        <RevokeApiKeyModal
          target={revokeTarget}
          busy={busy}
          onClose={() => setRevokeTarget(null)}
          onConfirm={() => void handleRevoke()}
        />
      ) : null}
    </Card>
  );
};
