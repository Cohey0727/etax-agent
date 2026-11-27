/**
 * searchTaxKnowledge.ts — 税務知識ベースの検索（services/knowledge）。
 *
 * エージェント（アプリ内・MCP）が税制のルールや手続きで迷ったときに引く検索口。
 * pg_trgm インデックスを使った部分一致検索を主にし、3文字未満の語しか
 * 無い場合や trigram で引けない場合は ILIKE 検索にフォールバックする。
 * 出典番号（例: 2072）がクエリに含まれていれば、そのドキュメントを先頭に置く。
 */
import { getDb } from "../../lib/db";
import {
  findKnowledgeDocByNumber,
  searchKnowledgeLike,
  searchKnowledgeTrgm,
} from "../../repositories/knowledgeRepository";
import { KnowledgeDocRow } from "../../repositories/schema";

export interface TaxKnowledgeHit {
  /** 出典番号（タックスアンサー番号）。 */
  number: string;
  title: string;
  category: string;
  sourceUrl: string;
  /** 検索語の周辺を切り出した本文抜粋。 */
  excerpt: string;
}

export interface TaxKnowledgeSearchResult {
  ok: true;
  query: string;
  hits: TaxKnowledgeHit[];
}

/**
 * クエリを検索語に分解する（空白区切り、句読点や記号は落とす）。
 * 出典の表記「No.2072」「No2072」は番号だけの語にする（本文の表記は
 * 「コード2072」なので、接頭辞つきのままでは番号でも本文でも当たらない）。
 */
function splitTerms(query: string): string[] {
  // 全角英数（例: ２０７２）や半角カタカナで入力されても本文に当たるよう正規化する。
  return query
    .normalize("NFKC")
    .split(/[\s　]+/)
    .map((term) =>
      term
        .replace(/["'「」『』（）()、。・:：/／]/g, "")
        .replace(/^no\.?(?=\d*$)/i, "")
        .trim(),
    )
    .filter((term) => term.length >= 2);
}

/** 本文から検索語の周辺を抜粋する（見つからなければ先頭から）。 */
function makeExcerpt(content: string, terms: string[]): string {
  const WIDTH = 320;
  let index = -1;
  for (const term of terms) {
    const found = content.indexOf(term);
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }
  if (index < 0) return content.slice(0, WIDTH);
  const start = Math.max(0, index - 60);
  const head = start > 0 ? "…" : "";
  const tail = start + WIDTH < content.length ? "…" : "";
  return head + content.slice(start, start + WIDTH) + tail;
}

function toHit(row: KnowledgeDocRow, terms: string[]): TaxKnowledgeHit {
  return {
    number: row.number,
    title: row.title,
    category: row.category,
    sourceUrl: row.sourceUrl,
    excerpt: makeExcerpt(row.content, terms),
  };
}

/**
 * 税務知識ベースを検索する。DB が開けない・該当なしの場合は hits が空で返る
 * （呼び出し側のエージェントは「知識ベースに無い」と判断して、その旨を伝える）。
 */
export async function searchTaxKnowledge(
  query: string,
  limit = 5,
): Promise<TaxKnowledgeSearchResult> {
  const db = getDb();
  if (!db) return { ok: true, query, hits: [] };
  const terms = splitTerms(query);
  if (terms.length === 0) return { ok: true, query, hits: [] };

  const hits: TaxKnowledgeHit[] = [];
  const seen = new Set<number>();

  // 出典番号の完全一致（例: "2072" や "No.2072"）は最優先で1件置く。
  const numberTerm = terms.find((term) => /^\d{4}$/.test(term));
  if (numberTerm) {
    const byNumber = await findKnowledgeDocByNumber(db, numberTerm);
    if (byNumber) {
      hits.push(toHit(byNumber, terms));
      seen.add(byNumber.id);
    }
  }

  // trigram は3文字以上の語で引く。タイトル一致・出現位置の順に並べる。
  const trgmTerms = terms.filter((term) => term.length >= 3);
  if (trgmTerms.length > 0) {
    try {
      for (const term of trgmTerms) {
        if (hits.length >= limit) break;
        for (const row of await searchKnowledgeTrgm(db, term, limit + hits.length)) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          hits.push(toHit(row, terms));
          if (hits.length >= limit) break;
        }
      }
    } catch {
      // trigram 検索が使えない環境では ILIKE に落とす（下で実行される）。
    }
  }

  // trigram で不足する場合は ILIKE で補う（2文字の語はこちらでしか引けない）。
  if (hits.length < limit) {
    for (const term of terms) {
      if (hits.length >= limit) break;
      for (const row of await searchKnowledgeLike(db, term, limit)) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        hits.push(toHit(row, terms));
        if (hits.length >= limit) break;
      }
    }
  }

  return { ok: true, query, hits: hits.slice(0, limit) };
}
