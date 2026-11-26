import { Redirect, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { useAuth } from "@/auth/AuthContext";
import { colors } from "@/theme";

type Destination = "/" | "/login" | `/login?totp_challenge=${string}` | "/login?auth_error=1";

/**
 * OAuth の戻り先（etaxagent://auth-callback）。アプリが起動していない状態で
 * ディープリンクを開かれた場合の受け口で、結果に応じて振り分ける。
 * token はここでログインに適用し、TOTP が必要な場合はログイン画面へ回す。
 */
export default function AuthCallbackScreen() {
  const params = useLocalSearchParams<{
    token?: string;
    totp_challenge?: string;
    auth_error?: string;
  }>();
  const { applyLoginResponse } = useAuth();
  const [destination, setDestination] = useState<Destination | null>(null);
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;
    if (params.auth_error) {
      setDestination("/login?auth_error=1");
      return;
    }
    if (params.totp_challenge) {
      setDestination(`/login?totp_challenge=${encodeURIComponent(params.totp_challenge)}`);
      return;
    }
    if (params.token) {
      const token = params.token;
      void (async () => {
        const outcome = await applyLoginResponse({ token });
        if (outcome.kind === "signedIn") {
          setDestination("/");
        } else if (outcome.kind === "totp") {
          setDestination(`/login?totp_challenge=${encodeURIComponent(outcome.challenge)}`);
        } else {
          setDestination("/login");
        }
      })();
      return;
    }
    setDestination("/login");
  }, [params.auth_error, params.totp_challenge, params.token, applyLoginResponse]);

  if (destination) return <Redirect href={destination} />;
  return <View style={{ flex: 1, backgroundColor: colors.navyDeep }} />;
}
