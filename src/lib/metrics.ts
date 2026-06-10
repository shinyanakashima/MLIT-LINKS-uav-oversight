import type { Dict, MetricKey } from './i18n';
import type { Lang, Municipality, Norm } from './types';

export const METRIC_KEYS: { key: MetricKey; kind: 'count' | 'avg' }[] = [
  { key: 'high_risk', kind: 'count' }, { key: 'did', kind: 'count' },
  { key: 'airport', kind: 'count' }, { key: 'high150', kind: 'count' },
  { key: 'night', kind: 'count' }, { key: 'bvlos', kind: 'count' },
  { key: 'drop', kind: 'count' }, { key: 'hazmat', kind: 'count' },
  { key: 'low30', kind: 'count' }, { key: 'event', kind: 'count' },
  { key: 'monitoring', kind: 'count' }, { key: 'moored', kind: 'count' },
  { key: 'total', kind: 'count' }, { key: 'score_avg', kind: 'avg' },
];

export const NORMS: Norm[] = ['count', 'percap', 'share'];

// 連続配色 (YlOrRd 系)
export const PALETTE = ['#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#f03b20', '#bd0026'];
export const ZERO_COLOR = '#dfe6ec';

export function metricKind(key: MetricKey): 'count' | 'avg' {
  return METRIC_KEYS.find((m) => m.key === key)?.kind ?? 'count';
}

export function rawCount(m: Municipality, key: MetricKey, includeHokatsu: boolean): number {
  if (key === 'total') return includeHokatsu ? m.total_all : m.total_valid;
  if (key === 'score_avg') return m.score_sum;
  return (m[key as keyof Municipality] as number) || 0;
}

export function displayValue(
  m: Municipality, metric: MetricKey, norm: Norm, includeHokatsu: boolean,
): number | null {
  if (metricKind(metric) === 'avg') return m.total_valid > 0 ? m.score_sum / m.total_valid : 0;
  const raw = rawCount(m, metric, includeHokatsu);
  if (norm === 'percap') return m.pop ? (raw / m.pop) * 10000 : null;
  if (norm === 'share') {
    const denom = includeHokatsu ? m.total_all : m.total_valid;
    return denom > 0 ? (raw / denom) * 100 : 0;
  }
  return raw;
}

export function computeBreaks(values: (number | null)[]): number[] {
  const vals = values.filter((v): v is number => v != null && v > 0).sort((a, b) => a - b);
  if (!vals.length) return [];
  const qs = [0.5, 0.7, 0.85, 0.94, 0.98];
  return qs.map((q) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))]);
}

export function colorFor(v: number | null, breaks: number[]): string {
  if (v == null) return '#b8c2cc';
  if (v <= 0) return ZERO_COLOR;
  for (let i = 0; i < breaks.length; i++) if (v <= breaks[i]) return PALETTE[i];
  return PALETTE[PALETTE.length - 1];
}

export function radiusFor(v: number | null, maxV: number): number {
  if (!v || v <= 0 || !maxV) return 3;
  return 4 + 18 * Math.sqrt(v / maxV);
}

export function numLocale(lang: Lang): string {
  return lang === 'en' ? 'en-US' : 'ja-JP';
}

export function fmt(n: number | null | undefined, lang: Lang): string {
  return n == null ? '—' : Number(n).toLocaleString(numLocale(lang));
}

export function fmt1(n: number | null | undefined, lang: Lang): string {
  return n == null ? '—' : Number(n).toLocaleString(numLocale(lang), { maximumFractionDigits: 1 });
}

export function valueUnit(dict: Dict, metric: MetricKey, norm: Norm): string {
  if (metricKind(metric) === 'avg') return dict.unit_pt;
  if (norm === 'percap') return dict.unit_percap;
  if (norm === 'share') return dict.unit_share;
  return dict.unit_count;
}

export function unitSuffix(dict: Dict, metric: MetricKey, norm: Norm): string {
  if (metricKind(metric) === 'avg') return dict.suffix_pt;
  if (norm === 'percap') return dict.suffix_percap;
  if (norm === 'share') return dict.suffix_share;
  return dict.suffix_count;
}

// ランキング・ポップアップ用の整形済み文字列
export function valueText(
  v: number | null, dict: Dict, metric: MetricKey, norm: Norm, lang: Lang,
): string {
  if (v == null) return dict.pop_unknown;
  const isPlainCount = norm === 'count' && metricKind(metric) === 'count';
  return (isPlainCount ? fmt(v, lang) : fmt1(v, lang)) + valueUnit(dict, metric, norm);
}
