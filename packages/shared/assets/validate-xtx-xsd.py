#!/usr/bin/env python3
"""validate-xtx-xsd.py — 生成した XTX を国税庁公式 XML スキーマで検証する。

使い方:
  python3 validate-xtx-xsd.py <XSDディレクトリ> <xml>:<スキーマ相対パス> [...]

XSDディレクトリは e-Tax 仕様書ページ「19 XMLスキーマ」(e-tax19.CAB) を
展開した中にある「19XMLスキーマ」フォルダ。スキーマ相対パスはそのフォルダ
からの相対パス（例: shotoku/RKO0010-231.xsd）。

2026-11-19 にこの検証で、e-Taxソフト（WEB版）が SE00S170 で読み込めなかった
原因（手続VR・名前空間・IT部の必須要素と並び順・zeimusho の表記）を特定した。
生成器を変更したら、ETAX_XSD_DIR を設定して bun test を回し直すこと。
"""
import sys

from lxml import etree


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    xsd_dir = sys.argv[1]
    failed = False
    for pair in sys.argv[2:]:
        xml_path, schema_rel = pair.rsplit(":", 1)
        schema = etree.XMLSchema(etree.parse(f"{xsd_dir}/{schema_rel}"))
        doc = etree.parse(xml_path)
        if schema.validate(doc):
            print(f"VALID  {xml_path}  ({schema_rel})")
        else:
            failed = True
            print(f"INVALID {xml_path}  ({schema_rel})")
            for err in schema.error_log:
                print(f"  line {err.line}: {err.message}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
