'use strict';

// UI 文言の多言語辞書。市区町村名・都道府県名などのデータ値は翻訳せず日本語のまま扱う。
const I18N = {
  ja: {
    htmlLang: 'ja',
    title: '空域リスク・ドローン政策ダッシュボード',
    subtitle: '無人航空機 飛行計画(申請ベース)の高リスク飛行を市区町村別に可視化 — 防災・安全・まちづくりの検討資料(EBPM)',
    disclaimer: '<strong>ご注意:</strong> 本データは飛行<strong>計画(申請)</strong>であり、実飛行・実態ではありません。'
      + '元データは紙資料のスキャン抽出を含むため、完全性・正確性は保証されません。出発地は市区町村重心レベル(秘匿化)で表示しています。',
    ctrl_metric: 'リスク指標',
    ctrl_norm: '表示',
    ctrl_pref: '都道府県で絞り込み',
    ctrl_hokatsu: '包括申請の疑い行を含める',
    hokatsu_hint: '飛行目的フラグが極端に多い行(包括申請の疑い)は既定でリスク集計から除外しています。',
    nationwide: '全国',
    rank_title: 'ランキング',
    trend_title: '月次推移(全国・申請件数)',
    trend_note: '棒: 飛行計画総数 / 折れ線: 高リスク該当件数。月の単位は「ファイル=対象月」。',
    notes_title: '指標と集計方法',
    notes_list:
      '<li><strong>高リスク(合成)</strong>: 飛行空域(DID・空港周辺)または飛行方法(夜間・目視外・物件投下)のいずれかに該当する飛行計画の件数。</li>'
      + '<li><strong>リスクスコア平均</strong>: 各リスク該当に重み(空港周辺・物件投下・危険物=3、DID・150m以上・夜間・目視外=2、30m未満・催し物上空=1)を付け、有効行で平均した値。</li>'
      + '<li><strong>人口あたり</strong>: 令和2年国勢調査の市区町村人口で正規化(件/万人)。人口データに突合できない地点は実数のみ表示。</li>'
      + '<li><strong>包括申請ノイズ</strong>: 飛行目的フラグが10個以上立つ行は包括申請の疑いとして既定で除外。チェックボックスで挙動を確認できます(地図・指標は除外後の集計)。</li>'
      + '<li>フィールド名の表記ゆれ(末尾空白・異体字・全半角)は正規化して参照。市区町村名は国勢調査名称に突合(郡・支庁・振興局を考慮)。</li>',
    attribution: '出典:国土交通省 Project LINKS『無人航空機飛行計画データ(2025年度)』を加工して作成。'
      + '人口:総務省統計局『令和2年国勢調査』。地図:地理院タイル(国土地理院)。',
    license: 'データライセンス:公共データ利用規約(第1.0版)/ CC BY 4.0 互換。'
      + '本サイトは自治体の政策検討を支援する非公式の可視化であり、個人を特定する二次加工は行っていません。',

    // 正規化(表示)オプション
    norm_count: '実数(件)',
    norm_percap: '人口あたり(件/万人)',
    norm_share: '飛行計画に占める割合(%)',
    // 単位
    unit_count: ' 件',
    unit_percap: ' 件/万人',
    unit_share: ' %',
    unit_pt: ' pt',
    suffix_count: '件',
    suffix_percap: '件/万人',
    suffix_share: '%',
    suffix_pt: 'pt',
    pop_unknown: '人口不明',

    // KPI
    kpi_total_label: '対象 飛行計画(申請)',
    kpi_total_sub_valid: '有効行',
    kpi_total_sub_all: '有効行+包括',
    kpi_high_label: '高リスク該当 件数',
    kpi_high_sub: 'DID/空港/夜間/目視外/物件投下',
    kpi_share_label: '高リスク 比率',
    kpi_share_sub: '対 飛行計画',
    kpi_munis_label: '対象 市区町村数',
    kpi_munis_sub: '地図表示地点',
    kpi_hokatsu_label: '包括申請の疑い',
    kpi_hokatsu_sub: '既定で集計除外',

    // ポップアップ
    pop_metric_now: '表示中指標',
    pop_pop_label: '人口(R2国勢)',
    pop_persons: ' 人',
    legend_zero: '0 件',
    legend_zero_generic: '0',
    legend_over: ' 以上',

    // 動的文
    period_fmt: (f, t) => `対象期間: ${f} 〜 ${t}`,
    meta_fmt: (m) => `集計: 飛行計画 約${m.total_records.toLocaleString('ja-JP')}件 / 市区町村 ${m.municipalities.toLocaleString('ja-JP')} / 国勢調査突合 ${m.matched_to_census.toLocaleString('ja-JP')} / 生成日 ${m.generated}`,
    load_error: 'データの読み込みに失敗しました。集計データ(data/*.json)が生成されているか確認してください。',
    norm_avg_disabled: 'スコア平均は正規化済みのため固定表示です',

    metrics: {
      high_risk: '高リスク(合成)', did: 'DID(人口集中地区)', airport: '空港等周辺',
      high150: '150m以上', night: '夜間', bvlos: '目視外', drop: '物件投下',
      hazmat: '危険物', low30: '30m未満', event: '催し物上空',
      monitoring: '立入監視措置あり', moored: '係留あり',
      total: '飛行計画 総数', score_avg: 'リスクスコア 平均',
    },
  },

  en: {
    htmlLang: 'en',
    title: 'Airspace Risk & Drone Policy Dashboard',
    subtitle: 'High-risk UAV flight plans (application-based) mapped by municipality — reference material for disaster-prevention, safety and urban planning (EBPM)',
    disclaimer: '<strong>Note:</strong> This dataset records flight <strong>plans (applications)</strong>, not actual flights or operations. '
      + 'The source data includes extraction from scanned paper documents, so completeness and accuracy are not guaranteed. Departure points are shown at municipal-centroid level (anonymized).',
    ctrl_metric: 'Risk indicator',
    ctrl_norm: 'Display',
    ctrl_pref: 'Filter by prefecture',
    ctrl_hokatsu: 'Include suspected blanket applications',
    hokatsu_hint: 'Rows with an unusually large number of flight-purpose flags (suspected blanket applications) are excluded from risk aggregation by default.',
    nationwide: 'Nationwide',
    rank_title: 'Ranking',
    trend_title: 'Monthly trend (nationwide applications)',
    trend_note: 'Bars: total flight plans / Line: high-risk count. The month unit is "file = target month".',
    notes_title: 'Indicators & methodology',
    notes_list:
      '<li><strong>High-risk (composite)</strong>: number of flight plans matching any of airspace (DID, airport vicinity) or method (night, BVLOS, object dropping).</li>'
      + '<li><strong>Avg. risk score</strong>: each risk flag is weighted (airport vicinity / object dropping / hazardous materials = 3; DID / above 150m / night / BVLOS = 2; within 30m / over event sites = 1) and averaged over valid rows.</li>'
      + '<li><strong>Per capita</strong>: normalized by municipal population from the 2020 Census (cases per 10,000 people). Points that cannot be matched to population data show counts only.</li>'
      + '<li><strong>Blanket-application noise</strong>: rows with 10+ flight-purpose flags are excluded by default as suspected blanket applications. Use the checkbox to inspect the effect (the map and indicators use post-exclusion aggregates).</li>'
      + '<li>Field-name variants (trailing spaces, variant characters, full/half width) are normalized before reference. Municipality names are matched to Census names (accounting for gun / subprefecture / bureau prefixes).</li>',
    attribution: 'Source: created by processing MLIT Project LINKS "UAV Flight Plan Data (FY2025)". '
      + 'Population: Statistics Bureau of Japan, "2020 Census". Basemap: GSI Tiles (Geospatial Information Authority of Japan).',
    license: 'Data license: Public Data License (v1.0) / CC BY 4.0 compatible. '
      + 'This site is an unofficial visualization to support local-government policy review and performs no secondary processing that could identify individuals.',

    norm_count: 'Count',
    norm_percap: 'Per capita (per 10k pop.)',
    norm_share: 'Share of flight plans (%)',
    unit_count: ' cases',
    unit_percap: ' / 10k',
    unit_share: ' %',
    unit_pt: ' pt',
    suffix_count: 'cases',
    suffix_percap: '/10k',
    suffix_share: '%',
    suffix_pt: 'pt',
    pop_unknown: 'pop. unknown',

    kpi_total_label: 'Flight plans (applications)',
    kpi_total_sub_valid: 'valid rows',
    kpi_total_sub_all: 'valid rows + blanket',
    kpi_high_label: 'High-risk count',
    kpi_high_sub: 'DID/airport/night/BVLOS/drop',
    kpi_share_label: 'High-risk share',
    kpi_share_sub: 'vs. flight plans',
    kpi_munis_label: 'Municipalities shown',
    kpi_munis_sub: 'mapped points',
    kpi_hokatsu_label: 'Suspected blanket apps.',
    kpi_hokatsu_sub: 'excluded by default',

    pop_metric_now: 'Current indicator',
    pop_pop_label: 'Population (2020 Census)',
    pop_persons: '',
    legend_zero: '0 cases',
    legend_zero_generic: '0',
    legend_over: ' and over',

    period_fmt: (f, t) => `Period: ${f} – ${t}`,
    meta_fmt: (m) => `Aggregated: ~${m.total_records.toLocaleString('en-US')} flight plans / ${m.municipalities.toLocaleString('en-US')} municipalities / ${m.matched_to_census.toLocaleString('en-US')} matched to Census / generated ${m.generated}`,
    load_error: 'Failed to load data. Please check that the aggregated data (data/*.json) has been generated.',
    norm_avg_disabled: 'The score average is already normalized and is shown as a fixed value.',

    metrics: {
      high_risk: 'High-risk (composite)', did: 'DID (densely inhabited)', airport: 'Airport vicinity',
      high150: 'Above 150m', night: 'Night', bvlos: 'BVLOS', drop: 'Object dropping',
      hazmat: 'Hazardous materials', low30: 'Within 30m', event: 'Over event sites',
      monitoring: 'Access-control measures', moored: 'Tethered',
      total: 'Total flight plans', score_avg: 'Avg. risk score',
    },
  },
};
