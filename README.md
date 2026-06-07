# 空域リスク・ドローン政策ダッシュボード

自治体の防災・安全・まちづくり部局向けに、無人航空機(ドローン)の**飛行計画(申請ベース)**から
**高リスク飛行(DID・空港周辺・夜間・目視外・物件投下など)の地域分布**を市区町村別に可視化する
静的ダッシュボードです。条例・地域防災計画の検討材料(EBPM)としての利用を想定しています。

公開デモは GitHub Pages(`docs/` 配信)で動作します。地図は地理院タイル、人口あたり正規化は
令和2年国勢調査に基づきます。

## 主な機能

- **リスク指標の地図**: 市区町村別に比例シンボル(円)で表示。指標別に色・大きさが変化。
- **指標フィルタ**: 高リスク合成・DID・空港周辺・150m以上・夜間・目視外・物件投下・危険物・30m未満・催し物上空・立入監視措置・係留・総数・リスクスコア平均。
- **正規化表示**: 実数(件)/ 人口あたり(件/万人)/ 飛行計画に占める割合(%)。
- **都道府県での絞り込み**、ランキング、月次推移グラフ、サマリー指標。

## ⚠️ データの性質に関する注意

- 本データは飛行**計画(申請)**であり、**実飛行・実態ではありません**。
- 元データは紙資料のスキャン → 抽出を含むため、**完全性・正確性は保証されません**。
- 出発地は**市区町村重心レベル(秘匿化済み)**。個人を特定する二次加工は行っていません。
- 飛行目的フラグが極端に多い行(**包括申請の疑い**)は既定でリスク集計から除外しています。

## データソース / 出典

- 国土交通省 Project LINKS『無人航空機飛行計画データ(2025年度)』
  <https://www.geospatial.jp/ckan/dataset/links-mujinkoukuukihikoukeikaku-2025_>
  - 対象期間: 2024年7月〜2025年6月(月次・全12ヶ月)。
  - ライセンス: 公共データ利用規約(第1.0版)/ CC BY 4.0 互換。商用利用可・**出典表記必須**。
- 市区町村人口: 総務省統計局『令和2年国勢調査 都道府県・市区町村別の主な結果』
  <https://www.e-stat.go.jp/stat-search/files?stat_infid=000032143614>
- 背景地図: 地理院タイル(国土地理院) <https://maps.gsi.go.jp/development/ichiran.html>

> 出典表記例: 「出典:国土交通省 Project LINKS『無人航空機飛行計画データ(2025年度)』を加工して作成」

## ディレクトリ構成

```
docs/                 GitHub Pages 配信対象(静的サイト本体)
  index.html          画面
  style.css           スタイル
  app.js              地図・指標・グラフのロジック(依存: Leaflet CDN)
  data/
    municipalities.json  市区町村別集計(地図・ランキングの元)
    monthly.json         月次推移(全国・都道府県別)
    meta.json            集計メタ情報(件数・突合率・生成日・出典)
    population.json       令和2年国勢調査の市区町村人口マスタ
scripts/
  build_population.py   国勢調査 xlsx → population.json
  aggregate.py          飛行計画 GeoJSON(約297万件)→ 集計 JSON
  source_census_2020.xlsx  国勢調査 元データ(人口マスタの正本)
```

集計済みの軽量 JSON のみをリポジトリに含めています。元の飛行計画 GeoJSON(全16ファイル・約15GB)は
リポジトリには含めず、`scripts/aggregate.py` が CKAN の恒久リンクから都度ダウンロードして処理します。

## 集計の再現手順

```bash
# 1) 人口マスタの生成(同梱の国勢調査 xlsx から)
python3 scripts/build_population.py

# 2) 飛行計画データの集計(全16ファイルを順次 DL → ストリーム集計 → 削除)
#    ネットワークとディスク(約1GB/ファイル分の一時領域)が必要。
python3 scripts/aggregate.py
```

`aggregate.py` の集計方針:

- フィールド名の表記ゆれ(末尾空白・異体字・全半角)は **NFKC 正規化 + trim** で吸収。
- 月の信頼単位は「**ファイル = 対象月**」(行内日時の品質が低いため)。
- 巨大ポリゴン座標はパースせず破棄し、`properties` のみを抽出して高速化。
- 市区町村名の突合は国勢調査名称に対して行い、出発地に含まれる**郡・支庁・振興局**を段階的に除去。
  改称(例: 篠山市→丹波篠山市)・異体字(梼/檮)も考慮。
- リスクスコア重み: 空港周辺・物件投下・危険物 = 3 / DID・150m以上・夜間・目視外 = 2 / 30m未満・催し物上空 = 1。

## ローカルでの表示確認

```bash
cd docs && python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

## デプロイ(GitHub Pages)

公開URL: <https://shinyanakashima.github.io/MLIT-LINKS-uav-oversight/>

`.github/workflows/deploy-pages.yml` により、`main` への push で `docs/` を
GitHub Pages へ自動デプロイします(`actions/configure-pages` → `upload-pages-artifact`
→ `deploy-pages`)。静的ファイルのみで完結します。

Actions を使わない場合は、リポジトリ設定 → Pages で **Source: Deploy from a branch**、
ブランチ `main`・**フォルダ `/docs`** を選択しても公開できます。
