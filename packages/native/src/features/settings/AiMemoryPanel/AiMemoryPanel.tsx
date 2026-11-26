import { useEffect, useState } from "react";
import { View } from "react-native";
import {
  ApiError,
  JevPromptInfo,
  RegexRuleItem,
  RegexRulesInfo,
  fetchJevPrompt,
  fetchRegexRules,
  updateJevPrompt,
  updateRegexRules,
} from "@/api";
import { AlertBox } from "@/components/AlertBox";
import { AppButton } from "@/components/AppButton";
import { AppText } from "@/components/AppText";
import { BouncePressable } from "@/components/BouncePressable";
import { Card } from "@/components/Card";
import { Chip } from "@/components/Chip";
import { Field } from "@/components/Field";
import { SkeletonCard } from "@/components/Skeleton";
import { colors, radius, space } from "@/theme";

interface RuleDraft {
  pattern: string;
  category: string;
}

/** AIのメモリー（科目判定の正規表現ルールと判定用プロンプト）。 */
export function AiMemoryPanel() {
  const [rulesInfo, setRulesInfo] = useState<RegexRulesInfo | null>(null);
  const [promptInfo, setPromptInfo] = useState<JevPromptInfo | null>(null);
  const [drafts, setDrafts] = useState<RuleDraft[]>([]);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState<"rules" | "prompt" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchRegexRules(), fetchJevPrompt()])
      .then(([rules, promptData]) => {
        setRulesInfo(rules);
        setDrafts(rules.customRules.map((r) => ({ pattern: r.pattern, category: r.category })));
        setPromptInfo(promptData);
        setPrompt(promptData.customPrompt);
      })
      .catch((e: unknown) =>
        setLoadError(e instanceof ApiError ? e.message : "メモリーの読み込みに失敗しました"),
      );
  }, []);

  const handleSaveRules = async () => {
    setBusy("rules");
    setMessage(null);
    try {
      const rules: RegexRuleItem[] = drafts
        .map((d) => ({ pattern: d.pattern.trim(), category: d.category.trim() }))
        .filter((d) => d.pattern !== "" && d.category !== "");
      const saved = await updateRegexRules(rules);
      setRulesInfo(saved);
      setDrafts(saved.customRules.map((r) => ({ pattern: r.pattern, category: r.category })));
      setMessage({ ok: true, text: "ルールを保存しました。" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "ルールの保存に失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  const handleSavePrompt = async () => {
    setBusy("prompt");
    setMessage(null);
    try {
      const saved = await updateJevPrompt(prompt);
      setPromptInfo(saved);
      setPrompt(saved.customPrompt);
      setMessage({ ok: true, text: "プロンプトを保存しました。" });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof ApiError ? e.message : "プロンプトの保存に失敗しました" });
    } finally {
      setBusy(null);
    }
  };

  if (!rulesInfo || !promptInfo) {
    return loadError ? (
      <Card>
        <AppText size="lg" weight="bold">
          AIのメモリー（科目判定の学習）
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
        AIのメモリー（科目判定の学習）
      </AppText>
      <AppText size="sm" weight="semibold" tone="subtle">
        正規表現ルール（自動分類）
      </AppText>
      <AppText size="xs" tone="muted">
        {rulesInfo.usingCustom
          ? "カスタムルールを使用中です。全て空にして保存すると自動生成に戻ります。"
          : "現在は自動生成ルールを使用中です。"}
      </AppText>
      {drafts.length === 0 ? (
        <AppText size="sm" tone="muted">
          ルールはまだありません。「ルールを追加」から作れます。
        </AppText>
      ) : null}
      {drafts.map((draft, index) => (
        <View
          key={index}
          style={{
            gap: space.xs,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: space.sm,
          }}
        >
          <Field
            label="パターン（正規表現）"
            autoCapitalize="none"
            onChangeText={(v) =>
              setDrafts(drafts.map((d, i) => (i === index ? { ...d, pattern: v } : d)))
            }
            value={draft.pattern}
          />
          <Field
            label="科目"
            onChangeText={(v) =>
              setDrafts(drafts.map((d, i) => (i === index ? { ...d, category: v } : d)))
            }
            value={draft.category}
          />
          <BouncePressable
            accessibilityRole="button"
            onPress={() => setDrafts(drafts.filter((_, i) => i !== index))}
          >
            <AppText size="sm" tone="negative">
              このルールを削除
            </AppText>
          </BouncePressable>
        </View>
      ))}
      <AppButton
        label="ルールを追加"
        variant="ghost"
        size="sm"
        onPress={() => setDrafts([...drafts, { pattern: "", category: "" }])}
      />
      <AppButton
        label="ルールを保存"
        size="sm"
        loading={busy === "rules"}
        onPress={() => void handleSaveRules()}
      />
      {rulesInfo.generatedRules.length > 0 ? (
        <View style={{ gap: space.xs }}>
          <AppText size="sm" weight="semibold" tone="subtle">
            自動生成ルール（参考{rulesInfo.usingCustom ? "・現在は未使用" : ""}）
          </AppText>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {rulesInfo.generatedRules.slice(0, 30).map((rule) => (
              <Chip key={rule.pattern} label={`${rule.pattern} → ${rule.category}`} />
            ))}
          </View>
        </View>
      ) : null}
      <AppText size="sm" weight="semibold" tone="subtle">
        判定用プロンプト
      </AppText>
      <Field
        label="カスタムプロンプト"
        hint="空にして保存すると自動生成に戻ります。"
        multiline
        numberOfLines={6}
        onChangeText={setPrompt}
        value={prompt}
      />
      <AppButton
        label="プロンプトを保存"
        size="sm"
        loading={busy === "prompt"}
        onPress={() => void handleSavePrompt()}
      />
      {message ? <AlertBox tone={message.ok ? "success" : "error"} message={message.text} /> : null}
    </Card>
  );
}
