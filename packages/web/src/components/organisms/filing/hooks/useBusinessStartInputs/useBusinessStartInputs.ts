import { useEffect, useRef, useState } from "react";
import { BusinessStartInputs } from "@types";
import { saveBusinessStartInputsToServer } from "@utils/api";
import { emptyBusinessStartInputs, loadBusinessStartInputs } from "./businessStartStorage";

/** 入力が止まってからDBへ保存するまでの待ち時間（ミリ秒）。 */
const SAVE_DELAY_MS = 600;

export interface UseBusinessStartInputsResult {
  inputs: BusinessStartInputs;
  /** サーバーの保存値を読み込めたか（未保存も含む）。読めるまでは編集させない。 */
  loaded: boolean;
  /** サーバーから読み込めなかったか。 */
  loadFailed: boolean;
  /** 一部を書き換え、少し待ってから保存する。 */
  update: (patch: Partial<BusinessStartInputs>) => void;
  /** 読み込みに失敗したあと、もう一度読み込む。 */
  retry: () => void;
}

/**
 * 開業届・青色申告承認申請書の専用入力を読み書きするフック。入力は少し
 * 待ってから自動で保存し、画面を離れるときに保存待ちがあれば即座に保存する。
 * 保存は入力一式の置き換えなので、読み込めるまで保存しない。
 */
export const useBusinessStartInputs = (): UseBusinessStartInputsResult => {
  const [inputs, setInputs] = useState<BusinessStartInputs>(() => emptyBusinessStartInputs());
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const pendingRef = useRef<BusinessStartInputs | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadBusinessStartInputs().then((result) => {
      if (cancelled) return;
      if (result.status === "failed") {
        setLoadFailed(true);
        return;
      }
      if (result.status === "loaded") setInputs(result.value);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBusinessStartInputsToServer(pending);
    };
  }, []);

  const update = (patch: Partial<BusinessStartInputs>) => {
    const next = { ...inputs, ...patch };
    setInputs(next);
    if (!loaded) return;
    pendingRef.current = next;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) void saveBusinessStartInputsToServer(pending);
    }, SAVE_DELAY_MS);
  };

  return {
    inputs,
    loaded,
    loadFailed,
    update,
    retry: () => {
      setLoadFailed(false);
      setLoadAttempt((n) => n + 1);
    },
  };
};
