import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "jp.co.occam.etaxagent",
  appName: "eTaxAgent",
  webDir: "../web/dist",
  backgroundColor: "#18124d",
  plugins: {
    // ネイティブでは fetch をネイティブ HTTP 経由にし、クロスオリジン
    // 接続と Cookie（セッション）の保持を WebView の制約なしに行う。
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 500,
      launchAutoHide: true,
      backgroundColor: "#18124d",
      showSpinner: false,
    },
    // Web 資産の OTA 更新（自己ホスト配信）。updateUrl は配信サーバーの
    // 配置先が決まり次第差し替える。自動でダウンロードし、次回起動時に
    // 適用する（directUpdate: false）。統計送信は行わない。
    CapacitorUpdater: {
      autoUpdate: true,
      directUpdate: false,
      updateUrl: "https://updates.example.com/updates.json",
      statsUrl: "",
    },
  },
};

export default config;
