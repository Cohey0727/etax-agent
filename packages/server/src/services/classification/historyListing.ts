/**
 * historyListing.ts — 学習履歴の一覧表示用への整形（services/classification）。
 * 「よく使う対応が上」（回数の多い順、同数なら新しい順）に並べ、
 * APIレスポンスの形（摘要・科目・回数・更新日時だけ）に落とす。
 */
import { ClassificationHistoryRecord } from "../../repositories/classificationHistoryRepository";

const MAX_RECORDS = 500;

export interface HistoryListing {
  records: { description: string; account: string; count: number; updatedAt: string }[];
  total: number;
}

export function toHistoryListing(history: ClassificationHistoryRecord[]): HistoryListing {
  const sorted = [...history].sort((a, b) =>
    b.count !== a.count ? b.count - a.count : b.updatedAt.localeCompare(a.updatedAt),
  );
  return {
    records: sorted.slice(0, MAX_RECORDS).map((r) => ({
      description: r.description,
      account: r.account,
      count: r.count,
      updatedAt: r.updatedAt,
    })),
    total: history.length,
  };
}
