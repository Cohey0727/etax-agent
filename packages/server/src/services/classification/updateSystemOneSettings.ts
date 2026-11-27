/**
 * updateSystemOneSettings.ts — SystemOne（jev）接続設定の保存（services/classification）。
 *
 * 設定画面（usecases/updateSystemOneSettings）・MCP・対話エージェントの3経路が
 * 共用する。保存した値はその場で有効になり、以降の科目判定すべてに使われる。
 * 接続先はユーザー指定の宛先なので、保存前に SSRF 検証を行う（判定のたびの
 * 送信時には検証しないため、ここが唯一の関門になる）。
 */
import { getSystemOneOverrides, SystemOneOverrides } from "../../lib/config";
import { assertSafeUserBaseUrl, UnsafeUrlError } from "../../lib/ssrfGuard";
import { saveSystemOneSettings } from "../../repositories/systemOneSettingsRepository";

/** 入力が不正で保存しなかったことを表す例外。 */
export class SystemOneSettingsInputError extends Error {}

/** 接続設定の変更内容。 */
export interface SystemOneSettingsPatch {
  /** 接続先。未指定は現在の値を維持し、空文字は保存値を消す（環境変数を使う）。 */
  baseUrl?: string;
  /** モデル名。未指定は現在の値を維持し、空文字は保存値を消す。 */
  model?: string;
  /** APIキー。未指定・空文字は現在のキーを維持する。 */
  apiKey?: string;
  /** true なら保存済みのAPIキーを消す（apiKey より優先する）。 */
  clearApiKey?: boolean;
}

const MAX_BASE_URL_LENGTH = 500;
const MAX_MODEL_LENGTH = 200;
const MAX_API_KEY_LENGTH = 500;

function assertMaxLength(value: string | undefined, max: number, label: string): void {
  if (value !== undefined && value.length > max) {
    throw new SystemOneSettingsInputError(`${label}は${max}文字以内で指定してください`);
  }
}

/** 接続設定を変更して保存し、保存後の値を返す。不正な入力は SystemOneSettingsInputError。 */
export async function updateSystemOneSettings(
  patch: SystemOneSettingsPatch,
): Promise<SystemOneOverrides> {
  const baseUrl = patch.baseUrl?.trim();
  const model = patch.model?.trim();
  const apiKey = patch.apiKey?.trim();
  assertMaxLength(baseUrl, MAX_BASE_URL_LENGTH, "接続先 URL ");
  assertMaxLength(model, MAX_MODEL_LENGTH, "モデル名");
  assertMaxLength(apiKey, MAX_API_KEY_LENGTH, "APIキー");
  if (baseUrl) {
    try {
      await assertSafeUserBaseUrl(baseUrl);
    } catch (e) {
      if (e instanceof UnsafeUrlError) throw new SystemOneSettingsInputError(e.message);
      throw e;
    }
  }
  const current = getSystemOneOverrides();
  const next: SystemOneOverrides = {};
  const nextBaseUrl = baseUrl ?? current.baseUrl;
  if (nextBaseUrl) next.baseUrl = nextBaseUrl;
  const nextModel = model ?? current.model;
  if (nextModel) next.model = nextModel;
  const nextApiKey = patch.clearApiKey ? undefined : apiKey || current.apiKey;
  if (nextApiKey) next.apiKey = nextApiKey;
  await saveSystemOneSettings(next);
  return next;
}
