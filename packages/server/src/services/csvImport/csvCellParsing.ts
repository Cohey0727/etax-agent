/**
 * csvCellParsing.ts — CSVセルの正規化（services/csvImport）。
 *
 * 日付（YYYY/MM/DD, YYYY-MM-DD, YYYYMMDD, YY/MM/DD, 年月日, 和暦とその略記
 * R6.1.5・H31.4.30, MM/DD/YYYY）と
 * 金額（全角数字・カンマ・¥・円・括弧マイナス・▲△）を内部形式へ寄せる。
 */

/** 年月日から ISO 日付文字列を作る。実在しない日付なら null。 */
function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 日付セル文字列を YYYY-MM-DD に正規化する。解釈できなければ null。 */
export function parseDateCell(raw: string): string | null {
  // 全角数字は半角へ寄せてから解釈する（例: ２０２４年１月５日）。
  const s = raw
    .trim()
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  if (!s) return null;
  // 和暦（令和6年1月5日）と、その略記（R6.1.5・令和6/1/5）。略記はセルの先頭が
  // 元号の場合に限る（R・H の1文字は文中にも現れるため）。
  let m =
    s.match(/(令和|平成)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日/) ??
    s.match(/^(令和|平成|[RrHh])\s*(元|\d{1,2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) {
    const base = /^(令和|R)$/i.test(m[1] ?? "") ? 2018 : 1988;
    const eraYear = m[2] === "元" ? 1 : Number(m[2]);
    return iso(base + eraYear, Number(m[3]), Number(m[4]));
  }
  m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return iso(Number(m[3]), Number(m[1]), Number(m[2])); // MM/DD/YYYY
  m = s.match(/^(\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  // YY/MM/DD は先頭から読む（途中の数字から読むと、未知の略記の年を西暦と取り違える）
  if (m) return iso(2000 + Number(m[1]), Number(m[2]), Number(m[3]));
  return null;
}

/** 日付セルの見本から書式ラベルを推定する（表示・記録用）。 */
export function detectDateFormat(sample: string): string {
  const s = sample.trim();
  if (/(令和|平成)\d+年/.test(s)) return "和暦（YYYY年M月D日）";
  if (/^(令和|平成|[RrHh])\s*(元|\d{1,2})[./-]/.test(s)) return "和暦の略記（R6.1.5）";
  if (/^\d{8}$/.test(s.replace(/[/-]/g, "")) && /^\d{8}/.test(s)) return "YYYYMMDD";
  if (/\d{4}年\d{1,2}月\d{1,2}日/.test(s)) return "YYYY年M月D日";
  if (/\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) return "YYYY/MM/DD";
  if (/\d{4}-\d{1,2}-\d{1,2}/.test(s)) return "YYYY-MM-DD";
  if (/\d{1,2}\/\d{1,2}\/\d{4}/.test(s)) return "MM/DD/YYYY";
  if (/\d{2}\/\d{1,2}\/\d{1,2}/.test(s)) return "YY/MM/DD";
  return "不明";
}

/**
 * 金額セルを整数にする。全角数字・カンマ・¥・円・括弧（マイナス表記）・
 * ▲△（マイナス表記）に対応。読めなければ null。
 */
export function parseAmountCell(raw: string): number | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  // 全角括弧（マイナス表記）と全角マイナス・負号を半角へ寄せる。
  s = s.replace(/（/g, "(").replace(/）/g, ")").replace(/[－−]/g, "-");
  s = s.replace(/[￥¥,、\s円]/g, "");
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^[▲△-]/.test(s)) {
    neg = true;
    s = s.replace(/^[▲△-]/, "");
  }
  if (!s || s === "-") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(neg ? -Math.abs(n) : n);
}
