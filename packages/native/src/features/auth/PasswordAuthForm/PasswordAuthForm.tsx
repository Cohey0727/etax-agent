import { View } from "react-native";
import { AppButton } from "@/components/AppButton";
import { Field } from "@/components/Field";
import { space } from "@/theme";

export type PasswordMode = "login" | "register";

export interface PasswordAuthFormProps {
  mode: PasswordMode;
  email: string;
  password: string;
  busy: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
}

/** メール＋パスワードのフォーム（ログイン/新規登録で共用）。 */
export function PasswordAuthForm({
  mode,
  email,
  password,
  busy,
  onEmailChange,
  onPasswordChange,
  onSubmit,
}: PasswordAuthFormProps) {
  return (
    <View style={{ gap: space.sm }}>
      <Field
        label="メールアドレス"
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        onChangeText={onEmailChange}
        textContentType="emailAddress"
        value={email}
      />
      <Field
        label="パスワード"
        autoComplete={mode === "register" ? "new-password" : "password"}
        onChangeText={onPasswordChange}
        secureTextEntry
        textContentType={mode === "register" ? "newPassword" : "password"}
        value={password}
      />
      <AppButton
        label={mode === "register" ? "登録する" : "ログイン"}
        loading={busy}
        disabled={email.trim() === "" || password === ""}
        onPress={onSubmit}
      />
    </View>
  );
}
