import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MapView, { type MapFeature, type LegendInfo } from '@/components/MapView';
import TrendChart, { type TrendPoint } from '@/components/TrendChart';
import { I18N, type MetricKey } from '@/lib/i18n';
import {
  METRIC_KEYS, NORMS, colorFor, computeBreaks, displayValue, fmt, fmt1,
  metricKind, rawCount, unitSuffix, valueText, radiusFor,
} from '@/lib/metrics';
import type { Basemap, Lang, Meta, Municipality, MonthlyRow, Norm } from '@/lib/types';
import { cn } from '@/lib/utils';

const ALL = '__all__';

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem('lang');
    if (saved === 'ja' || saved === 'en') return saved;
  } catch { /* ignore */ }
  return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ja';
}

export default function App() {
  const [lang, setLang] = useState<Lang>(detectLang);
  const [metric, setMetric] = useState<MetricKey>('high_risk');
  const [norm, setNorm] = useState<Norm>('count');
  const [pref, setPref] = useState('');
  const [includeHokatsu, setIncludeHokatsu] = useState(false);
  const [basemap, setBasemap] = useState<Basemap>('std');
  const [focus, setFocus] = useState<{ lon: number; lat: number; html: string } | null>(null);

  const [munis, setMunis] = useState<Municipality[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [error, setError] = useState(false);

  const dict = I18N[lang];

  useEffect(() => {
    const base = import.meta.env.BASE_URL;
    Promise.all([
      fetch(`${base}data/municipalities.json`).then((r) => r.json()),
      fetch(`${base}data/monthly.json`).then((r) => r.json()),
      fetch(`${base}data/meta.json`).then((r) => r.json()).catch(() => null),
    ])
      .then(([mu, mo, me]) => { setMunis(mu); setMonthly(mo); setMeta(me); })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    document.documentElement.lang = dict.htmlLang;
    document.title = `${dict.title}`;
    try { localStorage.setItem('lang', lang); } catch { /* ignore */ }
  }, [lang, dict.htmlLang, dict.title]);

  const prefs = useMemo(
    () => [...new Set(munis.map((m) => m.pref).filter((p): p is string => !!p))].sort(),
    [munis],
  );

  const active = useMemo(
    () => munis.filter((m) => m.lat != null && m.lon != null && (!pref || m.pref === pref)),
    [munis, pref],
  );

  const isAvg = metricKind(metric) === 'avg';

  const buildPopup = (m: Municipality, v: number | null) => {
    const M = dict.metrics;
    const rows: [string, string][] = [
      [M.high_risk, fmt(m.high_risk, lang)],
      [M.did, fmt(m.did, lang)], [M.airport, fmt(m.airport, lang)],
      [M.night, fmt(m.night, lang)], [M.bvlos, fmt(m.bvlos, lang)], [M.drop, fmt(m.drop, lang)],
      [M.monitoring, fmt(m.monitoring, lang)],
      [M.total, fmt(m.total_valid, lang)],
      [dict.pop_pop_label, m.pop ? fmt(m.pop, lang) + dict.pop_persons : '—'],
    ];
    const body = rows.map(([k, val]) => `<tr><td style="padding:1px 8px 1px 0">${k}</td><td style="text-align:right;font-weight:600" class="tabular">${val}</td></tr>`).join('');
    return `<div style="font-weight:700;margin-bottom:4px">${m.origin}</div>`
      + `<div>${dict.pop_metric_now}: <strong>${dict.metrics[metric]}</strong> = ${valueText(v, dict, metric, norm, lang)}</div>`
      + `<table style="border-collapse:collapse;margin-top:4px">${body}</table>`;
  };

  const { features, breaks, maxV } = useMemo(() => {
    const valued = active.map((m) => ({ m, v: displayValue(m, metric, norm, includeHokatsu) }));
    const bks = computeBreaks(valued.map((x) => x.v));
    const mx = valued.reduce((a, x) => (x.v != null && x.v > a ? x.v : a), 0);
    const feats: MapFeature[] = valued.map(({ m, v }) => ({
      lon: m.lon as number,
      lat: m.lat as number,
      color: colorFor(v, bks),
      r: radiusFor(v, mx),
      html: buildPopup(m, v),
    }));
    return { features: feats, breaks: bks, maxV: mx };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, metric, norm, includeHokatsu, lang]);
  void maxV;

  const ranking = useMemo(() => {
    return active
      .map((m) => ({ m, v: displayValue(m, metric, norm, includeHokatsu) }))
      .filter((x): x is { m: Municipality; v: number } => x.v != null)
      .sort((a, b) => b.v - a.v)
      .slice(0, 30);
  }, [active, metric, norm, includeHokatsu]);

  const legend: LegendInfo = {
    breaks,
    title: `${dict.metrics[metric]}(${unitSuffix(dict, metric, norm).trim()})`,
    zeroLabel: (norm === 'count' && !isAvg) ? dict.legend_zero : dict.legend_zero_generic,
    overLabel: dict.legend_over,
    fmt: (n: number) => fmt1(n, lang),
  };

  const kpis = useMemo(() => {
    const sumHigh = active.reduce((a, m) => a + rawCount(m, 'high_risk', includeHokatsu), 0);
    const totalAll = active.reduce((a, m) => a + m.total_all, 0);
    const totalValid = active.reduce((a, m) => a + m.total_valid, 0);
    const denom = includeHokatsu ? totalAll : totalValid;
    const hok = active.reduce((a, m) => a + m.hokatsu, 0);
    return [
      { label: dict.kpi_total_label, value: fmt(denom, lang), sub: `${pref || dict.nationwide} / ${includeHokatsu ? dict.kpi_total_sub_all : dict.kpi_total_sub_valid}` },
      { label: dict.kpi_high_label, value: fmt(sumHigh, lang), sub: dict.kpi_high_sub },
      { label: dict.kpi_share_label, value: denom ? `${fmt1((sumHigh / denom) * 100, lang)} %` : '—', sub: dict.kpi_share_sub },
      { label: dict.kpi_munis_label, value: fmt(active.length, lang), sub: dict.kpi_munis_sub },
      { label: dict.kpi_hokatsu_label, value: fmt(hok, lang), sub: dict.kpi_hokatsu_sub },
    ];
  }, [active, includeHokatsu, pref, dict, lang]);

  const trend: TrendPoint[] = useMemo(() => monthly.map((row) => {
    if (pref) {
      const p = row.prefectures?.[pref] ?? { total_valid: 0, high_risk: 0 };
      return { month: row.month, total: p.total_valid, high: p.high_risk };
    }
    return { month: row.month, total: row.total_valid, high: row.high_risk };
  }), [monthly, pref]);

  if (error) {
    return <div className="p-8 text-sm">{dict.load_error}</div>;
  }

  return (
    <div className="mx-auto max-w-[1280px] px-5 pb-12">
      {/* ヘッダー */}
      <header className="-mx-5 mb-4 bg-primary px-5 pb-3 pt-4 text-primary-foreground">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">{dict.title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-primary-foreground/85">{dict.subtitle}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="inline-flex overflow-hidden rounded-full border border-primary-foreground/40 text-xs">
              {(['ja', 'en'] as Lang[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLang(l)}
                  className={cn('px-3 py-1 transition-colors', lang === l ? 'bg-card font-bold text-primary' : 'text-primary-foreground/85 hover:bg-white/10')}
                >
                  {l === 'ja' ? '日本語' : 'English'}
                </button>
              ))}
            </div>
            {meta && (
              <span className="rounded-full border border-primary-foreground/30 bg-white/10 px-2.5 py-1 text-xs">
                {dict.period_fmt(meta.period.from, meta.period.to)}
              </span>
            )}
          </div>
        </div>
      </header>

      <div
        className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-center text-[0.82rem] text-amber-900"
        dangerouslySetInnerHTML={{ __html: `<strong>${lang === 'ja' ? 'ご注意' : 'Note'}:</strong> ${dict.disclaimer}` }}
      />

      {/* コントロール */}
      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <LabeledSelect label={dict.ctrl_metric} value={metric} onChange={(v) => setMetric(v as MetricKey)}
            options={METRIC_KEYS.map((m) => ({ value: m.key, label: dict.metrics[m.key] }))} />
          <LabeledSelect label={dict.ctrl_norm} value={norm} onChange={(v) => setNorm(v as Norm)} disabled={isAvg}
            options={NORMS.map((k) => ({ value: k, label: dict[`norm_${k}` as const] }))} />
          <LabeledSelect label={dict.ctrl_pref} value={pref || ALL}
            onChange={(v) => setPref(v === ALL ? '' : v)}
            options={[{ value: ALL, label: dict.nationwide }, ...prefs.map((p) => ({ value: p, label: p }))]} />
          <label className="flex items-center gap-2 pb-1 text-sm" title={dict.hokatsu_hint}>
            <input type="checkbox" checked={includeHokatsu} onChange={(e) => setIncludeHokatsu(e.target.checked)} />
            {dict.ctrl_hokatsu}
          </label>
        </CardContent>
      </Card>

      {/* KPI */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-3.5">
              <div className="text-[0.74rem] text-muted-foreground">{c.label}</div>
              <div className="mt-0.5 text-2xl font-bold text-primary tabular">{c.value}</div>
              <div className="mt-0.5 text-[0.72rem] text-muted-foreground">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 地図 + ランキング（高さはレイアウト側が定義し、各コンポーネントは満たすだけ） */}
      <div className="grid gap-4 lg:h-[clamp(420px,70vh,680px)] lg:grid-cols-[1fr_360px]">
        <div className="h-[60vh] min-h-[360px] lg:h-full">
          <MapView features={features} legend={legend} basemap={basemap} onBasemapChange={setBasemap} dict={dict} focus={focus} />
        </div>
        <Card className="overflow-hidden lg:h-full">
          <CardContent className="h-full overflow-auto p-4">
            <h2 className="mb-2.5 text-base font-semibold">
              {dict.rank_title} <span className="text-xs font-normal text-muted-foreground">— {dict.metrics[metric]}({unitSuffix(dict, metric, norm).trim()})</span>
            </h2>
            <ol className="space-y-0">
              {ranking.map(({ m, v }, i) => (
                <li
                  key={m.origin}
                  onClick={() => setFocus({ lon: m.lon as number, lat: m.lat as number, html: buildPopup(m, v) })}
                  className="flex cursor-pointer items-baseline gap-2 rounded-md border-b border-border/60 px-1 py-1.5 last:border-0 hover:bg-accent"
                >
                  <span className="min-w-[1.6em] text-right font-bold tabular text-muted-foreground">{i + 1}</span>
                  <span className="flex-1 text-sm leading-tight">
                    {m.name || m.origin}
                    <small className="block text-[0.72rem] text-muted-foreground">{m.pref}</small>
                  </span>
                  <span className="font-bold tabular text-destructive">{valueText(v, dict, metric, norm, lang)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>

      {/* 月次推移 */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <h2 className="mb-2 text-base font-semibold">{dict.trend_title}</h2>
          <TrendChart series={trend} lang={lang} />
          <p className="mt-1.5 text-xs text-muted-foreground">{dict.trend_note}</p>
        </CardContent>
      </Card>

      {/* 注記 */}
      <Card className="mt-4">
        <CardContent className="p-4">
          <h2 className="mb-2 text-base font-semibold">{dict.notes_title}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {dict.notes_list.map((html, i) => (
              <li key={i} dangerouslySetInnerHTML={{ __html: html }} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* フッター */}
      <footer className="mt-6 space-y-1.5 text-xs text-muted-foreground">
        <p className="text-foreground" dangerouslySetInnerHTML={{ __html: dict.attribution }} />
        {meta && <p className="tabular">{dict.meta_fmt(meta)}</p>}
        <p dangerouslySetInnerHTML={{ __html: dict.license }} />
      </footer>
    </div>
  );
}

function LabeledSelect({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.76rem] font-semibold text-muted-foreground">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="min-w-[200px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
