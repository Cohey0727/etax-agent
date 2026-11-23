/**
 * csvCellParsing.ts — CSVセルの正規化（services/csvImport）。
 *
 * 日付（YYYY/MM/DD, YYYY-MM-DD, YYYYMMDD, YY/MM/DD, 年月日, 和暦, MM/DD/YYYY）と
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
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/(令和|平成)(\d{1,2})年(\d{1,2})月(\d{1,2})日/);
  if (m) {
    const base = m[1] === "令和" ? 2018 : 1988;
    return iso(base + Number(m[2]), Number(m[3]), Number(m[4]));
  }
  m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return iso(Number(m[3]), Number(m[1]), Number(m[2])); // MM/DD/YYYY
  m = s.match(/(\d{2})\D+(\d{1,2})\D+(\d{1,2})/);
  if (m) return iso(2000 + Number(m[1]), Number(m[2]), Number(m[3])); // YY/MM/DD
  return null;
}

/** 日付セルの見本から書式ラベルを推定する（表示・記録用）。 */
export function detectDateFormat(sample: string): string {
  const s = sample.trim();
  if (/(令和|平成)\d+年/.test(s)) return "和暦（YYYY年M月D日）";
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
