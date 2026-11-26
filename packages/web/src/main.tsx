import React from "react";
import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { AppPage } from "@components/pages";
import { initNativePlatform } from "@utils/native";
import "@configs/global.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root が見つかりません");
createRoot(el).render(
  <React.StrictMode>
    <AppPage />
  </React.StrictMode>,
);

initNativePlatform();

// PWA: 本番ビルドでのみサービスワーカーを登録する（開発時はキャッシュが邪魔になるため）。
// ネイティブアプリ内ではアセット配信と競合するため登録しない。
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // 登録に失敗してもアプリ自体は通常通り使える
    });
  });
}
