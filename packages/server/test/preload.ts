/**
 * preload.ts — server のテスト実行前に1回だけ読み込む共通設定。
 *
 * データフォルダ（ETAX_DATA_DIR）を毎回新しい一時フォルダへ向ける。
 * 学習履歴・設定ファイル・ローカル保存の証憑はデータフォルダへ書かれ、
 * 所有者 1 の分は実運用と同じファイル名になるため、実運用の
 * packages/server/data を指したままテストすると履歴が汚れる。
 * シェルに ETAX_DATA_DIR が設定されていても上書きする。
 *
 * PDF 系のテストが使う日本語フォントと様式 PDF は、実運用の data に
 * 置かれていればコピーしておく（様式は無ければ取得して forms へ保存
 * されるので、コピー先に置いて実運用側へは書かせない）。
 */
import { cpSync, existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const productionDataDir = join(import.meta.dir, "../data");
const testDataDir = mkdtempSync(join(tmpdir(), "etax-server-test-data-"));

for (const name of ["fonts", "forms"]) {
  const source = join(productionDataDir, name);
  if (existsSync(source)) cpSync(source, join(testDataDir, name), { recursive: true });
}

process.env.ETAX_DATA_DIR = testDataDir;
