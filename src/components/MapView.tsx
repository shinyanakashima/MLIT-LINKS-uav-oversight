import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import type { Basemap } from '@/lib/types';
import type { Dict } from '@/lib/i18n';
import { PALETTE, ZERO_COLOR } from '@/lib/metrics';
import { cn } from '@/lib/utils';

export interface MapFeature {
  lon: number;
  lat: number;
  color: string;
  r: number;
  html: string;
}

export interface LegendInfo {
  breaks: number[];
  title: string;
  zeroLabel: string;
  overLabel: string;
  fmt: (n: number) => string;
}

interface Props {
  features: MapFeature[];
  legend: LegendInfo;
  basemap: Basemap;
  onBasemapChange: (b: Basemap) => void;
  dict: Dict;
  focus: { lon: number; lat: number; html: string } | null;
}

const GSI = {
  std: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png',
  photo: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
};
const ATTR = '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">地理院タイル</a>';

function toGeoJSON(features: MapFeature[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: features.map((f) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
      properties: { color: f.color, r: f.r, html: f.html },
    })),
  };
}

export default function MapView({ features, legend, basemap, onBasemapChange, dict, focus }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const readyRef = useRef(false);
  const featuresRef = useRef(features);
  featuresRef.current = features;

  // 初期化（マウント時に一度だけ）
  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      center: [137.2, 37.8],
      zoom: 4.2,
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          'gsi-std': { type: 'raster', tiles: [GSI.std], tileSize: 256, attribution: ATTR, maxzoom: 18 },
          'gsi-photo': { type: 'raster', tiles: [GSI.photo], tileSize: 256, attribution: ATTR, maxzoom: 18 },
        },
        layers: [
          { id: 'base-std', type: 'raster', source: 'gsi-std', layout: { visibility: 'visible' } },
          { id: 'base-photo', type: 'raster', source: 'gsi-photo', layout: { visibility: 'none' } },
        ],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;
    map.on('error', (e) => console.error('[maplibre]', e.error?.message ?? e));

    map.on('load', () => {
      map.addSource('munis', { type: 'geojson', data: toGeoJSON(featuresRef.current) });
      map.addLayer({
        id: 'munis-circles',
        type: 'circle',
        source: 'munis',
        paint: {
          'circle-radius': ['get', 'r'],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 0.6,
          'circle-stroke-color': '#33414d',
          'circle-opacity': 0.78,
          'circle-stroke-opacity': 0.85,
        },
      });
      readyRef.current = true;

      map.on('click', 'munis-circles', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const html = String(f.properties?.html ?? '');
        const c = (f.geometry as Point).coordinates as [number, number];
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
          .setLngLat(c).setHTML(html).addTo(map);
      });
      map.on('mouseenter', 'munis-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'munis-circles', () => { map.getCanvas().style.cursor = ''; });
    });

    return () => { map.remove(); mapRef.current = null; readyRef.current = false; };
  }, []);

  // データ更新
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const src = map.getSource('munis') as maplibregl.GeoJSONSource | undefined;
    src?.setData(toGeoJSON(features));
  }, [features]);

  // 背景地図切替
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    map.setLayoutProperty('base-std', 'visibility', basemap === 'std' ? 'visible' : 'none');
    map.setLayoutProperty('base-photo', 'visibility', basemap === 'photo' ? 'visible' : 'none');
  }, [basemap]);

  // ランキングクリック等でのフォーカス
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.flyTo({ center: [focus.lon, focus.lat], zoom: 9, speed: 1.4 });
    popupRef.current?.remove();
    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '280px' })
      .setLngLat([focus.lon, focus.lat]).setHTML(focus.html).addTo(map);
  }, [focus]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="h-full w-full overflow-hidden rounded-xl border shadow-sm" />

      {/* 背景地図トグル */}
      <div className="absolute right-3 top-3 z-10 inline-flex overflow-hidden rounded-md border bg-card/95 text-xs shadow-sm">
        {(['std', 'photo'] as Basemap[]).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onBasemapChange(b)}
            className={cn(
              'px-3 py-1.5 transition-colors',
              basemap === b ? 'bg-primary text-primary-foreground font-semibold' : 'hover:bg-accent',
            )}
          >
            {b === 'std' ? dict.basemap_std : dict.basemap_photo}
          </button>
        ))}
      </div>

      {/* 凡例 */}
      {legend.breaks.length > 0 && (
        <div className="absolute bottom-6 right-3 z-10 rounded-md border bg-card/95 p-2.5 text-[0.72rem] shadow-sm">
          <div className="mb-1.5 font-semibold text-muted-foreground">{legend.title}</div>
          {legend.breaks.map((b, i) => {
            const lo = i === 0 ? 0 : legend.breaks[i - 1];
            return (
              <div key={i} className="flex items-center gap-2 py-0.5">
                <span className="size-3.5 rounded-full border border-black/25" style={{ background: PALETTE[i] }} />
                <span className="tabular">{legend.fmt(lo)} 〜 {legend.fmt(b)}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-2 py-0.5">
            <span className="size-3.5 rounded-full border border-black/25" style={{ background: PALETTE[PALETTE.length - 1] }} />
            <span className="tabular">{legend.fmt(legend.breaks[legend.breaks.length - 1])}{legend.overLabel}</span>
          </div>
          <div className="flex items-center gap-2 py-0.5">
            <span className="size-3.5 rounded-full border border-black/25" style={{ background: ZERO_COLOR }} />
            <span>{legend.zeroLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
