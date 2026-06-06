#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""市区町村別人口マスタを作成する。

出典: 総務省統計局『令和2年国勢調査 都道府県・市区町村別の主な結果』
  https://www.e-stat.go.jp/stat-search/files?stat_infid=000032143614
  ダウンロード: https://www.e-stat.go.jp/stat-search/file-download?statInfId=000032143614&fileKind=0

飛行計画データの「出発地」(例: "山口県阿武郡阿武町") と突合できるよう、
都道府県名・市区町村名・人口・面積を抽出して JSON 化する。
郡(市区町村より上位の区分)は出発地表記に含まれるが国勢調査の名称には
含まれないため、突合は app.py 側で「最初の郡で分割」する方式を用いる。
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import openpyxl

HERE = Path(__file__).resolve().parent
SRC = HERE / "source_census_2020.xlsx"
OUT = HERE.parent / "docs" / "data" / "population.json"


def norm(s):
    if s is None:
        return None
    return unicodedata.normalize("NFKC", str(s)).strip()


def to_int(v):
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)
    ws = wb["第１面事項_2020年"]

    municipalities = {}  # code -> record
    prefectures = {}     # pref name -> {pop, code}
    national_pop = None

    for row in ws.iter_rows(min_row=10, values_only=True):
        c0, c1 = norm(row[0]), norm(row[1])
        if not c0 or not c1 or "_" not in c0 or "_" not in c1:
            continue
        pref = c0.split("_", 1)[1]
        code, name = c1.split("_", 1)
        if not re.fullmatch(r"\d{5}", code):
            continue
        ident = norm(row[3]) or ""
        pop = to_int(row[4])
        area = to_float(row[10])

        if code == "00000":
            national_pop = pop
            continue
        if code.endswith("000"):
            # 都道府県計
            prefectures[pref] = {"code": code, "pop": pop}
            continue
        # 市区町村(政令市・特別区・市・町村)
        municipalities[code] = {
            "code": code,
            "pref": pref,
            "name": name,
            "ident": ident,
            "pop": pop,
            "area_km2": area,
        }

    out = {
        "source": "総務省統計局『令和2年国勢調査 都道府県・市区町村別の主な結果』",
        "national_pop": national_pop,
        "prefectures": prefectures,
        "municipalities": list(municipalities.values()),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"municipalities={len(municipalities)} prefectures={len(prefectures)} "
          f"national_pop={national_pop} -> {OUT} ({OUT.stat().st_size} bytes)", file=sys.stderr)


if __name__ == "__main__":
    main()
