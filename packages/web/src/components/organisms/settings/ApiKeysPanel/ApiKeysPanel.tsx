/**
 * ApiKeysPanel.tsx — 外部エージェント連携（MCP）用 API キーの管理カード。
 *
 * MCP クライアント（Claude Code 等）が /mcp へ Bearer 接続するための
 * キーを発行・一覧・取消する。平文キーは発行時の応答でしか返らないため、
 * 発行直後だけ画面に残してコピーさせる。DB にはハッシュのみが保存される。
 * 未ログイン（認証オフのローカル運用含む）では管理できないため案内だけ出す。
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, SkeletonBar, Text } from "@components/atoms";
import { ApiKeyItem, CreatedApiKey } from "@types";
import { createApiKey, deleteApiKey, fetchApiKeys } from "@utils";

type LoadState = "loading" | "anonymous" | "ready";

interface StatusMessage {
  ok: boolean;
  text: string;
}

/** 読み込み中にフォームの代わりへ出すスケルトンの行数。 */
const SKELETON_ROWS: readonly number[] = [1, 2];

export const ApiKeysPanel = () => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [nameInput, setNameInput] = useState("");
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

  const handleCreate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const created = await createApiKey(nameInput.trim());
      setCreatedKey(created);
      setNameInput("");
      await reload();
      setMessage({ ok: true, text: "APIキーを発行しました。下のキーを控えてください" });
    } catch {
      setMessage({ ok: false, text: "APIキーの発行に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: number) => {
    setBusy(true);
    setMessage(null);
    try {
      await deleteApiKey(id);
      if (createdKey?.id === id) setCreatedKey(null);
      await reload();
      setMessage({ ok: true, text: "APIキーを取り消しました" });
    } catch {
      setMessage({ ok: false, text: "APIキーの取消に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
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
        <Text variant="sectionTitle">外部エージェント連携（MCP）</Text>
        <Text variant="caption">
          MCP クライアント（Claude Code・Codex 等）から、この画面で発行した API
          キーを Authorization: Bearer ヘッダーに設定して /mcp
          へ接続すると、このアカウントの帳簿・税額計算・XTX
          生成を外部エージェントから使えます。キーは発行時に一度だけ表示され、サーバーにはハッシュだけが保存されます。
        </Text>
        {loadState === "loading" ? (
          SKELETON_ROWS.map((row) => (
            <Col key={row} gap="sm">
              <SkeletonBar width="96px" height={12} />
              <SkeletonBar height={36} />
            </Col>
          ))
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
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    コピー
                  </Button>
                </Row>
              </Col>
            ) : null}
            <Col gap="sm">
              <Text variant="statLabel">新しいキーを発行</Text>
              <Row gap="sm">
                <Input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="キーの名前（例: Claude Code）"
                  aria-label="APIキーの名前"
                />
                <Button variant="primary" size="sm" onClick={handleCreate} disabled={busy}>
                  発行
                </Button>
              </Row>
            </Col>
            <Col gap="sm">
              <Text variant="statLabel">発行済みのキー</Text>
              {keys.length === 0 ? (
                <Text variant="caption">まだキーはありません。</Text>
              ) : (
                keys.map((key) => (
                  <Row key={key.id} gap="sm">
                    <Col gap="sm">
                      <Text variant="body">{key.name !== "" ? key.name : "（名前なし）"}</Text>
                      <Text variant="caption">
                        {key.key_prefix}… / 発行: {formatDateTime(key.created_at)} / 最終利用:{" "}
                        {key.last_used_at ? formatDateTime(key.last_used_at) : "まだ使われていません"}
                      </Text>
                    </Col>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(key.id)}
                      disabled={busy}
                    >
                      取り消し
                    </Button>
                  </Row>
                ))
              )}
            </Col>
          </>
        )}
        {message ? (
          <Text variant="caption">{message.text}</Text>
        ) : null}
      </Col>
    </Card>
  );
};

/** ISO 日時を画面表示用に整える。解釈できない場合はそのまま返す。 */
function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("ja-JP");
}
