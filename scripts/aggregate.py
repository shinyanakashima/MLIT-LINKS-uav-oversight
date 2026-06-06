#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""無人航空機飛行計画データを市区町村別の空域リスク集計に要約する。

出典: 国土交通省 Project LINKS『無人航空機飛行計画データ(2025年度)』
  https://www.geospatial.jp/ckan/dataset/links-mujinkoukuukihikoukeikaku-2025_

全12ヶ月・約297万件の飛行計画(申請ベース)を月別ファイル単位でストリーム処理し、
飛行空域・飛行方法のリスク該当フラグを市区町村別に集計する。出力は静的配信用の
軽量 JSON (ポリゴンは破棄、市区町村粒度に要約)。

集計方針 (データの癖への対応):
  * フィールド名は NFKC 正規化 + 前後空白除去で表記ゆれを吸収して参照する。
  * 包括申請ノイズ(飛行目的フラグが極端に多い行)はリスク集計から除外する。
  * 月の信頼単位は「ファイル = 対象月」とし、行内日時には依存しない。
  * 出発地は市区町村重心(秘匿化)粒度として扱い、粒度を上げる加工はしない。
"""
import json
import os
import subprocess
import sys
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT_DIR = ROOT / "docs" / "data"
POP_PATH = OUT_DIR / "population.json"
WORK = Path(os.environ.get("UAV_WORKDIR", "/tmp/uav_work"))

CKAN = ("https://www.geospatial.jp/ckan/dataset/"
        "9db8f0a7-5f94-424b-a978-740cfd58a5fa/resource/{rid}/download/{fn}")

# (対象月, リソースID, ファイル名)。月内で分割されたファイルは同一月に合算する。
RESOURCES = [
    ("2024-07", "00e65a95-af82-4cdd-99be-adb524ddb449", "01_1_hikoukeikaku_202407.geojson"),
    ("2024-08", "4fb4c6b0-33a1-41fa-81ac-c9cfe28930f6", "01_2_hikoukeikaku_202408.geojson"),
    ("2024-09", "047e23f6-6c9b-48d5-b3fd-fdcefed4ee0c", "01_3_hikoukeikaku_202409.geojson"),
    ("2024-10", "045d69c2-c2a2-45b7-b368-ce867bf10c92", "01_4_hikoukeikaku_202410.geojson"),
    ("2024-11", "c231353d-3224-42e8-be21-de6431fd2c99", "01_5_hikoukeikaku_202411.geojson"),
    ("2024-12", "2c4f569f-b487-4f92-a1cf-2332ef4e9b7e", "01_6_hikoukeikaku_202412.geojson"),
    ("2025-01", "1d413e6b-61d5-4e50-8381-97421876a66a", "01_7_hikoukeikaku_202501.geojson"),
    ("2025-02", "ebb60fbe-ae89-429c-8fe0-9bae7e85569b", "01_8_hikoukeikaku_202502.geojson"),
    ("2025-03", "c6920c04-78a7-46a9-ab8a-adcc917ff313", "01_9_hikoukeikaku_202503_1.geojson"),
    ("2025-03", "a94bba7d-a87e-4969-8752-6360846e5bba", "01_9_hikoukeikaku_202503_2.geojson"),
    ("2025-04", "a3c04e15-f2ec-49bc-9518-25d4dd9d1e18", "01_10_hikoukeikaku_202504_1.geojson"),
    ("2025-04", "2c658546-b151-4713-9f0a-4f9aca5cbd22", "01_10_hikoukeikaku_202504_2.geojson"),
    ("2025-05", "cdc8a653-62df-42d5-9b5d-a418a903bebd", "01_11_hikoukeikaku_202505_1.geojson"),
    ("2025-05", "32f05c87-0cfb-48a1-bbc8-0baeef980533", "01_11_hikoukeikaku_202505_2.geojson"),
    ("2025-06", "37948aef-8c6d-4770-8346-8a6ba7fe8180", "01_12_hikoukeikaku_202506_1.geojson"),
    ("2025-06", "7be63f9a-4628-4d2f-8aec-12b278317421", "01_12_hikoukeikaku_202506_2.geojson"),
]

PREFS = [
    "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県",
    "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県",
    "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府",
    "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
    "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県",
    "鹿児島県", "沖縄県",
]


def n(s):
    return unicodedata.normalize("NFKC", s).strip()


# NFKC 正規化後のターゲットキー (例: 飛行目的（業務） -> 飛行目的(業務))
K_ORIGIN = n("出発地")
K_LAT = n("出発地緯度")
K_LON = n("出発地経度")
K_DID = n("飛行空域_DID")
K_150 = n("飛行空域_150m")
K_AIRPORT = n("飛行空域_空港周辺")
K_NIGHT = n("飛行方法_夜間")
K_BVLOS = n("飛行方法_目視外")
K_DROP = n("飛行方法_物件投下")
K_HAZMAT = n("飛行方法_危険物")
K_LOW30 = n("飛行方法_30m")
K_EVENT = n("飛行方法_催し物")
K_MOORED = n("係留有無")
K_ASSIST = n("補助者数")
K_MON1 = n("立ち入り監視措置_管理区画")
K_MON2 = n("立ち入り監視措置_管理区画(LV3)")
K_MON3 = n("立ち入り監視措置_禁止区画")
PURPOSE_PREFIX = (n("飛行目的(業務)_"), n("飛行目的(業務以外)_"))

# 高リスク合成指標に含めるフラグ
HIGH_RISK_KEYS = (K_DID, K_AIRPORT, K_NIGHT, K_BVLOS, K_DROP)
# リスクスコアの重み
SCORE_WEIGHTS = {
    K_DID: 2, K_AIRPORT: 3, K_150: 2, K_NIGHT: 2, K_BVLOS: 2,
    K_DROP: 3, K_HAZMAT: 3, K_LOW30: 1, K_EVENT: 1,
}
# 包括申請とみなす飛行目的フラグ数の下限
HOKATSU_MIN_FLAGS = 10

# 集計する指標キー (出力 JSON のフィールド名 -> 内部キー)
METRICS = [
    ("did", K_DID), ("airport", K_AIRPORT), ("high150", K_150),
    ("night", K_NIGHT), ("bvlos", K_BVLOS), ("drop", K_DROP),
    ("hazmat", K_HAZMAT), ("low30", K_LOW30), ("event", K_EVENT),
]
ZERO_FIELDS = [m for m, _ in METRICS] + [
    "high_risk", "monitoring", "moored", "assist_n", "assist_sum",
    "score_sum", "total_all", "total_valid", "hokatsu",
]


def flag(v):
    """0/1 フラグを頑健に解釈する。'NaN'・None・空は 0。"""
    if v is None:
        return 0
    if isinstance(v, bool):
        return 1 if v else 0
    if isinstance(v, (int, float)):
        return 1 if v >= 0.5 else 0
    s = str(v).strip()
    if not s or s.lower() == "nan":
        return 0
    try:
        return 1 if float(s) >= 0.5 else 0
    except ValueError:
        return 0


def num(v):
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if f != f:  # NaN
        return None
    return f


def normalized_props(line):
    """1 行 = 1 Feature の行から properties だけを取り出し、キーを NFKC 正規化する。

    巨大なポリゴン座標列のパースを避けるため、geometry より前の properties
    オブジェクトのみを切り出して json.loads する。
    """
    i = line.find('"properties"')
    if i < 0:
        return None
    start = line.find("{", i)
    end = line.rfind(', "geometry"')
    if start < 0 or end < 0 or end <= start:
        return None
    try:
        raw = json.loads(line[start:end])
    except json.JSONDecodeError:
        return None
    return {n(k): v for k, v in raw.items()}


def split_pref(origin):
    for p in PREFS:
        if origin.startswith(p):
            return p, origin[len(p):]
    return None, origin


def download(rid, fn, dest):
    url = CKAN.format(rid=rid, fn=fn)
    delay = 2
    for attempt in range(1, 6):
        rc = subprocess.call([
            "curl", "-sSL", "--fail", "--max-time", "1200",
            "-o", str(dest), url,
        ])
        if rc == 0 and dest.exists() and dest.stat().st_size > 1024:
            return
        print(f"  download retry {attempt} (rc={rc})", file=sys.stderr, flush=True)
        time.sleep(delay)
        delay *= 2
    raise RuntimeError(f"download failed: {url}")


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    pop = json.loads(POP_PATH.read_text(encoding="utf-8"))
    # pref -> {name -> record}
    pop_index = defaultdict(dict)
    for m in pop["municipalities"]:
        pop_index[m["pref"]][m["name"]] = m

    muni = defaultdict(lambda: dict.fromkeys(ZERO_FIELDS, 0))
    coords = {}            # origin -> (lat, lon)
    pref_of = {}           # origin -> pref
    monthly = defaultdict(lambda: dict.fromkeys(ZERO_FIELDS, 0))
    monthly_pref = defaultdict(lambda: defaultdict(lambda: {"total_valid": 0, "high_risk": 0}))
    total_records = 0
    keep_one = os.environ.get("UAV_KEEP_FILES") == "1"

    for idx, (month, rid, fn) in enumerate(RESOURCES, 1):
        dest = WORK / fn
        t0 = time.time()
        print(f"[{idx}/{len(RESOURCES)}] {month} {fn} downloading...", file=sys.stderr, flush=True)
        download(rid, fn, dest)
        size_mb = dest.stat().st_size / 1e6
        print(f"  parsing {size_mb:.0f} MB ...", file=sys.stderr, flush=True)

        mrec = monthly[month]
        nfile = 0
        with open(dest, "r", encoding="utf-8") as f:
            for line in f:
                if '"Feature"' not in line:
                    continue
                p = normalized_props(line)
                if p is None:
                    continue
                nfile += 1

                origin = p.get(K_ORIGIN)
                if origin is None:
                    continue
                origin = n(str(origin))
                if not origin or origin.lower() == "nan":
                    continue

                rec = muni[origin]
                rec["total_all"] += 1
                mrec["total_all"] += 1

                # 都道府県・代表座標は包括申請行も含めて全行から確定しておく
                if origin not in pref_of:
                    pref_of[origin] = split_pref(origin)[0]
                if origin not in coords:
                    lat, lon = num(p.get(K_LAT)), num(p.get(K_LON))
                    if lat is not None and lon is not None:
                        coords[origin] = (lat, lon)

                purpose_flags = sum(
                    flag(v) for k, v in p.items() if k.startswith(PURPOSE_PREFIX)
                )
                if purpose_flags >= HOKATSU_MIN_FLAGS:
                    rec["hokatsu"] += 1
                    mrec["hokatsu"] += 1
                    continue

                rec["total_valid"] += 1
                mrec["total_valid"] += 1

                score = 0
                for field, key in METRICS:
                    fv = flag(p.get(key))
                    if fv:
                        rec[field] += 1
                        mrec[field] += 1
                        score += SCORE_WEIGHTS.get(key, 0)
                rec["score_sum"] += score
                mrec["score_sum"] += score

                if any(flag(p.get(k)) for k in HIGH_RISK_KEYS):
                    rec["high_risk"] += 1
                    mrec["high_risk"] += 1
                    mp = monthly_pref[month][pref_of[origin]]
                    mp["high_risk"] += 1
                if flag(p.get(K_MON1)) or flag(p.get(K_MON2)) or flag(p.get(K_MON3)):
                    rec["monitoring"] += 1
                    mrec["monitoring"] += 1
                if flag(p.get(K_MOORED)):
                    rec["moored"] += 1
                    mrec["moored"] += 1
                a = num(p.get(K_ASSIST))
                if a is not None and a > 0:
                    rec["assist_n"] += 1
                    rec["assist_sum"] += int(a)
                    mrec["assist_n"] += 1
                    mrec["assist_sum"] += int(a)

                monthly_pref[month][pref_of[origin]]["total_valid"] += 1

        total_records += nfile
        print(f"  {nfile} records in {time.time()-t0:.0f}s "
              f"(cumulative {total_records})", file=sys.stderr, flush=True)
        if not keep_one:
            dest.unlink(missing_ok=True)

    write_outputs(muni, coords, pref_of, monthly, monthly_pref, pop, pop_index, total_records)


# 市区町村より上位の区分。出発地表記には含まれるが国勢調査名称には含まれない。
ADMIN_MARKERS = ("総合振興局", "振興局", "支庁", "郡")
# 異体字の揺れ(例: 梼原町 / 檮原町)
VARIANT = str.maketrans({"梼": "檮"})
# 平成の大合併以降の改称など、機械的に吸収できない別名
ALIAS = {
    ("兵庫県", "篠山市"): "丹波篠山市",
}


def match_pop(pref, muni_part, pop_index):
    """出発地の市区町村部分を国勢調査の人口に突合する。

    出発地は「(振興局/支庁)(郡)市区町村」の形を取り得るが、国勢調査の名称は
    市区町村のみ。先頭の上位区分を 1 段ずつ落としつつ、最初に一致した時点で確定する
    (「上郡町」のように名称に郡を含む自治体を過剰に削らないため)。
    """
    if pref not in pop_index:
        return None
    names = pop_index[pref]

    def lookup(name):
        if name in names:
            return names[name]
        v = name.translate(VARIANT)
        return names.get(v)

    alias = ALIAS.get((pref, muni_part))
    if alias and alias in names:
        return names[alias]

    work = muni_part
    while True:
        hit = lookup(work)
        if hit:
            return hit
        # 先頭に最も近い上位区分の直後で切り、接尾の市区町村名を取り出す
        cut = None
        for marker in ADMIN_MARKERS:
            pos = work.find(marker)
            if pos >= 0:
                end = pos + len(marker)
                if cut is None or end < cut:
                    cut = end
        if cut is None:
            return None
        work = work[cut:]


def write_outputs(muni, coords, pref_of, monthly, monthly_pref, pop, pop_index, total_records):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out_munis = []
    matched = unmatched = matched_pop = 0
    for origin, rec in muni.items():
        if rec["total_valid"] == 0 and rec["total_all"] == 0:
            continue
        pref = pref_of.get(origin)
        muni_part = split_pref(origin)[1] if pref else origin
        pr = match_pop(pref, muni_part, pop_index) if pref else None
        if pr:
            matched += 1
            popv = pr.get("pop")
            if popv:
                matched_pop += rec["high_risk"]
        else:
            unmatched += 1
            popv = None
        latlon = coords.get(origin)
        item = {
            "origin": origin,
            "pref": pref,
            "name": muni_part,
            "code": pr["code"] if pr else None,
            "pop": popv,
            "lat": round(latlon[0], 5) if latlon else None,
            "lon": round(latlon[1], 5) if latlon else None,
        }
        for fld in ZERO_FIELDS:
            item[fld] = rec[fld]
        out_munis.append(item)

    out_munis.sort(key=lambda x: x["high_risk"], reverse=True)
    (OUT_DIR / "municipalities.json").write_text(
        json.dumps(out_munis, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    monthly_list = []
    for month in sorted(monthly):
        row = {"month": month}
        row.update(monthly[month])
        row["prefectures"] = {
            pref: dict(v) for pref, v in sorted(monthly_pref[month].items())
        }
        monthly_list.append(row)
    (OUT_DIR / "monthly.json").write_text(
        json.dumps(monthly_list, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    totals = dict.fromkeys(ZERO_FIELDS, 0)
    for rec in muni.values():
        for fld in ZERO_FIELDS:
            totals[fld] += rec[fld]
    meta = {
        "generated": time.strftime("%Y-%m-%d"),
        "source": "国土交通省 Project LINKS『無人航空機飛行計画データ(2025年度)』を加工して作成",
        "population_source": "総務省統計局『令和2年国勢調査 都道府県・市区町村別の主な結果』",
        "period": {"from": "2024-07", "to": "2025-06"},
        "total_records": total_records,
        "municipalities": len(out_munis),
        "matched_to_census": matched,
        "unmatched_to_census": unmatched,
        "totals": totals,
        "high_risk_keys": ["飛行空域_DID", "飛行空域_空港周辺", "飛行方法_夜間",
                            "飛行方法_目視外", "飛行方法_物件投下"],
        "score_weights": {
            "DID": 2, "空港周辺": 3, "150m以上": 2, "夜間": 2, "目視外": 2,
            "物件投下": 3, "危険物": 3, "30m未満": 1, "催し物上空": 1,
        },
        "hokatsu_min_flags": HOKATSU_MIN_FLAGS,
        "notes": "申請(計画)ベースであり実飛行・実態ではない。元データはスキャン資料からの"
                 "抽出のため完全性・正確性は保証されない。出発地は市区町村重心粒度(秘匿化)。",
    }
    (OUT_DIR / "meta.json").write_text(
        json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"DONE munis={len(out_munis)} matched={matched} unmatched={unmatched} "
          f"records={total_records}", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
