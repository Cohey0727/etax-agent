import { useEffect, useState } from "react";
import {
  ApiError,
  SystemOneSettings,
  fetchSystemOneSettings,
  testSystemOneSettings,
  updateSystemOneSettings,
} from "@/api";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { SkeletonCard } from "@/components/Skeleton";
import { SwitchRow } from "@/components/SwitchRow";

/** 科目判定AI（SystemOne / jev）の接続設定。 */
export function SystemOnePanel() {
  const [settings, setSettings] = useState<SystemOneSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearApiKey, setClearApiKey] = useState(false);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetchSystemOneSettings()
      .then((s) => {
        setSettings(s);
        setBaseUrl(s.baseUrl);
        setModel(s.model);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof ApiError ? e.message : "設定の読み込みに失敗しました"),
      );
  }, []);

  const handleSave = async () => {
    setBusy("save");
    setMessage(null);
    try {
      const saved = await updateSystemOneSettings({
        baseUrl: baseUrl.trim(),
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        ...(clearApiKey ? { clearApiKey: true } : {}),
      });
      setSettings(saved);
      setApiKey("");
      setClearApiKey(false);
      setMessage({ ok: true, text: "保存しました。" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "保存に失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    setMessage(null);
    try {
      const result = await testSystemOneSettings({
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      setMessage(
        result.ok
          ? { ok: true, text: `接続できました（候補: ${result.top ?? "—"}）` }
          : { ok: false, text: `接続できませんでした: ${result.error ?? "不明なエラー"}` },
      );
    } catch {
      setMessage({ ok: false, text: "接続テストに失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  if (!settings) {
    return loadError ? (
      <Card>
        <AppText size="lg" weight="bold">
          科目判定AIの接続
        </AppText>
        <AlertBox tone="error" message={loadError} />
      </Card>
    ) : (
      <SkeletonCard />
    );
  }

  return (
    <Card>
      <AppText size="lg" weight="bold">
        科目判定AIの接続
      </AppText>
      <Field
        label="ベースURL"
        autoCapitalize="none"
        hint={baseUrl ? undefined : `未入力のため ${settings.effectiveBaseUrl} を使用中`}
        onChangeText={setBaseUrl}
        placeholder="http://127.0.0.1:11434"
        value={baseUrl}
      />
      <Field
        label="モデル"
        autoCapitalize="none"
        hint={model ? undefined : `未入力のため ${settings.effectiveModel ?? "モデル指定なし"} を使用中`}
        onChangeText={setModel}
        placeholder="モデル名"
        value={model}
      />
      <Field
        label="APIキー"
        autoCapitalize="none"
        hint={settings.apiKeySet ? "設定済み（入力した時だけ差し替わります）" : "未設定"}
        onChangeText={setApiKey}
        secureTextEntry
        value={apiKey}
      />
      {settings.apiKeySet ? (
        <SwitchRow label="APIキーを削除する" value={clearApiKey} onChange={setClearApiKey} />
      ) : null}
      <AppButton label="保存" size="sm" loading={busy === "save"} onPress={() => void handleSave()} />
      <AppButton
        label="接続テスト"
        variant="ghost"
        size="sm"
        loading={busy === "test"}
        onPress={() => void handleTest()}
      />
      {message ? <AlertBox tone={message.ok ? "success" : "error"} message={message.text} /> : null}
    </Card>
  );
}
