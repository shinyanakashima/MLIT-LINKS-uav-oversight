'use strict';

// 表示指標。ラベルは i18n 辞書 (I18N[lang].metrics) から引く。
const METRICS = [
  { key: 'high_risk', kind: 'count' }, { key: 'did', kind: 'count' },
  { key: 'airport', kind: 'count' }, { key: 'high150', kind: 'count' },
  { key: 'night', kind: 'count' }, { key: 'bvlos', kind: 'count' },
  { key: 'drop', kind: 'count' }, { key: 'hazmat', kind: 'count' },
  { key: 'low30', kind: 'count' }, { key: 'event', kind: 'count' },
  { key: 'monitoring', kind: 'count' }, { key: 'moored', kind: 'count' },
  { key: 'total', kind: 'count' }, { key: 'score_avg', kind: 'avg' },
];
const NORMS = ['count', 'percap', 'share'];

const PALETTE = ['#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];

const state = {
  munis: [], monthly: [], meta: null,
  metric: 'high_risk', norm: 'count', pref: '', includeHokatsu: false,
  lang: 'ja',
};
let map, markerLayer, breaks = [];

function t(key) { return I18N[state.lang][key]; }
function metricLabel(key) { return I18N[state.lang].metrics[key]; }
const numFmt = () => (state.lang === 'en' ? 'en-US' : 'ja-JP');
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString(numFmt()));
const fmt1 = (n) => (n == null ? '—' : Number(n).toLocaleString(numFmt(), { maximumFractionDigits: 1 }));

function metricDef() { return METRICS.find((m) => m.key === state.metric); }

function rawCount(m, key) {
  if (key === 'total') return state.includeHokatsu ? m.total_all : m.total_valid;
  return m[key] || 0;
}

function displayValue(m) {
  const def = metricDef();
  if (def.kind === 'avg') return m.total_valid > 0 ? m.score_sum / m.total_valid : 0;
  const raw = rawCount(m, def.key);
  if (state.norm === 'percap') return m.pop ? (raw / m.pop) * 10000 : null;
  if (state.norm === 'share') {
    const denom = state.includeHokatsu ? m.total_all : m.total_valid;
    return denom > 0 ? (raw / denom) * 100 : 0;
  }
  return raw;
}

function valueUnit() {
  const def = metricDef();
  if (def.kind === 'avg') return t('unit_pt');
  if (state.norm === 'percap') return t('unit_percap');
  if (state.norm === 'share') return t('unit_share');
  return t('unit_count');
}

// 凡例・見出し用の短い単位サフィックス
function unitSuffix() {
  const def = metricDef();
  if (def.kind === 'avg') return t('suffix_pt');
  if (state.norm === 'percap') return t('suffix_percap');
  if (state.norm === 'share') return t('suffix_share');
  return t('suffix_count');
}

function valueText(v) {
  if (v == null) return t('pop_unknown');
  return (state.norm === 'count' && metricDef().kind === 'count') ? fmt(v) + valueUnit() : fmt1(v) + valueUnit();
}

function activeMunis() {
  let list = state.munis.filter((m) => m.lat != null && m.lon != null);
  if (state.pref) list = list.filter((m) => m.pref === state.pref);
  return list;
}

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
  const M = I18N[state.lang].metrics;
  const rows = [
    [M.high_risk, fmt(m.high_risk)],
    [M.did, fmt(m.did)], [M.airport, fmt(m.airport)],
    [M.night, fmt(m.night)], [M.bvlos, fmt(m.bvlos)], [M.drop, fmt(m.drop)],
    [M.monitoring, fmt(m.monitoring)],
    [M.total, fmt(m.total_valid)],
    [t('pop_pop_label'), m.pop ? fmt(m.pop) + t('pop_persons') : '—'],
  ];
  const body = rows.map((r) => `<tr><td>${r[0]}</td><td class="v">${r[1]}</td></tr>`).join('');
  return `<div class="popup-title">${m.origin}</div>`
    + `<div>${t('pop_metric_now')}: <strong>${metricLabel(state.metric)}</strong> = ${valueText(v)}</div>`
    + `<table class="popup-table">${body}</table>`;
}

function renderRanking(withVal) {
  const sorted = withVal.filter((x) => x.v != null).sort((a, b) => b.v - a.v).slice(0, 30);
  document.getElementById('rankMetricLabel').textContent =
    '— ' + metricLabel(state.metric) + '(' + unitSuffix().trim() + ')';
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
  const totalSub = (state.pref || t('nationwide')) + ' / '
    + (state.includeHokatsu ? t('kpi_total_sub_all') : t('kpi_total_sub_valid'));
  const cards = [
    { label: t('kpi_total_label'), value: fmt(denom), sub: totalSub },
    { label: t('kpi_high_label'), value: fmt(high), sub: t('kpi_high_sub') },
    { label: t('kpi_share_label'), value: denom ? fmt1((high / denom) * 100) + ' %' : '—', sub: t('kpi_share_sub') },
    { label: t('kpi_munis_label'), value: fmt(list.length), sub: t('kpi_munis_sub') },
    { label: t('kpi_hokatsu_label'), value: fmt(list.reduce((a, m) => a + m.hokatsu, 0)), sub: t('kpi_hokatsu_sub') },
  ];
  document.getElementById('kpis').innerHTML = cards.map((c) =>
    `<div class="kpi"><div class="k-label">${c.label}</div><div class="k-value">${c.value}</div><div class="k-sub">${c.sub}</div></div>`
  ).join('');
}

function renderLegend() {
  const el = document.getElementById('legend');
  if (!breaks.length) { el.innerHTML = ''; return; }
  const title = metricLabel(state.metric) + '(' + unitSuffix().trim() + ')';
  let rows = `<h4>${title}</h4>`;
  let prev = 0;
  for (let i = 0; i < breaks.length; i++) {
    rows += `<div class="row"><span class="swatch" style="background:${PALETTE[i]}"></span><span>${fmt1(prev)} 〜 ${fmt1(breaks[i])}</span></div>`;
    prev = breaks[i];
  }
  rows += `<div class="row"><span class="swatch" style="background:${PALETTE[PALETTE.length - 1]}"></span><span>${fmt1(prev)}${t('legend_over')}</span></div>`;
  const zero = (state.norm === 'count' && metricDef().kind === 'count') ? t('legend_zero') : t('legend_zero_generic');
  rows += `<div class="row"><span class="swatch" style="background:#dfe6ec"></span><span>${zero}</span></div>`;
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

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img">`;
  svg += `<line x1="${PADL}" y1="${PADT + plotH}" x2="${W - PADR}" y2="${PADT + plotH}" stroke="#cfd8e0"/>`;
  for (let i = 0; i < series.length; i++) {
    const s = series[i], x = xCenter(i), y = yTot(s.total);
    svg += `<rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${PADT + plotH - y}" fill="#9db8d6" rx="2"><title>${s.month} ${fmt(s.total)}</title></rect>`;
    svg += `<text x="${x}" y="${H - 14}" font-size="11" text-anchor="middle" fill="#5c6b7a">${s.month.slice(2)}</text>`;
  }
  const line = series.map((s, i) => `${xCenter(i)},${yHigh(s.high)}`).join(' ');
  svg += `<polyline points="${line}" fill="none" stroke="#c0392b" stroke-width="2"/>`;
  for (let i = 0; i < series.length; i++) {
    svg += `<circle cx="${xCenter(i)}" cy="${yHigh(series[i].high)}" r="3.2" fill="#c0392b"><title>${series[i].month} ${fmt(series[i].high)}</title></circle>`;
  }
  svg += `<text x="${PADL - 8}" y="${PADT + 6}" font-size="10" text-anchor="end" fill="#5c6b7a">${fmt(maxTotal)}</text>`;
  svg += `<text x="${W - PADR + 8}" y="${PADT + 6}" font-size="10" fill="#c0392b">${fmt(maxHigh)}</text>`;
  svg += `</svg>`;
  el.innerHTML = svg;
}

// ── i18n 適用 ───────────────────────────────────────────────
function applyStaticI18n() {
  document.documentElement.lang = t('htmlLang');
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
  document.getElementById('hokatsuHint').title = t('hokatsu_hint');
  if (state.meta) {
    document.getElementById('periodBadge').textContent = t('period_fmt')(state.meta.period.from, state.meta.period.to);
    document.getElementById('metaLine').textContent = t('meta_fmt')(state.meta);
  }
  document.querySelectorAll('.lang-btn').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
}

function populateMetricOptions() {
  const ms = document.getElementById('metricSelect');
  ms.innerHTML = METRICS.map((m) => `<option value="${m.key}">${metricLabel(m.key)}</option>`).join('');
  ms.value = state.metric;
}

function populateNormOptions() {
  const ns = document.getElementById('normSelect');
  ns.innerHTML = NORMS.map((k) => `<option value="${k}">${t('norm_' + k)}</option>`).join('');
  ns.value = state.norm;
}

function populatePrefOptions() {
  const prefs = [...new Set(state.munis.map((m) => m.pref).filter(Boolean))].sort();
  const ps = document.getElementById('prefSelect');
  ps.innerHTML = `<option value="">${t('nationwide')}</option>`
    + prefs.map((p) => `<option value="${p}">${p}</option>`).join('');
  ps.value = state.pref;
}

function setLang(lang) {
  if (!I18N[lang]) return;
  state.lang = lang;
  try { localStorage.setItem('lang', lang); } catch (e) { /* ignore */ }
  applyStaticI18n();
  populateMetricOptions();
  populateNormOptions();
  populatePrefOptions();
  syncNormAvailability();
  render();
}

function bindControls() {
  document.getElementById('metricSelect').addEventListener('change', (e) => { state.metric = e.target.value; syncNormAvailability(); render(); });
  document.getElementById('normSelect').addEventListener('change', (e) => { state.norm = e.target.value; render(); });
  document.getElementById('prefSelect').addEventListener('change', (e) => { state.pref = e.target.value; render(); fitToActive(); });
  document.getElementById('hokatsuChk').addEventListener('change', (e) => { state.includeHokatsu = e.target.checked; render(); });
  document.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
}

function syncNormAvailability() {
  const isAvg = metricDef().kind === 'avg';
  const ns = document.getElementById('normSelect');
  ns.disabled = isAvg;
  ns.title = isAvg ? t('norm_avg_disabled') : '';
}

function fitToActive() {
  const list = activeMunis();
  if (!list.length) return;
  if (state.pref) {
    map.fitBounds(L.latLngBounds(list.map((m) => [m.lat, m.lon])).pad(0.15));
  } else {
    map.setView([37.5, 137.2], 5);
  }
}

function detectLang() {
  try {
    const saved = localStorage.getItem('lang');
    if (saved && I18N[saved]) return saved;
  } catch (e) { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ja';
}

async function init() {
  state.lang = detectLang();
  map = L.map('map', { preferCanvas: true, scrollWheelZoom: true }).setView([37.5, 137.2], 5);
  L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', {
    attribution: '地理院タイル(国土地理院)', maxZoom: 18,
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  bindControls();

  try {
    const [munis, monthly, meta] = await Promise.all([
      fetch('data/municipalities.json').then((r) => r.json()),
      fetch('data/monthly.json').then((r) => r.json()),
      fetch('data/meta.json').then((r) => r.json()).catch(() => null),
    ]);
    state.munis = munis;
    state.monthly = monthly;
    state.meta = meta;
    setLang(state.lang);
  } catch (e) {
    document.getElementById('map').innerHTML = `<div style="padding:20px">${t('load_error')}</div>`;
    console.error(e);
  }
}

document.addEventListener('DOMContentLoaded', init);
