import { useFonts } from "expo-font";
import { Redirect, Tabs, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { AppTabBar } from "@/components/AppTabBar";
import { AppProvider } from "@/state/AppContext";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

function AppTabs() {
  const { ready, user, loginRequired } = useAuth();
  const segments = useSegments();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  // 認証ガード: ログイン必須の構成で未ログインなら、ログイン画面以外へは進ませない。
  const onLoginScreen = segments[0] === "login";
  const mustLogin = ready && loginRequired && !user && !onLoginScreen;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs
        tabBar={({ state, emitter, navigateToTab }) => (
          <AppTabBar
            state={state}
            onNavigate={(name) => {
              const route = state.routes.find((r) => r.name === name);
              if (!route) return;
              const focused = state.routes[state.index]?.key === route.key;
              const event = emitter.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!focused && !event.defaultPrevented) navigateToTab(route.key);
            }}
          />
        )}
        screenOptions={{
          headerStyle: { backgroundColor: colors.navyDeep },
          headerTintColor: colors.surface,
          headerTitleStyle: { fontWeight: "700" },
        }}
      >
        <Tabs.Screen name="index" options={{ title: "eTaxAgent", href: null }} />
        <Tabs.Screen name="ledger" options={{ title: "帳簿" }} />
        <Tabs.Screen name="filing" options={{ title: "確定申告" }} />
        <Tabs.Screen name="agent" options={{ title: "チャット" }} />
        <Tabs.Screen name="more" options={{ title: "その他" }} />
        <Tabs.Screen name="settings" options={{ title: "設定" }} />
        <Tabs.Screen name="import" options={{ title: "取引・CSV取込", href: null }} />
        <Tabs.Screen name="receipt" options={{ title: "領収書から帳簿", href: null }} />
        <Tabs.Screen name="reports" options={{ title: "試算表", href: null }} />
        <Tabs.Screen name="cashflow" options={{ title: "資金繰り", href: null }} />
        <Tabs.Screen name="assets" options={{ title: "固定資産", href: null }} />
        <Tabs.Screen name="invoices" options={{ title: "請求書", href: null }} />
        <Tabs.Screen name="taxpayer" options={{ title: "納税者情報", href: null }} />
        <Tabs.Screen name="mcp-settings" options={{ title: "MCP設定", href: null }} />
        <Tabs.Screen name="login" options={{ title: "ログイン", href: null }} />
        <Tabs.Screen name="auth-callback" options={{ headerShown: false, href: null }} />
      </Tabs>
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

  // ネイティブスプラッシュは無地（背景色のみ）で、フォントが読めた時点で
  // すぐ消す。起動画面として見えるのはアプリ側の AnimatedSplash だけにする。
  useEffect(() => {
    if (fontsLoaded) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <AuthProvider>
      <AppProvider>
        <StatusBar style="light" />
        <AppTabs />
      </AppProvider>
    </AuthProvider>
  );
}
