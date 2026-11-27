import { useEffect, useState } from "react";
import { AgentConnectionConfig, testAgentSettings } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Field } from "@/components/Field";
import { EMPTY_AGENT_CONNECTION, loadAgentConnection, saveAgentConnection } from "../agentConnectionStorage";

/** 外部接続（AI）の上書き設定と接続テスト。値は端末に保存し、エージェント送信時に使う。 */
export function AgentConnectionPanel() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [config, setConfig] = useState<AgentConnectionConfig>(EMPTY_AGENT_CONNECTION);
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    loadAgentConnection(userId)
      .then(setConfig)
      .finally(() => setLoaded(true));
  }, [userId]);

  const update = (next: AgentConnectionConfig) => {
    setConfig(next);
    void saveAgentConnection(userId, next);
  };

  const handleAgentTest = async () => {
    setTesting(true);
    setMessage(null);
    try {
      const result = await testAgentSettings({
        baseUrl: config.baseUrl.trim() || undefined,
        model: config.model.trim() || undefined,
        apiKey: config.apiKey.trim() || undefined,
      });
      setMessage(
        result.ok
          ? { ok: true, text: `接続できました（モデル: ${result.model ?? "—"}、応答: ${result.reply ?? "—"}）` }
          : { ok: false, text: `接続できませんでした: ${result.error ?? "不明なエラー"}` },
      );
    } catch {
      setMessage({ ok: false, text: "接続テストに失敗しました" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <AppText size="lg" weight="bold">
        外部接続（AI）
      </AppText>
      <Field
        label="ベースURL"
        autoCapitalize="none"
        onChangeText={(v) => update({ ...config, baseUrl: v })}
        placeholder="AIサービスのベースURL"
        value={loaded ? config.baseUrl : ""}
      />
      <Field
        label="モデル"
        autoCapitalize="none"
        onChangeText={(v) => update({ ...config, model: v })}
        placeholder="モデル名"
        value={loaded ? config.model : ""}
      />
      <Field
        label="APIキー"
        autoCapitalize="none"
        hint="入力した項目だけがサーバーの設定より優先されます。APIキーはこの端末にだけ保存され、チャット送信時にのみサーバーへ送られます。"
        onChangeText={(v) => update({ ...config, apiKey: v })}
        placeholder="未入力ならサーバーの設定を使います"
        secureTextEntry
        value={loaded ? config.apiKey : ""}
      />
      <AppButton
        label="接続テスト（AIエージェント）"
        variant="ghost"
        size="sm"
        loading={testing}
        onPress={() => void handleAgentTest()}
      />
      {message ? <AlertBox tone={message.ok ? "success" : "error"} message={message.text} /> : null}
    </Card>
  );
}
