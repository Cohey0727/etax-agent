import { useFonts } from "expo-font";
import { Redirect, Stack, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { AnimatedSplash } from "@/components/AnimatedSplash";
import { AppBottomBar } from "@/components/AppBottomBar";
import { AppSidebar } from "@/components/AppSidebar";
import { ChatSheet } from "@/components/ChatSheet";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthLoadError } from "@/features/auth/AuthLoadError";
import { AppProvider } from "@/state/AppContext";
import { ChatSheetProvider } from "@/state/ChatSheetContext";
import { SidebarProvider } from "@/state/SidebarContext";
import { colors } from "@/theme";

void SplashScreen.preventAutoHideAsync();

function AppStack() {
  const { ready, loadError, reloadAuth, user, loginRequired } = useAuth();
  const segments = useSegments();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  // 認証ガード: ログイン必須の構成で未ログインなら、ログイン画面以外へは進ませない。
  // OAuth の戻り（auth-callback）は自分で結果に応じた画面へ振り分けるので、ここでは送らない。
  const onLoginScreen = segments[0] === "login";
  const onAuthCallback = segments[0] === "auth-callback";
  const mustLogin = ready && loginRequired && !user && !onLoginScreen && !onAuthCallback;

  const authFailed = ready && loadError !== null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.navyDeep },
            headerTintColor: colors.surface,
            headerTitleStyle: { fontWeight: "700" },
          }}
        >
          <Stack.Screen name="index" options={{ title: "eTaxAgent" }} />
          <Stack.Screen name="ledger" options={{ title: "帳簿" }} />
          <Stack.Screen name="filing" options={{ title: "確定申告" }} />
          <Stack.Screen name="settings" options={{ title: "設定" }} />
          <Stack.Screen name="import" options={{ title: "取引・CSV取込" }} />
          <Stack.Screen name="receipt" options={{ title: "領収書から帳簿" }} />
          <Stack.Screen name="reports" options={{ title: "試算表" }} />
          <Stack.Screen name="cashflow" options={{ title: "資金繰り" }} />
          <Stack.Screen name="assets" options={{ title: "固定資産" }} />
          <Stack.Screen name="invoices" options={{ title: "請求書" }} />
          <Stack.Screen name="taxpayer" options={{ title: "納税者情報" }} />
          <Stack.Screen name="mcp-settings" options={{ title: "MCP設定" }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="auth-callback" options={{ headerShown: false }} />
        </Stack>
      </ErrorBoundary>
      {!onLoginScreen && !onAuthCallback && !authFailed ? <AppBottomBar /> : null}
      <AppSidebar />
      <ChatSheet />
      {mustLogin ? <Redirect href="/login" /> : null}
      {ready && loadError !== null ? (
        <View style={styles.overlay}>
          <AuthLoadError message={loadError} onRetry={reloadAuth} />
        </View>
      ) : null}
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
        <SidebarProvider>
          <ChatSheetProvider>
            <StatusBar style="light" />
            <AppStack />
          </ChatSheetProvider>
        </SidebarProvider>
      </AppProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  // 起動時の確認に失敗したら、画面・ボトムバー・サイドバーより手前に出す
  overlay: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 90 },
});
