import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { CapacitorUpdater } from "@capgo/capacitor-updater";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { API_BASE_URL } from "./apiBase";

/**
 * ネイティブアプリとして起動したときの初期化。
 * Web では何もしない。ステータスバーとスプラッシュの見た目を揃え、
 * 外部サイトへのリンクはアプリ内 WebView ではなくシステムの
 * ブラウザで開く（WebView 内に閉じ込めて戻れなくなるのを防ぐ）。
 */
export function initNativePlatform(): void {
  if (!Capacitor.isNativePlatform()) return;

  // OTA 更新の適用確定。これを呼ばないと、更新が失敗したとみなされ
  // 前のバンドルへ自動でロールバックされる。
  void CapacitorUpdater.notifyAppReady().catch(() => undefined);

  void StatusBar.setStyle({ style: Style.Default }).catch(() => undefined);
  if (Capacitor.getPlatform() === "android") {
    void StatusBar.setBackgroundColor({ color: "#18124d" }).catch(() => undefined);
  }

  const apiOrigin = API_BASE_URL === "" ? null : new URL(API_BASE_URL).origin;
  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const anchor = target?.closest?.("a");
    if (!anchor) return;
    const href = anchor.href;
    if (!href.startsWith("http")) return;
    const url = new URL(href);
    const staysInApp =
      anchor.target !== "_blank" &&
      (url.origin === window.location.origin || url.origin === apiOrigin);
    if (staysInApp) return;
    event.preventDefault();
    void Browser.open({ url: href }).catch(() => undefined);
  });

  void SplashScreen.hide().catch(() => undefined);
}
