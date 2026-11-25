/**
 * xsdValidator.ts — 生成した XTX の公式 XML スキーマ検証（services/etax）。
 *
 * XTX 生成時に常時実行する（Issue #28 Phase 1）。検証エンジンは
 * テストで実績のある python3 + lxml（packages/shared/assets/
 * validate-xtx-xsd.py）をサブプロセスで使う。公式 XSD は shared の
 * assets/etax-xsd に同梱し、環境変数 ETAX_XSD_DIR があればそちらを優先する。
 *
 * 結果は3値で返す:
 * - valid: 公式スキーマを通った
 * - invalid: スキーマ違反（生成を止める。理由は errors に入る）
 * - unavailable: 検証できなかった（XSD 未同梱・検証エンジン不在など）。
 *   呼び出し側は必ず警告として表面化させること（無言スキップ禁止）。
 *   例: 所得税2026年分の RKO0010-260.xsd は令和9年1月受付開始分で
 *   公開予定のため、公開までは同梱できず unavailable になる。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type XtxXsdValidation =
  | { kind: "valid" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "unavailable"; reason: string };

/** 手続ルート要素のプレフィックス → XSD フォルダ名。 */
const PROCEDURE_FOLDERS: Record<string, string> = {
  RKO: "shotoku",
  RSH: "shohi",
};

const VALIDATION_TIMEOUT_MS = 30_000;

/**
 * XTX の手続ルート要素（例: <RKO0010 VR="25.0.1"）から、対応する公式
 * XSD の相対パス（例: shotoku/RKO0010-250.xsd）を決める。ファイル名の
 * 末尾3桁は手続 VR の上位2要素（25.0.1 → 250、26.0.0 → 260）。
 * 手続要素が見つからなければ null。
 */
export function etaxSchemaRelativePath(xtx: string): string | null {
  const match = /<((?:RKO|RSH)\d{4})\s+VR="(\d+)\.(\d+)\./.exec(xtx);
  if (!match) return null;
  const procedure = match[1]!;
  const folder = PROCEDURE_FOLDERS[procedure.slice(0, 3)];
  if (!folder) return null;
  return `${folder}/${procedure}-${match[2]}${match[3]}.xsd`;
}

/** 同梱 XSD ディレクトリ（shared パッケージの assets）。 */
function bundledXsdDir(): string {
  return join(import.meta.dir, "../../../../shared/assets/etax-xsd");
}

/** 検証スクリプト（shared パッケージの assets に同梱）。 */
function validationScriptPath(): string {
  return join(import.meta.dir, "../../../../shared/assets/validate-xtx-xsd.py");
}

/**
 * 使用する XSD ディレクトリを決める。ETAX_XSD_DIR があればそちら、
 * 無ければ同梱資産。どちらも存在しなければ null。
 */
export function resolveEtaxXsdDir(): string | null {
  const fromEnv = process.env.ETAX_XSD_DIR;
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const bundled = bundledXsdDir();
  return existsSync(bundled) ? bundled : null;
}

/**
 * 生成直後の XTX を公式スキーマで検証する。検証エンジン
 * （python3 + lxml）が無い環境では unavailable を返す。
 */
export function validateXtxWithOfficialXsd(xtx: string): XtxXsdValidation {
  const relativePath = etaxSchemaRelativePath(xtx);
  if (!relativePath) {
    return { kind: "unavailable", reason: "XTXから手続とバージョンを特定できませんでした" };
  }
  const xsdDir = resolveEtaxXsdDir();
  if (!xsdDir) {
    return {
      kind: "unavailable",
      reason: "公式XMLスキーマ（XSD）が配置されていないため、スキーマ検証を行えませんでした",
    };
  }
  if (!existsSync(join(xsdDir, relativePath))) {
    return {
      kind: "unavailable",
      reason: `公式XMLスキーマ ${relativePath} が未同梱のため、スキーマ検証を行えませんでした（未公開の年分では公開後に同梱されます）`,
    };
  }
  const script = validationScriptPath();
  if (!existsSync(script)) {
    return { kind: "unavailable", reason: "スキーマ検証スクリプトが配置されていません" };
  }
  const dir = mkdtempSync(join(tmpdir(), "etax-xsd-validate-"));
  try {
    const xmlPath = join(dir, "filing.xtx");
    writeFileSync(xmlPath, xtx);
    const result = spawnSync("python3", [script, xsdDir, `${xmlPath}:${relativePath}`], {
      encoding: "utf-8",
      timeout: VALIDATION_TIMEOUT_MS,
    });
    if (result.error) {
      return {
        kind: "unavailable",
        reason: `スキーマ検証エンジン（python3）を実行できませんでした: ${result.error.message}`,
      };
    }
    const stdout = result.stdout ?? "";
    const lines = stdout.split("\n").map((line) => line.trim());
    // "INVALID" は "VALID" を部分文字列に含むため、行頭で判定する。
    if (lines.some((line) => line.startsWith("INVALID"))) {
      const errors = lines
        .filter((line) => line.startsWith("line "))
        .map((line) => line.replace(/^line \d+: /, ""));
      return {
        kind: "invalid",
        errors: errors.length > 0 ? errors : ["公式XMLスキーマに適合しませんでした"],
      };
    }
    if (lines.some((line) => line.startsWith("VALID"))) return { kind: "valid" };
    // スクリプトが検証結果を出さずに終わった（lxml 不在など）。
    const detail = (result.stderr ?? "").includes("lxml")
      ? "python3 の lxml がインストールされていません"
      : "検証スクリプトが結果を返しませんでした";
    return { kind: "unavailable", reason: `スキーマ検証を実行できませんでした: ${detail}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
