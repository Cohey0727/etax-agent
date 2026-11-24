import { useEffect, useState } from "react";

/**
 * appTemplateUtils.ts — アプリ枠の開閉状態の端末保存とメディアクエリ購読。
 */

export const SIDEBAR_OPEN_KEY = "etax-sidebar-open";
export const AGENT_OPEN_KEY = "etax-agent-open";

/** 開閉状態の復元。未保存なら既定値（左は開く、右は閉じる）。 */
export const loadPanelOpen = (key: string, fallback: boolean): boolean => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === "1";
  } catch {
    return fallback;
  }
};

export const savePanelOpen = (key: string, open: boolean): void => {
  try {
    localStorage.setItem(key, open ? "1" : "0");
  } catch {
    // 保存できなくても開閉自体は効く
  }
};

/** メディアクエリの一致を購読する（モバイルではナビの向きを切り替えるため）。 */
export const useMediaQuery = (query: string): boolean => {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
};
