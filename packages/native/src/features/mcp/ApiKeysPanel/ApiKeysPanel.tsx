import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import {
  ApiError,
  ApiKeyItem,
  CreatedApiKey,
  createApiKey,
  fetchApiKeys,
  revokeApiKey,
} from "@/api";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Chip, ChipTone } from "@/components/Chip";
import { Field } from "@/components/Field";
import { LabeledValue } from "@/components/LabeledValue";
import { SelectField } from "@/components/SelectField";
import { Sheet } from "@/components/Sheet";
import { SkeletonCard } from "@/components/Skeleton";
import { space } from "@/theme";
import { formatDate } from "@/utils";
import { copyText } from "../copyText";

const STATUS_LABELS: Record<ApiKeyItem["status"], { label: string; tone: ChipTone }> = {
  active: { label: "有効", tone: "positive" },
  revoked: { label: "失効済み", tone: "negative" },
  expired: { label: "期限切れ", tone: "warn" },
};

const EXPIRY_OPTIONS = [
  { value: "none", label: "無期限" },
  { value: "30", label: "30日" },
  { value: "90", label: "90日" },
  { value: "365", label: "365日" },
] as const;

type ExpiryValue = (typeof EXPIRY_OPTIONS)[number]["value"];

/** MCP 用 API キーの一覧・発行・失効。 */
export function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState<ExpiryValue>("none");
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = useCallback(async () => {
    try {
      setKeys(await fetchApiKeys());
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "APIキーの読み込みに失敗しました");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreate = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const expiresAt =
        expiry === "none"
          ? null
          : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000).toISOString();
      const key = await createApiKey(name.trim(), expiresAt);
      setCreated(key);
      setCreateOpen(false);
      setName("");
      setExpiry("none");
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "発行に失敗しました" });
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
      setRevokeTarget(null);
      setMessage({ ok: true, text: "APIキーを失効させました。" });
      await reload();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "失効に失敗しました" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <AppText size="lg" weight="bold">
        APIキー
      </AppText>
      <AppText size="sm" tone="muted">
        外部エージェント（MCPクライアント）の接続に使うキーです。キーの発行・失効はこの画面からのみ行えます。
      </AppText>
      {message ? <AlertBox tone={message.ok ? "success" : "error"} message={message.text} /> : null}
      {created ? (
        <View style={{ gap: space.xs }}>
          <AppText size="sm" weight="semibold" tone="subtle">
            発行したキー（この画面を離れると二度と表示されません）
          </AppText>
          <AppText size="sm" selectable style={{ fontFamily: "monospace" }}>
            {created.key}
          </AppText>
          <AppButton
            label="キーをコピー"
            variant="ghost"
            size="sm"
            onPress={() => void copyText(created.key)}
          />
          <AppButton label="閉じる" variant="ghost" size="sm" onPress={() => setCreated(null)} />
        </View>
      ) : null}
      {loadError ? (
        <AlertBox tone="error" message={loadError} />
      ) : keys === null ? (
        <SkeletonCard />
      ) : keys.length === 0 ? (
        <AppText size="sm" tone="muted">
          発行済みのキーはまだありません。
        </AppText>
      ) : (
        keys.map((key) => {
          const status = STATUS_LABELS[key.status];
          return (
            <View key={key.id} style={{ gap: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <AppText size="md" weight="semibold" style={{ flex: 1 }}>
                  {key.name}
                </AppText>
                <Chip label={status.label} tone={status.tone} />
              </View>
              <LabeledValue label="プレフィックス" value={key.key_prefix} />
              <LabeledValue label="作成日" value={formatDate(key.created_at)} />
              <LabeledValue
                label="有効期限"
                value={key.expires_at ? formatDate(key.expires_at) : "無期限"}
              />
              <LabeledValue
                label="最終利用"
                value={key.last_used_at ? formatDate(key.last_used_at) : "未使用"}
              />
              {key.status === "active" ? (
                <AppButton
                  label="失効させる"
                  variant="danger"
                  size="sm"
                  onPress={() => setRevokeTarget(key)}
                />
              ) : null}
            </View>
          );
        })
      )}
      <AppButton label="新しいキーを発行" size="sm" onPress={() => setCreateOpen(true)} />

      <Sheet visible={createOpen} title="APIキーを発行" onClose={() => setCreateOpen(false)}>
        <Field label="名前" onChangeText={setName} placeholder="例: Claude Code" value={name} />
        <SelectField
          label="有効期限"
          options={EXPIRY_OPTIONS}
          value={expiry}
          onChange={setExpiry}
        />
        <AppButton
          label="発行する"
          loading={busy}
          disabled={name.trim() === ""}
          onPress={() => void handleCreate()}
        />
      </Sheet>

      <Sheet
        visible={revokeTarget !== null}
        title="APIキーを失効させる"
        onClose={() => setRevokeTarget(null)}
      >
        <AppText size="sm" tone="muted">
          「{revokeTarget?.name}」を失効させます。このキーを使っているクライアントは接続できなくなります。元に戻せません。
        </AppText>
        <AppButton
          label="失効させる"
          variant="danger"
          loading={busy}
          onPress={() => void handleRevoke()}
        />
        <AppButton label="キャンセル" variant="ghost" size="sm" onPress={() => setRevokeTarget(null)} />
      </Sheet>
    </Card>
  );
}
