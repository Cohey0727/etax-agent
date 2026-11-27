import { useEffect, useState } from "react";
import { Button, Card, Col, Input, Row, SkeletonBar, Text } from "@components/atoms";
import { StatusMessage, SystemOneSettings } from "@types";
import { fetchSystemOneSettings, testSystemOneSettings, updateSystemOneSettings } from "@utils";

type BusyKind = "save" | "test" | null;

/** 読み込み中にフォームの代わりへ出すスケルトンの行数。 */
const skeletonRows: readonly number[] = [1, 2, 3];

/**
 * 科目判定（Jev / SystemOne互換）の接続設定カード。
 * 設定はサーバー側に保存され、判定のすべて（画面・MCP・エージェント）に効く。
 * APIキーの実値はサーバーから返らないため、入力欄は常に空で始まる。
 */
export const SystemOneSettingsPanel = () => {
  const [settings, setSettings] = useState<SystemOneSettings | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [busy, setBusy] = useState<BusyKind>(null);
  const [message, setMessage] = useState<StatusMessage | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSystemOneSettings()
      .then((data) => {
        if (cancelled) return;
        setSettings(data);
        setBaseUrl(data.baseUrl);
        setModel(data.model);
      })
      .catch(() => {
        if (!cancelled) setMessage({ ok: false, text: "設定の読み込みに失敗しました" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applySettings = (data: SystemOneSettings) => {
    setSettings(data);
    setBaseUrl(data.baseUrl);
    setModel(data.model);
    setKeyInput("");
    setClearKey(false);
  };

  const handleSave = async () => {
    setBusy("save");
    setMessage(null);
    const keyToSend = keyInput ? keyInput : undefined;
    try {
      const data = await updateSystemOneSettings({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        apiKey: keyToSend,
        clearApiKey: clearKey,
      });
      applySettings(data);
      setMessage({ ok: true, text: "保存しました。この設定で判定します" });
    } catch {
      setMessage({ ok: false, text: "保存に失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setMessage(null);
    const keyToSend = keyInput ? keyInput : undefined;
    try {
      const result = await testSystemOneSettings({
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        apiKey: keyToSend,
      });
      setMessage(
        result.ok
          ? { ok: true, text: `接続できました（判定例: ${result.top ?? "—"}）` }
          : { ok: false, text: `接続できませんでした: ${result.error ?? "不明なエラー"}` },
      );
    } catch {
      setMessage({ ok: false, text: "接続テストに失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  // 保存済み設定の読み込みが終わるまでは、空の設定フォームではなくスケルトンを出す
  // （空欄を「未設定」と見せないため）。
  if (!settings) {
    return (
      <Card>
        <Col gap="md">
          <Text variant="sectionTitle">科目判定AIの接続</Text>
          {message ? (
            <Text variant="caption">{message.text}</Text>
          ) : (
            skeletonRows.map((row) => (
              <Col key={row} gap="sm">
                <SkeletonBar width="96px" height={12} />
                <SkeletonBar height={36} />
              </Col>
            ))
          )}
        </Col>
      </Card>
    );
  }

  return (
    <Card>
      <Col gap="md">
        <Text variant="sectionTitle">科目判定AIの接続</Text>
        <Col gap="sm">
          <Text variant="statLabel">ベースURL</Text>
          <Input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://127.0.0.1:11434"
            autoComplete="off"
          />
          {settings && !baseUrl ? (
            <Text variant="caption">未入力のため {settings.effectiveBaseUrl} を使用中</Text>
          ) : null}
        </Col>
        <Col gap="sm">
          <Text variant="statLabel">モデル</Text>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="モデル名"
            autoComplete="off"
          />
          {settings && !model ? (
            <Text variant="caption">
              未入力のため {settings.effectiveModel ?? "モデル指定なし"} を使用中
            </Text>
          ) : null}
        </Col>
        <Col gap="sm">
          <Text variant="statLabel">APIキー</Text>
          <Input
            type="password"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder={
              settings?.apiKeySet ? "設定済み（変更する場合のみ入力）" : "未設定（必要な場合のみ）"
            }
            autoComplete="off"
          />
          {clearKey ? <Text variant="caption">保存するとAPIキーが削除されます</Text> : null}
        </Col>
        <Row gap="sm">
          <Button variant="primary" size="sm" onClick={handleSave} disabled={busy !== null} disabledReason="処理中です">
            {busy === "save" ? "保存中…" : "保存"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleTest} disabled={busy !== null} disabledReason="処理中です">
            {busy === "test" ? "接続テスト中…" : "接続テスト"}
          </Button>
          {settings?.apiKeySet && !clearKey ? (
            <Button variant="ghost" size="sm" onClick={() => setClearKey(true)}>
              APIキーを削除
            </Button>
          ) : null}
          {clearKey ? (
            <Button variant="ghost" size="sm" onClick={() => setClearKey(false)}>
              削除を取り消し
            </Button>
          ) : null}
        </Row>
        {message ? (
          <Text variant="caption">
            {message.ok ? "✓ " : "⚠ "}
            {message.text}
          </Text>
        ) : null}
        <Text variant="caption">
          科目判定に使う AI サービスのベースURL・APIキー・モデル名を入れてください。設定はサーバーに保存され、科目判定のすべてに効きます。未入力の項目はサーバー側の既定設定を使います。
        </Text>
      </Col>
    </Card>
  );
};
