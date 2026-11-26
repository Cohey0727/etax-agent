import { useFonts } from "expo-font";
import { Redirect, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { AppProvider } from "@/state/AppContext";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

function AppStack() {
  const { ready, user, loginRequired } = useAuth();
  const segments = useSegments();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready]);

  // 認証ガード: ログイン必須の構成で未ログインなら、ログイン画面以外へは進ませない。
  const onLoginScreen = segments[0] === "login";
  const mustLogin = ready && loginRequired && !user && !onLoginScreen;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.navyDeep },
          headerTintColor: colors.surface,
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "eTaxAgent" }} />
        <Stack.Screen name="login" options={{ title: "ログイン" }} />
        <Stack.Screen name="ledger" options={{ title: "帳簿" }} />
        <Stack.Screen name="import" options={{ title: "取引・CSV取込" }} />
        <Stack.Screen name="receipt" options={{ title: "領収書から帳簿" }} />
        <Stack.Screen name="reports" options={{ title: "試算表" }} />
        <Stack.Screen name="cashflow" options={{ title: "資金繰り" }} />
        <Stack.Screen name="assets" options={{ title: "固定資産" }} />
        <Stack.Screen name="invoices" options={{ title: "請求書" }} />
        <Stack.Screen name="filing" options={{ title: "確定申告" }} />
        <Stack.Screen name="taxpayer" options={{ title: "納税者情報" }} />
        <Stack.Screen name="mcp-settings" options={{ title: "MCP設定" }} />
        <Stack.Screen name="settings" options={{ title: "設定" }} />
        <Stack.Screen name="agent" options={{ title: "AIエージェント" }} />
      </Stack>
      {mustLogin ? <Redirect href="/login" /> : null}
      {!splashDone ? <AnimatedSplash ready={ready} onFinish={handleSplashFinish} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "IBMPlexSansJP-400": require("../assets/fonts/IBMPlexSansJP-400.ttf"),
    "IBMPlexSansJP-500": require("../assets/fonts/IBMPlexSansJP-500.ttf"),
    "IBMPlexSansJP-600": require("../assets/fonts/IBMPlexSansJP-600.ttf"),
    "IBMPlexSansJP-700": require("../assets/fonts/IBMPlexSansJP-700.ttf"),
  });

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <AppProvider>
        <StatusBar style="light" />
        <AppStack />
      </AppProvider>
    </AuthProvider>
  );
}
