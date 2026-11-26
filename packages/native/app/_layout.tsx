import { useFonts } from "expo-font";
import { Stack } from "expo-router";
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
  const { ready } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashFinish = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (ready) {
      void SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready]);

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
      </Stack>
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
