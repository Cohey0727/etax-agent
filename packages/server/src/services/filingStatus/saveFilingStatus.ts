/**
 * saveFilingStatus.ts — 申告ステータスの保存（services/filingStatus）。
 *
 * 確定申告画面（REST の PUT /api/filing-status/{year}）・MCP の set_filing_status・
 * エージェントの set_filing_status が共用する。渡した項目だけを書き換える
 * （true で済み、false で未了に戻す）。
 */
import { Db } from "../../lib/db";
import { BusinessError } from "../../lib/errors";
import {
  FilingStatusPatch,
  filingStatusToApi,
  upsertFilingStatusRow,
} from "../../repositories/filingStatusRepository";
import { FilingStatusResponse } from "../../schemas/filingStatus";

/** 申告ステータスを保存し、保存後の状態を返す。 */
export async function saveFilingStatus(
  db: Db,
  year: number,
  patch: FilingStatusPatch,
): Promise<FilingStatusResponse> {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new BusinessError(400, "year が不正です");
  }
  const row = await upsertFilingStatusRow(db, year, patch);
  if (!row) throw new BusinessError(503, "申告ステータスを保存できませんでした");
  return filingStatusToApi(row);
}
