import { useEffect, useState } from "react";

/**
 * 任意のメディアクエリの一致を購読する（アプリ枠の 900px での縦積みの切り替え用）。
 * 900px は configs/mediaquery のブレークポイントに無いため、atoms の useMediaQuery
 * （ブレークポイント指定）とは別に持つ。
 */
export const useMatchMedia = (query: string): boolean => {
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
