/**
 * xsdValidator.ts — 生成した XTX の公式 XML スキーマ検証（services/etax）。
 *
 * XTX 生成時に常時実行する。検証エンジンは python3 + lxml
 * （packages/shared/assets/validate-xtx-xsd.py）で、他のリクエストを
 * 止めないよう非同期のサブプロセスで動かす。公式 XSD は shared の
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
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type XtxXsdValidation =
  | { kind: "valid" }
  | { kind: "invalid"; errors: string[] }
  | { kind: "unavailable"; reason: string };

/** 生成した XTX が公式スキーマに適合しなかったことを表すエラー。 */
export class XtxXsdInvalidError extends Error {
  readonly errors: string[];

  constructor(errors: string[]) {
    super(`生成したXTXが公式XMLスキーマに適合しませんでした: ${errors.slice(0, 3).join(" / ")}`);
    this.name = "XtxXsdInvalidError";
    this.errors = errors;
  }
}

/**
 * 生成ユースケース向けの入口: 検証を通れば警告なし（null）、
 * 検証できなければ警告文を返し、スキーマ違反なら XtxXsdInvalidError
 * を投げる（呼び出し側で 400 に変換して生成を止める）。
 */
export async function xsdWarningOrThrow(xtx: string): Promise<string | null> {
  const result = await validateXtxWithOfficialXsd(xtx);
  if (result.kind === "valid") return null;
  if (result.kind === "invalid") throw new XtxXsdInvalidError(result.errors);
  return result.reason;
}

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
export async function validateXtxWithOfficialXsd(xtx: string): Promise<XtxXsdValidation> {
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
    const run = await runValidationScript([script, xsdDir, `${xmlPath}:${relativePath}`]);
    if (run.kind === "failed") {
      return {
        kind: "unavailable",
        reason: `スキーマ検証エンジン（python3）を実行できませんでした: ${run.message}`,
      };
    }
    const lines = run.stdout.split("\n").map((line) => line.trim());
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
    // スクリプトが検証結果を出さずに終わった（lxml 不在・タイムアウトなど）。
    // 解析エラーの traceback にも "lxml" は出るため、モジュール不在の文言で判定する。
    const detail = run.stderr.includes("No module named 'lxml'")
      ? "python3 の lxml がインストールされていません"
      : "検証スクリプトが結果を返しませんでした";
    return { kind: "unavailable", reason: `スキーマ検証を実行できませんでした: ${detail}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

type ScriptRun =
  | { kind: "finished"; stdout: string; stderr: string }
  | { kind: "failed"; message: string };

/** 検証スクリプトを非同期に実行する。時間切れなら強制終了し、出力は途中までになる。 */
async function runValidationScript(args: string[]): Promise<ScriptRun> {
  try {
    const proc = Bun.spawn(["python3", ...args], { stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => proc.kill(), VALIDATION_TIMEOUT_MS);
    try {
      const [stdout, stderr] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      await proc.exited;
      return { kind: "finished", stdout, stderr };
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    // python3 が見つからない場合は spawn 自体が例外になる
    return { kind: "failed", message: e instanceof Error ? e.message : String(e) };
  }
}
