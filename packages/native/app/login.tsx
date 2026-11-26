import { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError, loginAccount } from "@/api";
import { useAuth } from "@/auth/AuthContext";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScreenContainer } from "@/components/ScreenContainer";

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#e3e1f2",
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  error: {
    color: "#c22f4d",
    fontSize: 14,
  },
  input: {
    borderColor: "#e3e1f2",
    borderRadius: 12,
    borderWidth: 1,
    color: "#26224d",
    fontSize: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    color: "#6f6c8f",
    fontSize: 13,
    marginBottom: 6,
  },
  success: {
    color: "#1d7a4f",
    fontSize: 14,
  },
});

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const { applyLoginResponse } = useAuth();

  const handleSubmit = async () => {
    setState({ kind: "submitting" });
    try {
      const response = await loginAccount(email.trim(), password);
      const outcome = await applyLoginResponse(response);
      if (outcome.kind === "signedIn") {
        setState({ kind: "success" });
      } else if (outcome.kind === "totp") {
        setState({ kind: "error", message: "二段階認証が必要です（次画面で対応します）。" });
      } else {
        setState({ kind: "error", message: "メール確認が完了していません。" });
      }
    } catch (e) {
      setState({
        kind: "error",
        message: e instanceof ApiError ? e.message : "ログインに失敗しました",
      });
    }
  };

  return (
    <ScreenContainer>
      <View style={styles.card}>
        <View>
          <Text style={styles.label}>メールアドレス</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            style={styles.input}
            textContentType="emailAddress"
            value={email}
          />
        </View>
        <View>
          <Text style={styles.label}>パスワード</Text>
          <TextInput
            autoComplete="password"
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={password}
          />
        </View>
        {state.kind === "error" ? <Text style={styles.error}>{state.message}</Text> : null}
        {state.kind === "success" ? (
          <Text style={styles.success}>ログインできました。</Text>
        ) : null}
        <PrimaryButton
          disabled={state.kind === "submitting" || email === "" || password === ""}
          label="ログイン"
          onPress={handleSubmit}
        />
      </View>
    </ScreenContainer>
  );
}
