import { useMemo } from 'react';
import type { Lang } from '@/lib/types';
import { fmt } from '@/lib/metrics';

export interface TrendPoint { month: string; total: number; high: number; }

export default function TrendChart({ series, lang }: { series: TrendPoint[]; lang: Lang }) {
  const svg = useMemo(() => {
    if (!series.length) return null;
    const W = Math.max(640, series.length * 78), H = 240;
    const PADL = 56, PADR = 44, PADB = 34, PADT = 12;
    const maxTotal = Math.max(1, ...series.map((s) => s.total));
    const maxHigh = Math.max(1, ...series.map((s) => s.high));
    const plotW = W - PADL - PADR, plotH = H - PADT - PADB;
    const bw = (plotW / series.length) * 0.6;
    const xC = (i: number) => PADL + (i + 0.5) * (plotW / series.length);
    const yT = (v: number) => PADT + plotH - (v / maxTotal) * plotH;
    const yH = (v: number) => PADT + plotH - (v / maxHigh) * plotH;
    const line = series.map((s, i) => `${xC(i)},${yH(s.high)}`).join(' ');
    return { W, H, PADL, PADR, PADB, PADT, plotH, bw, xC, yT, yH, line, maxTotal, maxHigh };
  }, [series]);

  if (!svg) return null;
  const { W, H, PADL, PADR, PADT, plotH, bw, xC, yT, yH, line, maxTotal, maxHigh } = svg;

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" className="max-w-full">
        <line x1={PADL} y1={PADT + plotH} x2={W - PADR} y2={PADT + plotH} stroke="#cfd8e0" />
        {series.map((s, i) => {
          const y = yT(s.total);
          return (
            <g key={s.month}>
              <rect x={xC(i) - bw / 2} y={y} width={bw} height={PADT + plotH - y} fill="#9db8d6" rx={2}>
                <title>{s.month} {fmt(s.total, lang)}</title>
              </rect>
              <text x={xC(i)} y={H - 14} fontSize={11} textAnchor="middle" fill="#5c6b7a">{s.month.slice(2)}</text>
            </g>
          );
        })}
        <polyline points={line} fill="none" stroke="#c0392b" strokeWidth={2} />
        {series.map((s, i) => (
          <circle key={s.month} cx={xC(i)} cy={yH(s.high)} r={3.2} fill="#c0392b">
            <title>{s.month} {fmt(s.high, lang)}</title>
          </circle>
        ))}
        <text x={PADL - 8} y={PADT + 6} fontSize={10} textAnchor="end" fill="#5c6b7a">{fmt(maxTotal, lang)}</text>
        <text x={W - PADR + 8} y={PADT + 6} fontSize={10} fill="#c0392b">{fmt(maxHigh, lang)}</text>
      </svg>
    </div>
  );
}
