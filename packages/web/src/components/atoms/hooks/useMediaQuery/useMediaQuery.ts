import { useEffect, useState } from "react";
import { Breakpoint, mediaquery } from "@configs";

/**
 * 指定ブレークポイント以上の幅かどうかを返す。
 * matchMedia は外部（ブラウザ）の変化なので、購読コールバックの中で state を写す。
 */
export function useMediaQuery(breakpoint: Breakpoint): boolean {
  const query = mediaquery[breakpoint];
  const [matches, setMatches] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    setMatches(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
