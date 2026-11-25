/**
 * decryptPdfTemplate.ts — 国税庁様式 PDF の暗号化解除と正規化（services/pdf）。
 *
 * 国税庁の様式 PDF は「権限管理のみの暗号化（空のユーザーパスワード、
 * Standard ハンドラ V=4 / R=4 / AESV2・128bit）」が掛かっている。
 * pdf-lib の ignoreEncryption は復号を行わないため、暗号化された
 * ストリーム（コンテンツ・オブジェクトストリーム等）が読めず読み込みに
 * 失敗する。そこで、テンプレート読み込み時にここで復号し、通常の
 * xref テーブル形式へ書き直して pdf-lib が読める形にする。
 *
 * 対応範囲: Standard ハンドラ R=3〜4、鍵長 128bit、暗号フィルタ AESV2
 * （文字列・ストリームとも）。暗号化されていない PDF はそのまま返す。
 * 対応できない暗号化・壊れた入力は例外にする（呼び出し側が 503 で案内）。
 * 復号鍵は /U の検証（アルゴリズム 3.6）で必ず確認してから使う。
 */
import { createDecipheriv, createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

/** パスワードのパディング（PDF 仕様の固定32バイト）。 */
const PASSWORD_PADDING = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
  0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

function md5(data: Buffer): Buffer {
  return createHash("md5").update(data).digest();
}

/** RC4（Node の crypto に無いため自前実装。鍵検証のアルゴリズム 3.6 で使う）。 */
function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256);
  for (let i = 0; i < 256; i++) s[i] = i;
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) % 256;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let a = 0;
  let b = 0;
  for (let n = 0; n < data.length; n++) {
    a = (a + 1) % 256;
    b = (b + s[a]) % 256;
    [s[a], s[b]] = [s[b], s[a]];
    out[n] = data[n] ^ s[(s[a] + s[b]) % 256];
  }
  return out;
}

// ---------------------------------------------------------------------------
// 最小 PDF パーサ（trailer・暗号辞書・間接オブジェクトの抽出に必要な範囲）
// ---------------------------------------------------------------------------

type PdfValue =
  | { type: "dict"; entries: Map<string, PdfValue> }
  | { type: "array"; items: PdfValue[] }
  | { type: "ref"; num: number; gen: number }
  | { type: "string"; bytes: Buffer }
  | { type: "name"; name: string }
  | { type: "number"; num: number }
  | { type: "bool"; value: boolean }
  | { type: "null" }
  | { type: "keyword"; word: string };

const WHITESPACE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set(["(", ")", "<", ">", "[", "]", "{", "}", "/", "%"]);

function skipWhitespaceAndComments(bytes: Buffer, pos: number): number {
  let p = pos;
  while (p < bytes.length) {
    const c = bytes[p];
    if (WHITESPACE.has(c)) {
      p++;
      continue;
    }
    if (c === 0x25) {
      // '%' コメントは行末まで
      while (p < bytes.length && bytes[p] !== 0x0a && bytes[p] !== 0x0d) p++;
      continue;
    }
    break;
  }
  return p;
}

/** リテラル文字列を開始位置（'(' の位置）から読み、デコード済みバイト列と終了位置を返す。 */
function readLiteralString(
  bytes: Buffer,
  pos: number,
): { data: Buffer; end: number } {
  const out: number[] = [];
  let depth = 1;
  let p = pos + 1;
  while (p < bytes.length && depth > 0) {
    const c = bytes[p];
    if (c === 0x5c) {
      // バックスラッシュエスケープ
      const next = bytes[p + 1];
      if (next === 0x6e) { out.push(0x0a); p += 2; }
      else if (next === 0x72) { out.push(0x0d); p += 2; }
      else if (next === 0x74) { out.push(0x09); p += 2; }
      else if (next === 0x62) { out.push(0x08); p += 2; }
      else if (next === 0x66) { out.push(0x0c); p += 2; }
      else if (next === 0x28 || next === 0x29 || next === 0x5c) { out.push(next); p += 2; }
      else if (next >= 0x30 && next <= 0x37) {
        let octal = "";
        let q = p + 1;
        while (q < bytes.length && octal.length < 3 && bytes[q] >= 0x30 && bytes[q] <= 0x37) {
          octal += String.fromCharCode(bytes[q]);
          q++;
        }
        out.push(parseInt(octal, 8) & 0xff);
        p = q;
      } else if (next === 0x0d || next === 0x0a) {
        // 行継続
        p += 2;
        if (next === 0x0d && bytes[p] === 0x0a) p++;
      } else {
        out.push(next);
        p += 2;
      }
      continue;
    }
    if (c === 0x28) depth++;
    if (c === 0x29) {
      depth--;
      if (depth === 0) {
        p++;
        break;
      }
    }
    out.push(c);
    p++;
  }
  return { data: Buffer.from(out), end: p };
}

/** 16進文字列を開始位置（'<' の位置）から読む。 */
function readHexString(bytes: Buffer, pos: number): { data: Buffer; end: number } {
  let hex = "";
  let p = pos + 1;
  while (p < bytes.length && bytes[p] !== 0x3e) {
    const c = bytes[p];
    if (!WHITESPACE.has(c)) hex += String.fromCharCode(c);
    p++;
  }
  if (hex.length % 2 === 1) hex += "0";
  return { data: Buffer.from(hex, "hex"), end: p + 1 };
}

/** 値を1つパースする。 */
function parseValue(bytes: Buffer, pos: number): { value: PdfValue; end: number } {
  const p = skipWhitespaceAndComments(bytes, pos);
  if (p >= bytes.length) throw new Error("PDF の値が途中で終わっています");
  const c = bytes[p];
  if (c === 0x3c && bytes[p + 1] === 0x3c) {
    // 辞書
    const entries = new Map<string, PdfValue>();
    let q = p + 2;
    for (;;) {
      q = skipWhitespaceAndComments(bytes, q);
      if (bytes[q] === 0x3e && bytes[q + 1] === 0x3e) {
        return { value: { type: "dict", entries }, end: q + 2 };
      }
      const key = parseValue(bytes, q);
      if (key.value.type !== "name") throw new Error("辞書キーが名前ではありません");
      const val = parseValue(bytes, key.end);
      entries.set(key.value.name, val.value);
      q = val.end;
    }
  }
  if (c === 0x3c) {
    const s = readHexString(bytes, p);
    return { value: { type: "string", bytes: s.data }, end: s.end };
  }
  if (c === 0x28) {
    const s = readLiteralString(bytes, p);
    return { value: { type: "string", bytes: s.data }, end: s.end };
  }
  if (c === 0x5b) {
    const items: PdfValue[] = [];
    let q = p + 1;
    for (;;) {
      q = skipWhitespaceAndComments(bytes, q);
      if (bytes[q] === 0x5d) return { value: { type: "array", items }, end: q + 1 };
      const item = parseValue(bytes, q);
      items.push(item.value);
      q = item.end;
    }
  }
  if (c === 0x2f) {
    // 名前（#XX エスケープをデコード）
    let q = p + 1;
    let name = "";
    while (q < bytes.length) {
      const ch = bytes[q];
      if (WHITESPACE.has(ch) || DELIMITERS.has(String.fromCharCode(ch))) break;
      if (ch === 0x23 && q + 2 < bytes.length) {
        name += String.fromCharCode(parseInt(bytes.toString("latin1", q + 1, q + 3), 16));
        q += 3;
        continue;
      }
      name += String.fromCharCode(ch);
      q++;
    }
    return { value: { type: "name", name }, end: q };
  }
  // 数値・キーワード・参照（数値 数値 R）
  let q = p;
  while (q < bytes.length) {
    const ch = bytes[q];
    if (WHITESPACE.has(ch) || DELIMITERS.has(String.fromCharCode(ch))) break;
    q++;
  }
  const word = bytes.toString("latin1", p, q);
  if (/^[+-]?\d+$/.test(word)) {
    // 参照かもしれない（後続が 数値 R なら参照）
    const afterFirst = skipWhitespaceAndComments(bytes, q);
    let r = afterFirst;
    while (r < bytes.length && bytes[r] >= 0x30 && bytes[r] <= 0x39) r++;
    const second = bytes.toString("latin1", afterFirst, r);
    const afterSecond = skipWhitespaceAndComments(bytes, r);
    if (second && bytes[afterSecond] === 0x52) {
      const afterR = afterSecond + 1;
      const nextCh = bytes[afterR];
      if (
        afterR >= bytes.length ||
        WHITESPACE.has(nextCh) ||
        DELIMITERS.has(String.fromCharCode(nextCh))
      ) {
        return {
          value: { type: "ref", num: parseInt(word, 10), gen: parseInt(second, 10) },
          end: afterR,
        };
      }
    }
    return { value: { type: "number", num: parseInt(word, 10) }, end: q };
  }
  if (/^[+-]?[\d.]+$/.test(word)) {
    return { value: { type: "number", num: parseFloat(word) }, end: q };
  }
  if (word === "true") return { value: { type: "bool", value: true }, end: q };
  if (word === "false") return { value: { type: "bool", value: false }, end: q };
  if (word === "null") return { value: { type: "null" }, end: q };
  return { value: { type: "keyword", word }, end: q };
}

function dictGet(value: PdfValue, key: string): PdfValue | undefined {
  return value.type === "dict" ? value.entries.get(key) : undefined;
}

/** PNG Predictor（10〜15）の解除。行頭のフィルタバイトに従って復元する。 */
function applyPngPredictor(data: Buffer, columns: number): Buffer {
  const rowLength = columns;
  const out = Buffer.alloc(Math.floor(data.length / (rowLength + 1)) * rowLength);
  let src = 0;
  let dst = 0;
  let prevRow = Buffer.alloc(rowLength);
  while (src + rowLength + 1 <= data.length) {
    const filter = data[src++];
    const row = Buffer.from(data.subarray(src, src + rowLength));
    src += rowLength;
    for (let i = 0; i < rowLength; i++) {
      const left = i > 0 ? row[i - 1] : 0;
      const up = prevRow[i];
      const upLeft = i > 0 ? prevRow[i - 1] : 0;
      if (filter === 0) {
        // そのまま
      } else if (filter === 1) {
        row[i] = (row[i] + left) & 0xff;
      } else if (filter === 2) {
        row[i] = (row[i] + up) & 0xff;
      } else if (filter === 3) {
        row[i] = (row[i] + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        row[i] = (row[i] + predictor) & 0xff;
      } else {
        throw new Error(`未対応の PNG Predictor フィルタです (${filter})`);
      }
    }
    row.copy(out, dst);
    dst += rowLength;
    prevRow = row;
  }
  return Buffer.from(out.subarray(0, dst));
}

/**
 * ストリームの生バイト列に /Filter（FlateDecode）と /DecodeParms
 * （Predictor）を適用して展開する。フィルタが無ければそのまま返す。
 */
function decodeStreamData(dict: PdfValue, raw: Buffer): Buffer {
  const filter = dictGet(dict, "Filter");
  const filterNames: string[] = [];
  if (filter?.type === "name") filterNames.push(filter.name);
  if (filter?.type === "array") {
    for (const item of filter.items) if (item.type === "name") filterNames.push(item.name);
  }
  if (filterNames.length === 0) return raw;
  if (!filterNames.every((name) => name === "FlateDecode" || name === "Fl")) {
    throw new Error(`未対応のストリームフィルタです (${filterNames.join(",")})`);
  }
  let data: Buffer = Buffer.from(inflateSync(raw));
  const parms = dictGet(dict, "DecodeParms") ?? dictGet(dict, "DP");
  const parmsDict =
    parms?.type === "dict"
      ? parms
      : parms?.type === "array" && parms.items[0]?.type === "dict"
        ? parms.items[0]
        : undefined;
  if (parmsDict) {
    const predictor = numberOf(dictGet(parmsDict, "Predictor")) ?? 1;
    if (predictor >= 10) {
      const columns = numberOf(dictGet(parmsDict, "Columns")) ?? 1;
      data = applyPngPredictor(data, columns);
    } else if (predictor !== 1) {
      throw new Error(`未対応の Predictor です (${predictor})`);
    }
  }
  return data;
}

function numberOf(value: PdfValue | undefined): number | null {
  return value?.type === "number" ? value.num : null;
}

function refOf(value: PdfValue | undefined): { num: number; gen: number } | null {
  return value?.type === "ref" ? { num: value.num, gen: value.gen } : null;
}

// ---------------------------------------------------------------------------
// xref（テーブル / ストリーム / ハイブリッド）の解決
// ---------------------------------------------------------------------------

interface XrefEntry {
  type: 0 | 1 | 2;
  /** type1: バイトオフセット / type2: オブジェクトストリーム番号 */
  field2: number;
  /** type1: 世代番号 / type2: オブジェクトストリーム内のインデックス */
  field3: number;
}

interface ParsedObject {
  num: number;
  gen: number;
  /** オブジェクト本体（obj 〜 endobj の内側。ストリーム部を除く値の範囲） */
  valueStart: number;
  valueEnd: number;
  value: PdfValue;
  /** ストリームデータの範囲（無ければ null） */
  stream: { start: number; length: number } | null;
}

/** 生バイト列から間接オブジェクトを1つ読む（オフセット位置から）。 */
function readIndirectObject(
  bytes: Buffer,
  offset: number,
  resolveLength: (ref: { num: number; gen: number }) => number | null,
): ParsedObject {
  const header = /^(\d+)\s+(\d+)\s+obj\b/.exec(bytes.toString("latin1", offset, offset + 64));
  if (!header) throw new Error(`間接オブジェクトのヘッダが読めません (offset ${offset})`);
  const num = parseInt(header[1], 10);
  const gen = parseInt(header[2], 10);
  const valueStart = offset + header[0].length;
  const parsed = parseValue(bytes, valueStart);
  let stream: ParsedObject["stream"] = null;
  const afterValue = skipWhitespaceAndComments(bytes, parsed.end);
  if (bytes.toString("latin1", afterValue, afterValue + 6) === "stream") {
    let dataStart = afterValue + 6;
    if (bytes[dataStart] === 0x0d && bytes[dataStart + 1] === 0x0a) dataStart += 2;
    else if (bytes[dataStart] === 0x0a || bytes[dataStart] === 0x0d) dataStart += 1;
    let length = numberOf(dictGet(parsed.value, "Length"));
    if (length === null) {
      const ref = refOf(dictGet(parsed.value, "Length"));
      if (ref) length = resolveLength(ref);
    }
    if (length === null) throw new Error(`ストリームの /Length が解決できません (obj ${num})`);
    stream = { start: dataStart, length };
  }
  return { num, gen, valueStart, valueEnd: parsed.end, value: parsed.value, stream };
}

// ---------------------------------------------------------------------------
// 暗号（Standard ハンドラ R=4 / AESV2）の鍵計算と復号
// ---------------------------------------------------------------------------

interface EncryptionInfo {
  o: Buffer;
  u: Buffer;
  p: number;
  id0: Buffer;
  keyLength: number; // バイト数
  encryptMetadata: boolean;
}

/** ファイル暗号鍵を計算し、/U で検証する（アルゴリズム 3.2 / 3.6）。 */
function computeFileKey(enc: EncryptionInfo): Buffer {
  const data = Buffer.concat([
    PASSWORD_PADDING,
    enc.o,
    Buffer.from([
      enc.p & 0xff,
      (enc.p >> 8) & 0xff,
      (enc.p >> 16) & 0xff,
      (enc.p >> 24) & 0xff,
    ]),
    enc.id0,
    ...(enc.encryptMetadata ? [] : [Buffer.from([0xff, 0xff, 0xff, 0xff])]),
  ]);
  let digest = md5(data);
  for (let i = 0; i < 50; i++) digest = md5(digest.subarray(0, enc.keyLength));
  const key = Buffer.from(digest.subarray(0, enc.keyLength));
  // /U の検証（R>=3）: MD5(パディング + ID0) を RC4 で20回（鍵を i と XOR しながら）暗号化した先頭16バイトと比べる。
  let check = md5(Buffer.concat([PASSWORD_PADDING, enc.id0]));
  let rc4Key = key;
  check = rc4(rc4Key, check);
  for (let i = 1; i <= 19; i++) {
    rc4Key = Buffer.from(key.map((b) => b ^ i));
    check = rc4(rc4Key, check);
  }
  if (!check.equals(enc.u.subarray(0, 16))) {
    throw new Error("様式 PDF の暗号鍵を検証できませんでした（想定外の暗号設定）");
  }
  return key;
}

/** オブジェクト単位の復号（アルゴリズム 3.1、AESV2）。 */
function decryptObjectData(fileKey: Buffer, num: number, gen: number, data: Buffer): Buffer {
  const keyMaterial = Buffer.concat([
    fileKey,
    Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]),
    Buffer.from("sAlT", "latin1"),
  ]);
  const objectKey = md5(keyMaterial).subarray(0, Math.min(fileKey.length + 5, 16));
  if (data.length <= 16) return Buffer.alloc(0);
  const iv = data.subarray(0, 16);
  const decipher = createDecipheriv("aes-128-cbc", objectKey, iv);
  try {
    return Buffer.from(
      Buffer.concat([decipher.update(data.subarray(16)), decipher.final()]),
    );
  } catch {
    throw new Error(
      `様式 PDF のオブジェクト復号に失敗しました (obj ${num}, ${data.length} bytes)`,
    );
  }
}

// ---------------------------------------------------------------------------
// 文字列の復号（オブジェクト本体のバイト列を走査して文字列だけ差し替える）
// ---------------------------------------------------------------------------

/**
 * オブジェクト本体（ストリーム部を除く）のバイト列に含まれる文字列
 * リテラル・16進文字列をすべて復号し、16進文字列として書き直した
 * バイト列を返す。辞書の /Length（数値または参照）は newStreamLength が
 * 与えられた場合に新しい長さへ差し替える。
 */
function decryptStringsInBody(
  body: Buffer,
  fileKey: Buffer,
  num: number,
  gen: number,
  newStreamLength: number | null,
): Buffer {
  const chunks: Buffer[] = [];
  let pos = 0;
  let lengthReplaced = false;
  while (pos < body.length) {
    const c = body[pos];
    if (c === 0x3c && body[pos + 1] === 0x3c) {
      // 辞書の開始 '<<' は16進文字列ではないのでそのままコピーする
      chunks.push(body.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (c === 0x28) {
      const s = readLiteralString(body, pos);
      const plain = decryptObjectData(fileKey, num, gen, s.data);
      chunks.push(Buffer.from(`<${plain.toString("hex")}>`, "latin1"));
      pos = s.end;
      continue;
    }
    if (c === 0x3c && body[pos + 1] !== 0x3c) {
      const s = readHexString(body, pos);
      const plain = decryptObjectData(fileKey, num, gen, s.data);
      chunks.push(Buffer.from(`<${plain.toString("hex")}>`, "latin1"));
      pos = s.end;
      continue;
    }
    if (c === 0x25) {
      // コメントはそのまま（行末までコピー）
      let end = pos;
      while (end < body.length && body[end] !== 0x0a && body[end] !== 0x0d) end++;
      chunks.push(body.subarray(pos, end));
      pos = end;
      continue;
    }
    if (
      newStreamLength !== null &&
      !lengthReplaced &&
      c === 0x2f &&
      body.toString("latin1", pos, pos + 7) === "/Length" &&
      !/[0-9]/.test(String.fromCharCode(body[pos + 7] ?? 0x20))
    ) {
      // /Length の値（数値 or 参照）を新しい長さの数値へ差し替える
      const valuePos = skipWhitespaceAndComments(body, pos + 7);
      const parsed = parseValue(body, valuePos);
      chunks.push(Buffer.from(`/Length ${newStreamLength}`, "latin1"));
      pos = parsed.end;
      lengthReplaced = true;
      continue;
    }
    chunks.push(body.subarray(pos, pos + 1));
    pos++;
  }
  return Buffer.concat(chunks);
}

// ---------------------------------------------------------------------------
// 本体
// ---------------------------------------------------------------------------

/** startxref の指す位置から xref を読み、エントリと trailer 辞書を返す。 */
function readXrefAt(
  bytes: Buffer,
  offset: number,
  entries: Map<number, XrefEntry>,
  state: { trailer: PdfValue | null },
  resolveLength: (ref: { num: number; gen: number }) => number | null,
): void {
  const head = bytes.toString("latin1", offset, offset + 32);
  if (/^\d+\s+\d+\s+obj\b/.test(head)) {
    // xref ストリーム
    const obj = readIndirectObject(bytes, offset, resolveLength);
    const dict = obj.value;
    const w = dictGet(dict, "W");
    const size = numberOf(dictGet(dict, "Size")) ?? 0;
    if (w?.type !== "array" || !obj.stream) throw new Error("xref ストリームの形が不正です");
    const widths = w.items.map((item) => numberOf(item) ?? 0);
    const raw = bytes.subarray(obj.stream.start, obj.stream.start + obj.stream.length);
    const data = decodeStreamData(dict, Buffer.from(raw));
    const indexValue = dictGet(dict, "Index");
    const ranges: [number, number][] = [];
    if (indexValue?.type === "array") {
      for (let i = 0; i + 1 < indexValue.items.length; i += 2) {
        ranges.push([
          numberOf(indexValue.items[i]) ?? 0,
          numberOf(indexValue.items[i + 1]) ?? 0,
        ]);
      }
    } else {
      ranges.push([0, size]);
    }
    let cursor = 0;
    for (const [start, count] of ranges) {
      for (let i = 0; i < count; i++) {
        const fields = [0, 0, 0];
        for (let f = 0; f < 3; f++) {
          let v = 0;
          for (let b = 0; b < widths[f]; b++) v = v * 256 + (data[cursor++] ?? 0);
          fields[f] = v;
        }
        const objNum = start + i;
        if (widths[0] === 0) fields[0] = 1; // 省略時の既定は type 1
        if (!entries.has(objNum) && fields[0] !== 0) {
          entries.set(objNum, {
            type: fields[0] as 1 | 2,
            field2: fields[1],
            field3: fields[2],
          });
        }
      }
    }
    if (!state.trailer) state.trailer = dict;
    const xrefStm = numberOf(dictGet(dict, "XRefStm"));
    if (xrefStm !== null) readXrefAt(bytes, xrefStm, entries, state, resolveLength);
    const prev = numberOf(dictGet(dict, "Prev"));
    if (prev !== null) readXrefAt(bytes, prev, entries, state, resolveLength);
    return;
  }
  if (head.startsWith("xref")) {
    // 従来型 xref テーブル
    let pos = offset + 4;
    for (;;) {
      pos = skipWhitespaceAndComments(bytes, pos);
      if (bytes.toString("latin1", pos, pos + 7) === "trailer") {
        const trailer = parseValue(bytes, pos + 7);
        if (!state.trailer) state.trailer = trailer.value;
        const prev = numberOf(dictGet(trailer.value, "Prev"));
        if (prev !== null) readXrefAt(bytes, prev, entries, state, resolveLength);
        const xrefStm = numberOf(dictGet(trailer.value, "XRefStm"));
        if (xrefStm !== null) readXrefAt(bytes, xrefStm, entries, state, resolveLength);
        return;
      }
      const sectionHead = /^(\d+)\s+(\d+)\s*\r?\n/.exec(bytes.toString("latin1", pos, pos + 32));
      if (!sectionHead) throw new Error("xref テーブルの節が読めません");
      const start = parseInt(sectionHead[1], 10);
      const count = parseInt(sectionHead[2], 10);
      pos += sectionHead[0].length;
      for (let i = 0; i < count; i++) {
        const line = bytes.toString("latin1", pos, pos + 20);
        const m = /^(\d{10})\s(\d{5})\s([nf])/.exec(line);
        if (!m) throw new Error("xref テーブルの行が読めません");
        if (m[3] === "n" && !entries.has(start + i)) {
          entries.set(start + i, {
            type: 1,
            field2: parseInt(m[1], 10),
            field3: parseInt(m[2], 10),
          });
        }
        pos += m[0].length;
        while (pos < bytes.length && (bytes[pos] === 0x20 || bytes[pos] === 0x09)) pos++;
        if (bytes[pos] === 0x0d) pos++;
        if (bytes[pos] === 0x0a) pos++;
      }
    }
  }
  throw new Error("xref の位置が不正です");
}

/**
 * テンプレートローダ用: 復号できれば復号済みバイト列、失敗したら null を返す。
 */
export function normalizeFormTemplate(bytes: Uint8Array): Uint8Array | null {
  try {
    return decryptPdfTemplate(bytes);
  } catch {
    return null;
  }
}

/**
 * 様式 PDF のバイト列を受け、pdf-lib で読めるバイト列を返す。
 * 暗号化されていなければ入力をそのまま返す。
 */
export function decryptPdfTemplate(input: Uint8Array): Uint8Array {
  const bytes = Buffer.from(input);
  // 最後の startxref（最新の xref 位置）を使う
  const startxrefMatches = [...bytes.toString("latin1").matchAll(/startxref\s*(\d+)/g)];
  if (startxrefMatches.length === 0) {
    throw new Error("様式 PDF の startxref が見つかりません");
  }
  const startxref = parseInt(startxrefMatches[startxrefMatches.length - 1][1], 10);

  const entries = new Map<number, XrefEntry>();
  const state: { trailer: PdfValue | null } = { trailer: null };
  // /Length 参照の解決用: 対象オブジェクトを直接読む（数値オブジェクト前提）
  const objectCache = new Map<number, ParsedObject>();
  const resolveLength = (ref: { num: number; gen: number }): number | null => {
    const entry = entries.get(ref.num);
    if (!entry || entry.type !== 1) return null;
    try {
      const obj = readIndirectObject(bytes, entry.field2, () => null);
      return numberOf(obj.value);
    } catch {
      return null;
    }
  };
  readXrefAt(bytes, startxref, entries, state, resolveLength);
  const trailer = state.trailer;
  if (!trailer) throw new Error("様式 PDF の trailer が読めません");

  const encryptRef = refOf(dictGet(trailer, "Encrypt"));
  const encryptValue = dictGet(trailer, "Encrypt");
  if (!encryptValue) return input; // 暗号化されていない

  // 全オブジェクトを読み出す
  const readObject = (num: number): ParsedObject => {
    const cached = objectCache.get(num);
    if (cached) return cached;
    const entry = entries.get(num);
    if (!entry || entry.type !== 1) throw new Error(`オブジェクト ${num} が読めません`);
    const obj = readIndirectObject(bytes, entry.field2, resolveLength);
    objectCache.set(num, obj);
    return obj;
  };

  const encryptDict = encryptRef ? readObject(encryptRef.num).value : encryptValue;
  const v = numberOf(dictGet(encryptDict, "V"));
  const r = numberOf(dictGet(encryptDict, "R"));
  const lengthBits = numberOf(dictGet(encryptDict, "Length")) ?? 40;
  const cf = dictGet(encryptDict, "CF");
  const stdCf = cf ? dictGet(cf, "StdCF") : undefined;
  const cfm = stdCf ? dictGet(stdCf, "CFM") : undefined;
  if (v !== 4 || (r !== 3 && r !== 4) || lengthBits !== 128 || cfm?.type !== "name" || cfm.name !== "AESV2") {
    throw new Error(`未対応の様式 PDF 暗号化です (V=${v} R=${r} Length=${lengthBits})`);
  }
  const oValue = dictGet(encryptDict, "O");
  const uValue = dictGet(encryptDict, "U");
  const pValue = numberOf(dictGet(encryptDict, "P"));
  const idValue = dictGet(trailer, "ID");
  if (
    oValue?.type !== "string" ||
    uValue?.type !== "string" ||
    pValue === null ||
    idValue?.type !== "array" ||
    idValue.items[0]?.type !== "string"
  ) {
    throw new Error("様式 PDF の暗号辞書が不正です");
  }
  const encryptMetadataValue = dictGet(encryptDict, "EncryptMetadata");
  const fileKey = computeFileKey({
    o: oValue.bytes,
    u: uValue.bytes,
    p: pValue,
    id0: (idValue.items[0] as { type: "string"; bytes: Buffer }).bytes,
    keyLength: lengthBits / 8,
    encryptMetadata: encryptMetadataValue?.type === "bool" ? encryptMetadataValue.value : true,
  });

  // オブジェクトストリーム内のオブジェクトを展開する
  const bodies = new Map<number, { gen: number; body: Buffer }>();
  const streamObjectNums = new Set<number>();
  for (const [num, entry] of entries) {
    if (encryptRef && num === encryptRef.num) continue;
    if (entry.type === 1) {
      const obj = readObject(num);
      const typeName = dictGet(obj.value, "Type");
      if (typeName?.type === "name" && typeName.name === "XRef") continue; // xref ストリームは捨てる
      if (typeName?.type === "name" && typeName.name === "ObjStm") {
        streamObjectNums.add(num);
        continue;
      }
      let body: Buffer<ArrayBufferLike> = bytes.subarray(obj.valueStart, obj.valueEnd);
      let streamData: Buffer<ArrayBufferLike> | null = null;
      if (obj.stream) {
        const rawStream = bytes.subarray(
          obj.stream.start,
          obj.stream.start + obj.stream.length,
        );
        streamData = decryptObjectData(fileKey, num, obj.gen, rawStream);
      }
      body = decryptStringsInBody(
        Buffer.from(body),
        fileKey,
        num,
        obj.gen,
        streamData ? streamData.length : null,
      );
      if (streamData) {
        body = Buffer.concat([
          body,
          Buffer.from("\nstream\n", "latin1"),
          streamData,
          Buffer.from("\nendstream", "latin1"),
        ]);
      }
      bodies.set(num, { gen: obj.gen, body });
    }
  }
  // オブジェクトストリームの中身（文字列はそのオブジェクト自身の鍵で復号する）
  for (const stmNum of streamObjectNums) {
    const obj = readObject(stmNum);
    if (!obj.stream) continue;
    const rawStream = bytes.subarray(obj.stream.start, obj.stream.start + obj.stream.length);
    const plain = decryptObjectData(fileKey, stmNum, obj.gen, rawStream);
    const data = decodeStreamData(obj.value, plain);
    const n = numberOf(dictGet(obj.value, "N")) ?? 0;
    const first = numberOf(dictGet(obj.value, "First")) ?? 0;
    const headerText = data.toString("latin1", 0, first);
    const pairs = headerText.trim().split(/\s+/).map((s) => parseInt(s, 10));
    for (let i = 0; i < n; i++) {
      const objNum = pairs[i * 2];
      const offsetInStm = pairs[i * 2 + 1];
      const nextOffset = i + 1 < n ? pairs[(i + 1) * 2 + 1] : data.length - first;
      // オブジェクトストリーム内の文字列は個別には暗号化されていない
      // （ストリーム全体が暗号化される）ので、そのまま使う。
      const rawBody = data.subarray(first + offsetInStm, first + nextOffset);
      bodies.set(objNum, { gen: 0, body: Buffer.from(rawBody) });
    }
  }

  // 書き直し: 間接オブジェクトを並べ、xref テーブルと trailer を付け直す
  const out: Buffer[] = [Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  let cursor = out[0].length;
  const offsets = new Map<number, number>();
  const sortedNums = [...bodies.keys()].sort((a, b) => a - b);
  for (const num of sortedNums) {
    const { gen, body } = bodies.get(num)!;
    const header = Buffer.from(`${num} ${gen} obj\n`, "latin1");
    const footer = Buffer.from("\nendobj\n", "latin1");
    offsets.set(num, cursor);
    out.push(header, body, footer);
    cursor += header.length + body.length + footer.length;
  }
  const maxNum = sortedNums.length ? sortedNums[sortedNums.length - 1] : 0;
  const xrefStart = cursor;
  const xrefLines: string[] = [`xref\n0 ${maxNum + 1}\n`, "0000000000 65535 f \n"];
  for (let num = 1; num <= maxNum; num++) {
    const body = bodies.get(num);
    if (body && offsets.has(num)) {
      xrefLines.push(
        `${String(offsets.get(num)).padStart(10, "0")} ${String(body.gen).padStart(5, "0")} n \n`,
      );
    } else {
      xrefLines.push("0000000000 65535 f \n");
    }
  }
  const rootRef = refOf(dictGet(trailer, "Root"));
  if (!rootRef) throw new Error("様式 PDF の /Root が読めません");
  const infoRef = refOf(dictGet(trailer, "Info"));
  const trailerParts = [
    `trailer\n<< /Size ${maxNum + 1} /Root ${rootRef.num} ${rootRef.gen} R`,
  ];
  if (infoRef && bodies.has(infoRef.num)) {
    trailerParts.push(`/Info ${infoRef.num} ${infoRef.gen} R`);
  }
  trailerParts.push(`>>\nstartxref\n${xrefStart}\n%%EOF\n`);
  out.push(Buffer.from(xrefLines.join("") + trailerParts.join(" "), "latin1"));
  return new Uint8Array(Buffer.concat(out));
}
