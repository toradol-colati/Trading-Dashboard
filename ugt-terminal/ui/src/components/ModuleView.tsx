import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Area, Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { OfflineNotice, StandbyPanel, TerminalCard } from './Shared';

// Generic renderer for every FORECAST_LAB module. The R engine writes the same
// JSON shape for all modules (see worker-forecast/R/util.R), so a new module
// shows up here without new interface code.

type Tone = 'good' | 'bad' | 'warn' | null;
type SummaryItem = { label: string; value: string; hint?: string | null; tone?: Tone };
type Series = { name: string; kind: 'line' | 'band' | 'bar'; values?: (number | null)[]; lower?: (number | null)[]; upper?: (number | null)[] };
type Chart = { title: string; x: string[]; series: Series[] };
type Table = { title: string; columns: string[]; rows: (string | number | null)[][] };
export type ModuleResult = {
  error?: string;
  headline?: string;
  verdict?: string | null;
  summary?: SummaryItem[];
  charts?: Chart[];
  tables?: Table[];
  notes?: string[];
};
type Row = { symbol: string; status: 'ok' | 'error'; computed_at: string; result: ModuleResult; params?: Record<string, unknown> };

const COLORS = ['#00ff41', '#8fb0ff', '#ffb800', '#ff6ec7', '#5ee6ff', '#ff3e3e', '#b18cff'];
const toneClass = (tone?: Tone) =>
  tone === 'good' ? 'text-neoGreen' : tone === 'bad' ? 'text-[#ff3e3e]' : tone === 'warn' ? 'text-[#ffb800]' : 'text-white';
const asArray = <T,>(v: T[] | T | null | undefined): T[] => (Array.isArray(v) ? v : v ? [v] : []);

export const ModuleChart = ({ chart, compact }: { chart: Chart; compact?: boolean }) => {
  const data = useMemo(() => {
    const series = asArray(chart.series);
    return asArray(chart.x).map((x, i) => {
      const row: Record<string, unknown> = { x };
      series.forEach((s, k) => {
        const key = `s${k}`;
        if (s.kind === 'band') {
          const lo = s.lower?.[i];
          const hi = s.upper?.[i];
          row[key] = lo === null || lo === undefined || hi === null || hi === undefined ? null : [lo, hi];
        } else {
          row[key] = s.values?.[i] ?? null;
        }
      });
      return row;
    });
  }, [chart]);

  return (
    <div className="border border-white/5 bg-white/[0.02] p-2">
      <div className="text-[9px] uppercase tracking-widest text-[#606060] mb-1">{chart.title}</div>
      <div className={compact ? 'h-40' : 'h-56'}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="x" tick={{ fill: '#444', fontSize: 9 }} minTickGap={40} />
            <YAxis domain={['auto', 'auto']} tick={{ fill: '#444', fontSize: 9 }} width={56} />
            <Tooltip contentStyle={{ background: '#0d0d0d', border: '1px solid #2a2a2a', fontSize: 10 }} />
            {asArray(chart.series).map((s, k) => {
              const color = COLORS[k % COLORS.length];
              if (s.kind === 'band') {
                return <Area key={k} dataKey={`s${k}`} name={s.name} stroke="none" fill={color} fillOpacity={0.18} isAnimationActive={false} />;
              }
              if (s.kind === 'bar') {
                return <Bar key={k} dataKey={`s${k}`} name={s.name} fill={color} fillOpacity={0.7} isAnimationActive={false} />;
              }
              return <Line key={k} dataKey={`s${k}`} name={s.name} stroke={color} dot={false} strokeWidth={1.3} isAnimationActive={false} connectNulls />;
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-3 mt-1 text-[8px] uppercase tracking-widest">
        {asArray(chart.series).map((s, k) => (
          <span key={k} style={{ color: COLORS[k % COLORS.length] }}>■ {s.name}</span>
        ))}
      </div>
    </div>
  );
};

const ModuleTable = ({ table }: { table: Table }) => (
  <div className="border border-white/5 bg-white/[0.02] p-2 overflow-x-auto">
    <div className="text-[9px] uppercase tracking-widest text-[#606060] mb-1">{table.title}</div>
    <table className="w-full text-[10px]">
      <thead>
        <tr>
          {asArray(table.columns).map((c) => (
            <th key={c} className="text-left font-bold text-[#444] uppercase tracking-wider pr-3 pb-1">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {asArray(table.rows).map((r, i) => (
          <tr key={i} className="border-t border-white/5">
            {asArray(r).map((v, j) => (
              <td key={j} className="pr-3 py-0.5 text-[#bbb] whitespace-nowrap">{v === null || v === undefined ? '—' : String(v)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const ModuleResultView = ({ row, isWidget }: { row: Row; isWidget?: boolean }) => {
  if (row.status === 'error') {
    return (
      <div className="border border-[#ff3e3e]/40 bg-[#ff3e3e]/[0.06] px-3 py-2 text-[11px] text-[#ff9b9b]">
        <span className="font-bold tracking-[0.3em] text-[#ff3e3e] text-[10px]">MODULE_ERROR</span>
        <div className="mt-1 break-words">{row.result?.error}</div>
        <div className="mt-1 text-[9px] text-[#606060]">{String(row.computed_at).slice(0, 16).replace('T', ' ')}</div>
      </div>
    );
  }
  const r = row.result || {};
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        {r.verdict && (
          <span className="shrink-0 text-[9px] font-bold px-2 py-1 border border-[#8fb0ff]/50 text-[#8fb0ff] tracking-widest">{r.verdict}</span>
        )}
        <p className="text-[12px] text-white leading-snug">{r.headline}</p>
      </div>
      {asArray(r.summary).length > 0 && (
        <div className={clsx('grid gap-2', isWidget ? 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6')}>
          {asArray(r.summary).map((s) => (
            <div key={s.label} className="border border-white/5 bg-white/[0.02] p-2" title={s.hint || ''}>
              <div className="text-[8px] uppercase tracking-widest text-[#606060]">{s.label}</div>
              <div className={clsx('text-sm font-bold break-words', toneClass(s.tone))}>{s.value}</div>
              {s.hint && <div className="text-[8px] text-[#444] truncate">{s.hint}</div>}
            </div>
          ))}
        </div>
      )}
      {asArray(r.charts).length > 0 && (
        <div className="grid gap-3 grid-cols-1 xl:grid-cols-2">
          {asArray(r.charts).map((c, i) => <ModuleChart key={i} chart={c} compact={isWidget} />)}
        </div>
      )}
      {asArray(r.tables).map((t, i) => <ModuleTable key={i} table={t} />)}
      {asArray(r.notes).length > 0 && (
        <ul className="text-[9px] text-[#555] leading-relaxed list-disc pl-4">
          {asArray(r.notes).map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
      <div className="text-[8px] text-[#333] uppercase">computed {String(row.computed_at).slice(0, 16).replace('T', ' ')} UTC</div>
    </div>
  );
};

export const ModuleView = ({ module, title, isWidget }: { module: string; title: string; isWidget?: boolean }) => {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch(`/api/forecast/results?module=${encodeURIComponent(module)}`, { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<Row[]>;
        })
        .then((data) => {
          if (cancelled) return;
          setRows(data);
          setError(null);
          setSubject((cur) => (cur && data.some((d) => d.symbol === cur) ? cur : data[0]?.symbol ?? null));
        })
        .catch((err) => !cancelled && setError(`${module} non raggiungibile: ${(err as Error).message}`));
    void load();
    const timer = setInterval(() => void load(), 120000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [module]);

  const current = rows?.find((r) => r.symbol === subject) || null;

  return (
    <TerminalCard title={title}>
      {error && <OfflineNotice message={error} compact />}
      {rows && rows.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3 text-[9px] uppercase tracking-widest">
          {rows.map((r) => (
            <button
              key={r.symbol}
              onClick={() => setSubject(r.symbol)}
              className={clsx(
                'px-2 py-1 border',
                r.symbol === subject ? 'border-neoGreen text-neoGreen' : 'border-[#2a2a2a] text-[#606060] hover:text-white',
                r.status === 'error' && 'border-[#ff3e3e]/60 text-[#ff3e3e]',
              )}
            >
              {r.symbol}
            </button>
          ))}
        </div>
      )}
      {!rows && !error && <StandbyPanel title="LOADING" detail="lettura dei risultati" />}
      {rows && rows.length === 0 && (
        <StandbyPanel title="NO_RESULTS_YET" detail="il motore R non ha ancora eseguito questo modulo" />
      )}
      {current && <ModuleResultView row={current} isWidget={isWidget} />}
    </TerminalCard>
  );
};
