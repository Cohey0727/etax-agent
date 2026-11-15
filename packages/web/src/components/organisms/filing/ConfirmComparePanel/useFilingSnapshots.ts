import { useCallback, useEffect, useState } from "react";
import { FilingSnapshot } from "@types";
import { fetchFilingSnapshots } from "@utils/api";

export interface UseFilingSnapshotsResult {
  /** 対象年の確定スナップショット（確定日時の昇順）。未読込・未接続時は null。 */
  snapshots: FilingSnapshot[] | null;
  /** 一覧を読み直す（確定スナップショットを追加した後に呼ぶ）。 */
  refresh: () => Promise<void>;
}

/** 確定スナップショット一覧の読み込みを共有するフック。 */
export const useFilingSnapshots = (year: number): UseFilingSnapshotsResult => {
  const [snapshots, setSnapshots] = useState<FilingSnapshot[] | null>(null);

  const refresh = useCallback(async () => {
    const result = await fetchFilingSnapshots(year);
    if (result !== null) setSnapshots(result);
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    void fetchFilingSnapshots(year).then((result) => {
      if (!cancelled && result !== null) setSnapshots(result);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  return { snapshots, refresh };
};
