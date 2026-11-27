/**
 * buildDepreciationSchedule.ts — 指定年の減価償却スケジュールの組み立て（services/fixedAssets）。
 *
 * 固定資産画面（REST の /api/fixed-assets/depreciation）と MCP の get_depreciation が
 * 共用する。台帳の資産を shared のエンジンで計算し、対象年に償却のある資産ごとの
 * 行・所得区分ごとの必要経費算入額の合計・少額特例の上限の使用状況を返す。除却した
 * 資産をその年に償却するか（一括償却資産は除却後も3年続ける）はエンジンが決める。
 */
import { depreciationForYear, smallSpecialUsage } from "@etax/shared";
import { BusinessError } from "../../lib/errors";
import { fixedAssetToInput } from "../../repositories/fixedAssetRepository";
import { FixedAssetRow } from "../../repositories/schema";
import { DepreciationScheduleResponse } from "../../schemas/fixedAsset";

/** 台帳の資産の値で償却を計算できなかったことを表す例外（400）。 */
export class DepreciationScheduleError extends BusinessError {}

/** 台帳の資産から対象年の減価償却スケジュールを組み立てる。 */
export function buildDepreciationSchedule(
  assets: readonly FixedAssetRow[],
  year: number,
): DepreciationScheduleResponse {
  const rows: DepreciationScheduleResponse["rows"] = [];
  const totals = { business: 0, real_estate: 0, agriculture: 0 };
  for (const asset of assets) {
    let dep;
    try {
      dep = depreciationForYear(fixedAssetToInput(asset), year);
    } catch (e) {
      throw new DepreciationScheduleError(
        400,
        e instanceof Error ? e.message : "減価償却の計算に失敗しました",
      );
    }
    if (!dep) continue;
    rows.push({
      asset_id: asset.id,
      name: asset.name,
      income_type: asset.incomeType,
      year: dep.year,
      months: dep.months,
      opening_book_value: dep.openingBookValue,
      basis_amount: dep.basisAmount,
      rate: dep.rate,
      guarantee_amount: dep.guaranteeAmount,
      ordinary: dep.ordinary,
      deductible: dep.deductible,
      closing_book_value: dep.closingBookValue,
    });
    if (asset.incomeType === "business") totals.business += dep.deductible;
    if (asset.incomeType === "real_estate") totals.real_estate += dep.deductible;
    if (asset.incomeType === "agriculture") totals.agriculture += dep.deductible;
  }
  return {
    year,
    rows,
    deductible_totals: totals,
    small_special: smallSpecialUsage(assets.map(fixedAssetToInput), year),
  };
}
