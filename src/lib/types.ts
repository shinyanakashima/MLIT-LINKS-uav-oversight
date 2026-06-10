export interface Municipality {
  origin: string;
  pref: string | null;
  name: string;
  code: string | null;
  pop: number | null;
  lat: number | null;
  lon: number | null;
  did: number;
  airport: number;
  high150: number;
  night: number;
  bvlos: number;
  drop: number;
  hazmat: number;
  low30: number;
  event: number;
  high_risk: number;
  monitoring: number;
  moored: number;
  assist_n: number;
  assist_sum: number;
  score_sum: number;
  total_all: number;
  total_valid: number;
  hokatsu: number;
}

export interface MonthlyRow {
  month: string;
  total_valid: number;
  high_risk: number;
  prefectures: Record<string, { total_valid: number; high_risk: number }>;
  [key: string]: unknown;
}

export interface Meta {
  generated: string;
  total_records: number;
  municipalities: number;
  matched_to_census: number;
  period: { from: string; to: string };
  [key: string]: unknown;
}

export type Lang = 'ja' | 'en';
export type Norm = 'count' | 'percap' | 'share';
export type Basemap = 'std' | 'photo';
