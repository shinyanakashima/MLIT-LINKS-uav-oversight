'use strict';

// 表示指標の定義。kind: 'count' は件数系(正規化可)、'avg' はスコア平均(正規化不可)。
const METRICS = [
  { key: 'high_risk',   label: '高リスク(合成)',     kind: 'count', unit: '件' },
  { key: 'did',         label: 'DID(人口集中地区)',  kind: 'count', unit: '件' },
  { key: 'airport',     label: '空港等周辺',          kind: 'count', unit: '件' },
  { key: 'high150',     label: '150m以上',            kind: 'count', unit: '件' },
  { key: 'night',       label: '夜間',                kind: 'count', unit: '件' },
  { key: 'bvlos',       label: '目視外',              kind: 'count', unit: '件' },
  { key: 'drop',        label: '物件投下',            kind: 'count', unit: '件' },
  { key: 'hazmat',      label: '危険物',              kind: 'count', unit: '件' },
  { key: 'low30',       label: '30m未満',             kind: 'count', unit: '件' },
  { key: 'event',       label: '催し物上空',          kind: 'count', unit: '件' },
  { key: 'monitoring',  label: '立入監視措置あり',     kind: 'count', unit: '件' },
  { key: 'moored',      label: '係留あり',            kind: 'count', unit: '件' },
  { key: 'total',       label: '飛行計画 総数',        kind: 'count', unit: '件' },
  { key: 'score_avg',   label: 'リスクスコア 平均',    kind: 'avg',   unit: '' },
];

// 5段階の連続配色 (YlOrRd 系)
const PALETTE = ['#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];

const state = {
  munis: [], monthly: [], meta: null,
  metric: 'high_risk', norm: 'count', pref: '', includeHokatsu: false,
};
let map, markerLayer, breaks = [];

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('ja-JP'));
const fmt1 = (n) => (n == null ? '—' : Number(n).toLocaleString('ja-JP', { maximumFractionDigits: 1 }));

function metricDef() { return METRICS.find((m) => m.key === state.metric); }

// 1 自治体の「件数」生値(指標別)。total は包括の扱いで分母を切り替える。
function rawCount(m, key) {
  if (key === 'total') return state.includeHokatsu ? m.total_all : m.total_valid;
  return m[key] || 0;
}

// 表示値(正規化適用後)
function displayValue(m) {
  const def = metricDef();
  if (def.kind === 'avg') {
    return m.total_valid > 0 ? m.score_sum / m.total_valid : 0;
  }
  const raw = rawCount(m, def.key);
  if (state.norm === 'percap') {
    return m.pop ? (raw / m.pop) * 10000 : null;
  }
  if (state.norm === 'share') {
    const denom = state.includeHokatsu ? m.total_all : m.total_valid;
    return denom > 0 ? (raw / denom) * 100 : 0;
  }
  return raw;
}

function valueUnit() {
  const def = metricDef();
  if (def.kind === 'avg') return ' pt';
  if (state.norm === 'percap') return ' 件/万人';
  if (state.norm === 'share') return ' %';
  return ' 件';
}

function valueText(v) {
  if (v == null) return '人口不明';
  return (state.norm === 'count' && metricDef().kind === 'count') ? fmt(v) + valueUnit() : fmt1(v) + valueUnit();
}

function activeMunis() {
  let list = state.munis.filter((m) => m.lat != null && m.lon != null);
  if (state.pref) list = list.filter((m) => m.pref === state.pref);
  return list;
}

// 表示値の分位点でクラス分け
function computeBreaks(list) {
  const vals = list.map(displayValue).filter((v) => v != null && v > 0).sort((a, b) => a - b);
  if (!vals.length) { breaks = []; return; }
  const qs = [0.5, 0.7, 0.85, 0.94, 0.98];
  breaks = qs.map((q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]);
}

function colorFor(v) {
  if (v == null) return '#b8c2cc';
  if (v <= 0) return '#dfe6ec';
  for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return PALETTE[i];
  return PALETTE[PALETTE.length - 1];
}

function radiusFor(v, maxV) {
  if (!v || v <= 0 || !maxV) return 3;
  return 4 + 18 * Math.sqrt(v / maxV);
}

function render() {
  const list = activeMunis();
  computeBreaks(list);
  const withVal = list.map((m) => ({ m, v: displayValue(m) }));
  const maxV = withVal.reduce((a, x) => (x.v != null && x.v > a ? x.v : a), 0);

  markerLayer.clearLayers();
  for (const { m, v } of withVal) {
    const marker = L.circleMarker([m.lat, m.lon], {
      radius: radiusFor(v, maxV), fillColor: colorFor(v), color: '#33414d',
      weight: 0.6, opacity: 0.9, fillOpacity: 0.75,
    });
    marker.bindPopup(popupHtml(m, v));
    markerLayer.addLayer(marker);
  }
  renderRanking(withVal);
  renderKpis(list);
  renderLegend();
  renderTrend();
}

function popupHtml(m, v) {
  const rows = [
    ['高リスク(合成)', fmt(m.high_risk)],
    ['DID', fmt(m.did)], ['空港等周辺', fmt(m.airport)],
    ['夜間', fmt(m.night)], ['目視外', fmt(m.bvlos)], ['物件投下', fmt(m.drop)],
    ['立入監視措置', fmt(m.monitoring)],
    ['飛行計画 総数(有効)', fmt(m.total_valid)],
    ['人口(R2国勢)', m.pop ? fmt(m.pop) + ' 人' : '—'],
  ];
  const body = rows.map((r) => `<tr><td>${r[0]}</td><td class="v">${r[1]}</td></tr>`).join('');
  return `<div class="popup-title">${m.origin}</div>`
    + `<div>表示中指標: <strong>${metricDef().label}</strong> = ${valueText(v)}</div>`
    + `<table class="popup-table">${body}</table>`;
}

function renderRanking(withVal) {
  const sorted = withVal
    .filter((x) => x.v != null)
    .sort((a, b) => b.v - a.v)
    .slice(0, 30);
  document.getElementById('rankMetricLabel').textContent =
    '— ' + metricDef().label + (state.norm !== 'count' || metricDef().kind === 'avg' ? '(' + valueUnit().trim() + ')' : '');
  const ol = document.getElementById('ranking');
  ol.innerHTML = '';
  for (const { m, v } of sorted) {
    const li = document.createElement('li');
    li.innerHTML = `<span class="r-name">${m.name || m.origin}<small>${m.pref || ''}</small></span>`
      + `<span class="r-val">${valueText(v)}</span>`;
    li.addEventListener('click', () => {
      map.setView([m.lat, m.lon], 10);
      L.popup().setLatLng([m.lat, m.lon]).setContent(popupHtml(m, v)).openOn(map);
    });
    ol.appendChild(li);
  }
}

function renderKpis(list) {
  const sum = (key) => list.reduce((a, m) => a + rawCount(m, key), 0);
  const totalAll = list.reduce((a, m) => a + m.total_all, 0);
  const totalValid = list.reduce((a, m) => a + m.total_valid, 0);
  const high = sum('high_risk');
  const denom = state.includeHokatsu ? totalAll : totalValid;
  const cards = [
    { label: '対象 飛行計画(申請)', value: fmt(state.includeHokatsu ? totalAll : totalValid), sub: state.pref || '全国 / 有効行' + (state.includeHokatsu ? '+包括' : '') },
    { label: '高リスク該当 件数', value: fmt(high), sub: 'DID/空港/夜間/目視外/物件投下' },
    { label: '高リスク 比率', value: denom ? fmt1((high / denom) * 100) + ' %' : '—', sub: '対 飛行計画' },
    { label: '対象 市区町村数', value: fmt(list.length), sub: '地図表示地点' },
    { label: '包括申請の疑い', value: fmt(list.reduce((a, m) => a + m.hokatsu, 0)), sub: '既定で集計除外' },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) =>
    `<div class="kpi"><div class="k-label">${c.label}</div><div class="k-value">${c.value}</div><div class="k-sub">${c.sub}</div></div>`
  ).join('');
}

function renderLegend() {
  const el = document.getElementById('legend');
  if (!breaks.length) { el.innerHTML = ''; return; }
  const def = metricDef();
  const title = def.label + (state.norm === 'percap' ? '(件/万人)' : state.norm === 'share' && def.kind === 'count' ? '(%)' : def.kind === 'avg' ? '(pt)' : '(件)');
  let rows = `<h4>${title}</h4>`;
  let prev = 0;
  for (let i = 0; i < breaks.length; i++) {
    const lo = i === 0 ? '0超' : '〜' + fmt1(prev);
    rows += `<div class="row"><span class="swatch" style="background:${PALETTE[i]}"></span><span>${fmt1(prev)} 〜 ${fmt1(breaks[i])}</span></div>`;
    prev = breaks[i];
  }
  rows += `<div class="row"><span class="swatch" style="background:${PALETTE[PALETTE.length - 1]}"></span><span>${fmt1(prev)} 以上</span></div>`;
  rows += `<div class="row"><span class="swatch" style="background:#dfe6ec"></span><span>0 件</span></div>`;
  el.innerHTML = rows;
}

function renderTrend() {
  const el = document.getElementById('trendChart');
  const series = state.monthly.map((row) => {
    if (state.pref) {
      const p = (row.prefectures && row.prefectures[state.pref]) || { total_valid: 0, high_risk: 0 };
      return { month: row.month, total: p.total_valid, high: p.high_risk };
    }
    return { month: row.month, total: row.total_valid, high: row.high_risk };
  });
  if (!series.length) { el.innerHTML = ''; return; }

  const W = Math.max(640, series.length * 78), H = 240, PADL = 56, PADR = 44, PADB = 34, PADT = 12;
  const maxTotal = Math.max(1, ...series.map((s) => s.total));
  const maxHigh = Math.max(1, ...series.map((s) => s.high));
  const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
  const bw = (plotW / series.length) * 0.6;
  const xCenter = (i) => PADL + (i + 0.5) * (plotW / series.length);
  const yTot = (v) => PADT + plotH - (v / maxTotal) * plotH;
  const yHigh = (v) => PADT + plotH - (v / maxHigh) * plotH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="月次推移">`;
  svg += `<line x1="${PADL}" y1="${PADT + plotH}" x2="${W - PADR}" y2="${PADT + plotH}" stroke="#cfd8e0"/>`;
  for (let i = 0; i < series.length; i++) {
    const s = series[i], x = xCenter(i), y = yTot(s.total);
    svg += `<rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${PADT + plotH - y}" fill="#9db8d6" rx="2"><title>${s.month} 総数 ${fmt(s.total)}</title></rect>`;
    svg += `<text x="${x}" y="${H - 14}" font-size="11" text-anchor="middle" fill="#5c6b7a">${s.month.slice(2)}</text>`;
  }
  const line = series.map((s, i) => `${xCenter(i)},${yHigh(s.high)}`).join(' ');
  svg += `<polyline points="${line}" fill="none" stroke="#c0392b" stroke-width="2"/>`;
  for (let i = 0; i < series.length; i++) {
    svg += `<circle cx="${xCenter(i)}" cy="${yHigh(series[i].high)}" r="3.2" fill="#c0392b"><title>${series[i].month} 高リスク ${fmt(series[i].high)}</title></circle>`;
  }
  svg += `<text x="${PADL - 8}" y="${PADT + 6}" font-size="10" text-anchor="end" fill="#5c6b7a">${fmt(maxTotal)}</text>`;
  svg += `<text x="${W - PADR + 8}" y="${PADT + 6}" font-size="10" fill="#c0392b">${fmt(maxHigh)}</text>`;
  svg += `</svg>`;
  el.innerHTML = svg;
}

function populateControls() {
  const ms = document.getElementById('metricSelect');
  ms.innerHTML = METRICS.map((m) => `<option value="${m.key}">${m.label}</option>`).join('');
  ms.value = state.metric;
  const prefs = [...new Set(state.munis.map((m) => m.pref).filter(Boolean))].sort();
  const ps = document.getElementById('prefSelect');
  ps.innerHTML = '<option value="">全国</option>' + prefs.map((p) => `<option value="${p}">${p}</option>`).join('');

  ms.addEventListener('change', () => { state.metric = ms.value; syncNormAvailability(); render(); });
  document.getElementById('normSelect').addEventListener('change', (e) => { state.norm = e.target.value; render(); });
  ps.addEventListener('change', () => {
    state.pref = ps.value;
    render();
    fitToActive();
  });
  document.getElementById('hokatsuChk').addEventListener('change', (e) => { state.includeHokatsu = e.target.checked; render(); });
  syncNormAvailability();
}

function syncNormAvailability() {
  const isAvg = metricDef().kind === 'avg';
  const ns = document.getElementById('normSelect');
  ns.disabled = isAvg;
  ns.title = isAvg ? 'スコア平均は正規化済みのため固定表示です' : '';
}

function fitToActive() {
  const list = activeMunis();
  if (!list.length) return;
  if (state.pref) {
    const b = L.latLngBounds(list.map((m) => [m.lat, m.lon]));
    map.fitBounds(b.pad(0.15));
  } else {
    map.setView([37.5, 137.2], 5);
  }
}

async function init() {
  map = L.map('map', { preferCanvas: true, scrollWheelZoom: true }).setView([37.5, 137.2], 5);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '地理院タイル(国土地理院)', maxZoom: 18,
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);

  try {
    const [munis, monthly, meta] = await Promise.all([
      fetch('data/municipalities.json').then((r) => r.json()),
      fetch('data/monthly.json').then((r) => r.json()),
      fetch('data/meta.json').then((r) => r.json()).catch(() => null),
    ]);
    state.munis = munis;
    state.monthly = monthly;
    state.meta = meta;
    if (meta) {
      document.getElementById('periodBadge').textContent =
        `対象期間: ${meta.period.from} 〜 ${meta.period.to}`;
      document.getElementById('metaLine').textContent =
        `集計: 飛行計画 約${fmt(meta.total_records)}件 / 市区町村 ${fmt(meta.municipalities)} / 国勢調査突合 ${fmt(meta.matched_to_census)} / 生成日 ${meta.generated}`;
    }
    populateControls();
    render();
  } catch (e) {
    document.getElementById('map').innerHTML =
      '<div style="padding:20px">データの読み込みに失敗しました。集計データ(data/*.json)が生成されているか確認してください。</div>';
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
