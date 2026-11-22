import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Area, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OfflineNotice, StandbyPanel, TerminalCard } from '../components/Shared';
import { ModuleView } from '../components/ModuleView';

// FORECAST_LAB (M0): real data only. Every gap is shown as a gap, every failed
// collector run is shown in red with its error message.

type CoverageRow = { source: string; symbol?: string; series_id?: string; rows: number; first_day: string; last_day: string };
type JobRow = { job: string; status: string; rows_written: number; detail: string | null; finished_at: string };
type LiveBarRow = { venue: string; symbol: string; bars_24h: number; last_bar: string };
type Status = {
  market_daily: CoverageRow[];
  macro_history: CoverageRow[];
  live_bars: LiveBarRow[];
  sentiment_hourly: { hours: number; last_hour: string | null };
  jobs: JobRow[];
};
type ForecastPoint = { model: string; horizon: number; target_date: string; point: number; lo80: number; hi80: number; lo95: number; hi95: number };
type ForecastResult = {
  symbol: string;
  status: 'ok' | 'error';
  computed_at: string;
  result: { error?: string; last_day?: string; last_close?: number; n_obs?: number; forecasts?: ForecastPoint[] };
};

const MODELS = ['naive', 'drift', 'ets', 'arima'] as const;

// One tab per module of the plan. M0 has its own view; the others use the generic ModuleView.
const MODULE_TABS = [
  { id: 'M0_smoke', label: 'M0 · DATI', title: 'M0 · DATA + SMOKE FORECAST' },
  { id: 'M1_radar', label: 'M1 · RADAR', title: 'M1 · RADAR DI STAZIONARIETÀ ED EFFICIENZA' },
  { id: 'M2_decomp', label: 'M2 · DECOMP', title: 'M2 · DECOMPOSIZIONE, CICLI, ROTTURE' },
  { id: 'M3_risk', label: 'M3 · RISK', title: 'M3 · RISK ENGINE' },
  { id: 'M4_kalman', label: 'M4 · KALMAN', title: 'M4 · KALMAN' },
  { id: 'M5_scenari', label: 'M5 · SCENARI', title: 'M5 · SCENARI, EVENTI, REGIMI' },
  { id: 'M6_scoreboard', label: 'M6 · SCORE', title: 'M6 · SCOREBOARD' },
  { id: 'M7_quant', label: 'M7 · QUANT', title: 'M7 · QUANT AVANZATO' },
  { id: 'M8_tail', label: 'M8 · TAIL', title: 'M8 · RISCHIO ESTREMO ED ESECUZIONE' },
] as const;
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '—');
const fmt = (v: number | null | undefined) =>
  v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const ForecastLabPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [status, setStatus] = useState<Status | null>(null);
  const [results, setResults] = useState<ForecastResult[]>([]);
  const [history, setHistory] = useState<{ day: string; close: number }[]>([]);
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [model, setModel] = useState<(typeof MODELS)[number]>('ets');
  const [apiError, setApiError] = useState<string | null>(null);
  const [tab, setTab] = useState<string>(() => {
    try {
      return localStorage.getItem('ugt.forecastlab.tab') || 'M0_smoke';
    } catch {
      return 'M0_smoke';
    }
  });
  const selectTab = (id: string) => {
    setTab(id);
    try {
      localStorage.setItem('ugt.forecastlab.tab', id);
    } catch {
      /* per-browser convenience only */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [s, r] = await Promise.all([
          getJson<Status>('/api/forecast/status'),
          getJson<ForecastResult[]>('/api/forecast/results?module=M0_smoke'),
        ]);
        if (!cancelled) {
          setStatus(s);
          setResults(r);
          setApiError(null);
        }
      } catch (err) {
        if (!cancelled) setApiError(`FORECAST_LAB non raggiungibile: ${(err as Error).message}`);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    getJson<{ day: string; close: number }[]>(`/api/forecast/daily?symbol=${symbol}&source=binance&days=120`)
      .then((rows) => setHistory(rows.map((r) => ({ day: day(r.day), close: Number(r.close) }))))
      .catch(() => setHistory([]));
  }, [symbol]);

  const current = results.find((r) => r.symbol === symbol) || null;
  const chartData = useMemo(() => {
    const base = history.map((h) => ({ day: h.day, close: h.close }) as Record<string, number | string | [number, number]>);
    const pts = (current?.result.forecasts || []).filter((f) => f.model === model);
    if (pts.length && base.length) {
      const last = base[base.length - 1];
      last.point = last.close as number;
      last.band80 = [last.close as number, last.close as number];
      last.band95 = [last.close as number, last.close as number];
    }
    for (const f of pts) {
      base.push({ day: day(f.target_date), point: f.point, band80: [f.lo80, f.hi80], band95: [f.lo95, f.hi95] });
    }
    return base;
  }, [history, current, model]);

  const failingJobs = (status?.jobs || []).filter((j) => j.status !== 'ok');
  const symbols = Array.from(new Set([...(status?.market_daily || []).filter((r) => r.source === 'binance').map((r) => r.symbol as string), ...results.map((r) => r.symbol)]));

  return (
    <div className={clsx('h-full overflow-y-auto custom-scrollbar bg-black/20 font-mono flex flex-col gap-4', isWidget ? 'p-2' : 'p-6')}>
      {apiError && <OfflineNotice message={apiError} compact={isWidget} />}

      {failingJobs.length > 0 && (
        <div className="border border-[#ff3e3e]/40 bg-[#ff3e3e]/[0.06] px-3 py-2 text-[10px]">
          <span className="font-bold tracking-[0.3em] text-[#ff3e3e] uppercase">COLLECTOR_ERROR</span>
          {failingJobs.map((j) => (
            <div key={j.job} title={j.detail || ''} className="text-[#ff9b9b]/80 mt-1 truncate">
              <span className="text-[#ff3e3e]">{j.job}</span> · {day(j.finished_at)} · {j.detail}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 text-[9px] uppercase tracking-widest border-b border-white/5 pb-2">
        <a href="/api/forecast/report" target="_blank" rel="noreferrer"
          className="ml-auto order-last px-2 py-1 border border-[#8fb0ff]/40 text-[#8fb0ff] hover:bg-[#8fb0ff]/10">
          REPORT ↗
        </a>
        {MODULE_TABS.map((t) => (
          <button key={t.id} onClick={() => selectTab(t.id)}
            className={clsx('px-2 py-1 border', t.id === tab ? 'border-neoGreen text-neoGreen bg-neoGreen/5' : 'border-[#1f1f1f] text-[#606060] hover:text-white')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'M0_smoke' ? (
        <ModuleView key={tab} module={tab} title={MODULE_TABS.find((t) => t.id === tab)?.title || tab} isWidget={isWidget} />
      ) : (
      <div className={clsx('grid gap-4', isWidget ? 'grid-cols-1 xl:grid-cols-3' : 'grid-cols-1 lg:grid-cols-3')}>
        <TerminalCard title="M0_SMOKE_FORECAST · 7D" className="lg:col-span-2 xl:col-span-2">
          <div className="flex flex-wrap items-center gap-2 mb-3 text-[9px] uppercase tracking-widest">
            {(symbols.length ? symbols : ['BTCUSDT', 'ETHUSDT']).map((s) => (
              <button key={s} onClick={() => setSymbol(s)}
                className={clsx('px-2 py-1 border', s === symbol ? 'border-neoGreen text-neoGreen' : 'border-[#2a2a2a] text-[#606060] hover:text-white')}>
                {s}
              </button>
            ))}
            <span className="w-px h-4 bg-[#2a2a2a] mx-1" />
            {MODELS.map((m) => (
              <button key={m} onClick={() => setModel(m)}
                className={clsx('px-2 py-1 border', m === model ? 'border-[#8fb0ff] text-[#8fb0ff]' : 'border-[#2a2a2a] text-[#606060] hover:text-white')}>
                {m}
              </button>
            ))}
          </div>

          {!current ? (
            <StandbyPanel title="NO_FORECAST_YET" detail="worker-forecast non ha ancora prodotto risultati per questo simbolo" />
          ) : current.status === 'error' ? (
            <div className="border border-[#ff3e3e]/40 bg-[#ff3e3e]/[0.06] px-3 py-2 text-[11px] text-[#ff9b9b]">
              <span className="font-bold tracking-[0.3em] text-[#ff3e3e] text-[10px]">FORECAST_ERROR</span>
              <div className="mt-1">{current.result.error}</div>
              <div className="mt-1 text-[9px] text-[#606060]">{day(current.computed_at)}</div>
            </div>
          ) : (
            <>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <XAxis dataKey="day" tick={{ fill: '#444', fontSize: 9 }} minTickGap={40} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#444', fontSize: 9 }} width={60} />
                    <Tooltip contentStyle={{ background: '#0d0d0d', border: '1px solid #2a2a2a', fontSize: 10 }} />
                    <Area dataKey="band95" stroke="none" fill="#8fb0ff" fillOpacity={0.12} isAnimationActive={false} name="95%" />
                    <Area dataKey="band80" stroke="none" fill="#8fb0ff" fillOpacity={0.25} isAnimationActive={false} name="80%" />
                    <Line dataKey="close" stroke="#00ff41" dot={false} strokeWidth={1.5} isAnimationActive={false} name="close" />
                    <Line dataKey="point" stroke="#8fb0ff" dot={false} strokeDasharray="4 3" isAnimationActive={false} name={model} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-4 gap-2 mt-3 text-[9px] uppercase">
                {MODELS.map((m) => {
                  const f = (current.result.forecasts || []).find((p) => p.model === m && p.horizon === 7);
                  return (
                    <div key={m} className="border border-white/5 bg-white/[0.02] p-2">
                      <div className="text-[#606060] tracking-widest">{m} · +7D</div>
                      <div className="text-white text-sm font-bold">{fmt(f?.point)}</div>
                      <div className="text-[#606060]">80%: {fmt(f?.lo80)} – {fmt(f?.hi80)}</div>
                      <div className="text-[#444]">95%: {fmt(f?.lo95)} – {fmt(f?.hi95)}</div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-2 text-[9px] text-[#444] uppercase">
                last close {fmt(current.result.last_close)} · {day(current.result.last_day)} · n={current.result.n_obs} · computed {day(current.computed_at)}
              </div>
            </>
          )}
        </TerminalCard>

        <TerminalCard title="DATA_COVERAGE">
          {!status ? (
            <StandbyPanel title="NO_STATUS" detail="in attesa della API" />
          ) : (
            <div className="flex flex-col gap-3 text-[10px]">
              <CoverageTable title="DAILY_HISTORY" rows={status.market_daily.map((r) => [`${r.source}:${r.symbol}`, r.rows, day(r.first_day), day(r.last_day)])} />
              <CoverageTable title="MACRO_HISTORY" rows={status.macro_history.map((r) => [`${r.source}:${r.series_id}`, r.rows, day(r.first_day), day(r.last_day)])} />
              <CoverageTable title="LIVE_BARS_24H" rows={status.live_bars.map((r) => [`${r.venue}:${r.symbol}`, r.bars_24h, '', String(r.last_bar).slice(11, 16)])} />
              <div className="flex justify-between text-[#606060] uppercase">
                <span>SENTIMENT_HOURS</span>
                <span className="text-white">{status.sentiment_hourly?.hours ?? 0} · {day(status.sentiment_hourly?.last_hour)}</span>
              </div>
            </div>
          )}
        </TerminalCard>
      </div>
      )}
    </div>
  );
};

const CoverageTable = ({ title, rows }: { title: string; rows: (string | number)[][] }) => (
  <div>
    <div className="text-[9px] font-bold tracking-[0.3em] text-[#444] mb-1">{title}</div>
    {rows.length === 0 ? (
      <div className="text-[#ffb800] text-[9px] uppercase">empty</div>
    ) : (
      rows.map((r) => (
        <div key={String(r[0])} className="flex justify-between gap-2 text-[#888]">
          <span className="truncate">{r[0]}</span>
          <span className="text-white shrink-0">{r[1]} {r[2] ? `· ${r[2]} → ${r[3]}` : r[3] ? `· ${r[3]}` : ''}</span>
        </div>
      ))
    )}
  </div>
);
