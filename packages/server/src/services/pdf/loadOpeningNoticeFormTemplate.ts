/**
 * loadOpeningNoticeFormTemplate.ts — 開業届様式 PDF（下地）の読み込み（services/pdf）。
 *
 * 国税庁公開の公式様式（個人事業の開業・廃業等届出書、様式ID
 * NTA1KOZ060010040、手続案内 A1-5 の現行様式）を下地にする。
 * 探索順: 環境変数 ETAX_OPENING_FORM_PDF_PATH → データフォルダ/forms 配下 → 国税庁サイト
 * （formTemplateLoader）。
 */
import { createFormTemplateLoader } from "./formTemplateLoader";

/** 様式 PDF のバイト列を返す。用意できなければ null。 */
export const loadOpeningNoticeFormTemplate = createFormTemplateLoader({
  file: "kaigyo-todokede.pdf",
  url: "https://www.nta.go.jp/taxes/tetsuzuki/shinsei/annai/shinkoku/pdf/r06/05.pdf",
  envVar: "ETAX_OPENING_FORM_PDF_PATH",
});
