/**
 * assetOptions.ts — 固定資産画面の選択肢とフォーム入力の変換。
 * 年ごとの数値・検証・表示名は @etax/shared（fixedAssetLedger）が持つ。
 */
import {
  DEPRECIATION_METHOD_LABELS,
  FIXED_ASSET_INCOME_TYPE_LABELS,
  FixedAssetIncomeType,
} from "@etax/shared";
import { DepreciationMethod, FixedAssetInput, FixedAssetRecord } from "@/api";

export const METHOD_OPTIONS: readonly { value: DepreciationMethod; label: string }[] = (
  Object.keys(DEPRECIATION_METHOD_LABELS) as DepreciationMethod[]
).map((value) => ({ value, label: DEPRECIATION_METHOD_LABELS[value].option }));

export const INCOME_TYPE_OPTIONS: readonly { value: string; label: string }[] = (
  Object.keys(FIXED_ASSET_INCOME_TYPE_LABELS) as FixedAssetIncomeType[]
).map((value) => ({ value, label: FIXED_ASSET_INCOME_TYPE_LABELS[value] }));

export const toInput = (row: FixedAssetRecord): FixedAssetInput => ({
  name: row.name,
  quantity: row.quantity,
  income_type: row.income_type,
  acquisition_date: row.acquisition_date,
  service_start_date: row.service_start_date,
  cost: row.cost,
  useful_life_years: row.useful_life_years,
  method: row.method,
  business_ratio_percent: row.business_ratio_percent,
  disposed_date: row.disposed_date,
});

export const emptyDraft = (year: number): FixedAssetInput => ({
  name: "",
  quantity: "",
  income_type: "business",
  acquisition_date: `${year}-01-01`,
  service_start_date: null,
  cost: 0,
  useful_life_years: 5,
  method: "straight_line",
  business_ratio_percent: 100,
  disposed_date: null,
});
