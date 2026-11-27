/**
 * cli.test.ts — スタンドアロン CLI の引数パース・出力の回帰テスト。
 * CLI をサブプロセスとして起動し、終了コードと stdout/stderr を検証する。
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CLI = join(import.meta.dir, "../src/cli.ts");

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", "run", CLI, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
}

const dir = mkdtempSync(join(tmpdir(), "etax-cli-test-"));
const csvPath = join(dir, "tx.csv");
writeFileSync(
  csvPath,
  "date,description,amount\n2025-02-01,AWS利用料,-3000\n2025-03-01,家賃収入,120000\n",
  "utf-8",
);

const originalPath = join(dir, "original.json");
writeFileSync(originalPath, JSON.stringify({ year: 2025, income_tax: 100_000 }), "utf-8");

describe("cli 引数パース", () => {
  test("--help は使い方を stdout に出して 0 で終わる", async () => {
    const r = await runCli(["--help"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("使い方");
  });

  test("--key=value 形式を受け付ける", async () => {
    const r = await runCli(["aggregate", "--year=2025", `--csv=${csvPath}`]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("所得集計");
  });

  test("--year の空文字・範囲外はエラー（Number(\"\")===0 を素通ししない）", async () => {
    const empty = await runCli(["aggregate", "--year", "", "--csv", csvPath]);
    expect(empty.code).toBe(2);
    const negative = await runCli(["aggregate", "--year", "-1", "--csv", csvPath]);
    expect(negative.code).toBe(2);
  });

  test("値の位置に次のフラグが来たらエラーにする", async () => {
    const r = await runCli(["aggregate", "--csv", "--year", "2025"]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain("値がありません");
  });

  test("対象年0件は stderr に出して 1 で終わる", async () => {
    const r = await runCli(["aggregate", "--year", "2024", "--csv", csvPath]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("取引がありませんでした");
    expect(r.stdout).not.toContain("取引がありませんでした");
  });

  test("--filing-type / --business-kind の不正値はエラー", async () => {
    const r1 = await runCli(["aggregate", "--year", "2025", "--csv", csvPath, "--filing-type", "blue99"]);
    expect(r1.code).toBe(2);
    const r2 = await runCli(["consumption", "--year", "2025", "--csv", csvPath, "--business-kind", "unknown"]);
    expect(r2.code).toBe(2);
  });

  test("--real-estate-business-scale を付けると不動産のみでも65万円の限度で控除する", async () => {
    const rentCsv = join(dir, "rent.csv");
    writeFileSync(rentCsv, "date,description,amount,category,income_type\n2025-03-01,家賃収入,1000000,家賃収入,real_estate\n", "utf-8");
    const plain = await runCli(["aggregate", "--year", "2025", "--csv", rentCsv]);
    expect(plain.code).toBe(0);
    expect(plain.stdout).toContain("不動産分        : 100,000円");
    const scale = await runCli(["aggregate", "--year", "2025", "--csv", rentCsv, "--real-estate-business-scale"]);
    expect(scale.code).toBe(0);
    expect(scale.stdout).toContain("不動産分        : 650,000円");
    const amend = await runCli([
      "amend", "--year", "2025", "--csv", rentCsv, "--original", originalPath, "--real-estate-business-scale",
    ]);
    expect(amend.code).toBe(0);
    expect(amend.stdout).toContain("青色申告特別控除    : 不動産 650,000円");
  });

  test("consumption は事業区分に応じたみなし仕入率を表示する", async () => {
    const r = await runCli(["consumption", "--year", "2025", "--csv", csvPath, "--business-kind", "retail"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("みなし仕入率80%");
  });
});
