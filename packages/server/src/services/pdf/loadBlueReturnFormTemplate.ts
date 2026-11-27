/**
 * loadBlueReturnFormTemplate.ts — 青色申告承認申請書様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 国税庁公開の公式様式（所得税の青色申告承認申請書、様式ID
 * NTA1KOZ210010021、手続案内 A1-8 の現行様式）を下地にする。
 * 探索順: 環境変数 ETAX_BLUE_FORM_PDF_PATH → データフォルダ/forms 配下 → 国税庁サイト
 * （formTemplateLoader）。
 */
import { createFormTemplateLoader } from "./formTemplateLoader";

/** 様式 PDF のバイト列を返す。用意できなければ null。 */
export const loadBlueReturnFormTemplate = createFormTemplateLoader({
  file: "aoiro-shinsei.pdf",
  url: "https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/pdf/h28/10.pdf",
  envVar: "ETAX_BLUE_FORM_PDF_PATH",
});
