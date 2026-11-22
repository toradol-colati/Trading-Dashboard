import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Target } from 'lucide-react';
import { TerminalCard, NotConnectedBadge, OfflineNotice, StandbyPanel } from '../components/Shared';

// Same layout as before; the cards now read the forecast engine's latest results
// (/api/forecast/latest). Cards without a real source stay "not_connected".

type Latest = {
  module: string;
  symbol: string;
  status: 'ok' | 'error';
  computed_at: string;
  headline: string | null;
  verdict: string | null;
  error: string | null;
  summary: { label: string; value: string }[] | null;
};

const MAIN = 'BTCUSDT';
const pick = (rows: Latest[], module: string, symbol: string) => rows.find((r) => r.module === module && r.symbol === symbol && r.status === 'ok');
const summaryValue = (row: Latest | undefined, label: string) => {
  const items = Array.isArray(row?.summary) ? row!.summary! : [];
  const v = items.find((s) => s && s.label === label)?.value;
  return typeof v === 'string' ? v : null;
};
const toNumber = (v: string | null) => (v === null ? NaN : Number(v.replace(/[,%]/g, '')));
const clamp = (x: number) => Math.max(-1, Math.min(1, x));

export const DecisionPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [rows, setRows] = useState<Latest[] | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/forecast/latest', { cache: 'no-store' })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<Latest[]>;
        })
        .then((data) => {
          if (!cancelled) {
            setRows(data);
            setApiError(null);
          }
        })
        .catch((err) => !cancelled && setApiError(`Motore di previsione non raggiungibile: ${(err as Error).message}`));
    void load();
    const timer = setInterval(() => void load(), 120000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const data = rows || [];
  const sentiment = pick(data, 'M5_scenari', 'SENTIMENT');
  const macro = pick(data, 'M5_scenari', 'MACRO_SCENARI');
  const regime = pick(data, 'M5_scenari', `HMM ${MAIN}`);
  const trend = pick(data, 'M2_decomp', MAIN);
  const risk = pick(data, 'M3_risk', MAIN);

  const fng = toNumber(summaryValue(sentiment, 'Fear & Greed oggi'));
  const neutral3m = toNumber(summaryValue(macro, 'Neutrale 3m'));

  const scoreCards = [
    {
      label: 'Market Sentiment',
      value: Number.isFinite(fng) ? `${fng.toFixed(0)} / 100` : '—',
      score: Number.isFinite(fng) ? clamp((fng - 50) / 50) : 0,
      status: sentiment ? `fear & greed · ${sentiment.verdict || ''}` : 'not_connected',
    },
    {
      label: 'Macro Environment',
      value: Number.isFinite(neutral3m) ? `${neutral3m > 0 ? '+' : ''}${neutral3m.toFixed(1)}% 3m` : '—',
      score: Number.isFinite(neutral3m) ? clamp(neutral3m / 20) : 0,
      status: macro ? 'tslm macro · scenario neutrale' : 'not_connected',
    },
    { label: 'On-Chain Flow', value: '—', score: 0, status: 'not_connected' },
    { label: 'PAC Execution', value: '—', score: 0, status: 'not_connected' },
  ];

  // Stance: HMM regime + trend-cycle direction of the main asset
  const reg = regime?.verdict || null;
  const dir = trend?.verdict || null;
  const stance = !reg || !dir ? '—'
    : reg === 'TURBOLENTO' && dir === 'TREND_DOWN' ? 'RISK_OFF'
    : reg !== 'TURBOLENTO' && dir === 'TREND_UP' ? 'RISK_ON'
    : 'NEUTRAL';
  const tp = summaryValue(risk, 'Take profit (80% alto, +7)');
  const sl = summaryValue(risk, 'Stop loss (80% basso, +7)');

  const signals = data
    .filter((r) => r.headline || r.error)
    .sort((a, b) => a.module.localeCompare(b.module) || a.symbol.localeCompare(b.symbol));

  return (
    <div className={clsx("h-full overflow-y-auto custom-scrollbar bg-black/20 font-mono", isWidget ? "p-2" : "p-6")}>
      {!isWidget && (
        <header className="flex items-center gap-6 border-b border-white/5 pb-6 mb-6">
          <div className="p-4 bg-neoGreen/10 border border-neoGreen/30 rounded-sm">
            <Target className="text-neoGreen animate-pulse" size={28} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tighter text-white uppercase">STRATEGIC_DECISION_ENGINE</h1>
            <span className="text-[10px] text-[#606060] tracking-[0.3em] font-bold">UNIFIED_INTELLIGENCE_LAYER_v1.0.5</span>
          </div>
          <div className="ml-auto"><NotConnectedBadge label="ON-CHAIN · PAC: NOT_CONNECTED" /></div>
        </header>
      )}

      {apiError && <div className="mb-4"><OfflineNotice message={apiError} compact={isWidget} /></div>}

      <div className={clsx("grid gap-4 mb-6", isWidget ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
        {scoreCards.map(sc => (
          <div key={sc.label} className="bg-white/[0.03] border border-white/5 p-3 group hover:border-neoGreen/30 transition-all">
             <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold text-[#444] uppercase tracking-widest">{sc.label}</span>
                <span className="text-xl font-bold tracking-tighter text-white group-hover:text-neoGreen transition-colors">{sc.value}</span>
                <div className="w-full h-1 bg-white/5 relative overflow-hidden">
                   <div
                    className={clsx("absolute inset-y-0 left-0 transition-all duration-1000", sc.score < 0 ? "bg-[#ff3e3e] shadow-[0_0_8px_rgba(255,62,62,0.5)]" : "bg-neoGreen shadow-[0_0_8px_rgba(0,255,65,0.5)]")}
                    style={{ width: `${Math.abs(sc.score) * 100}%` }}
                   />
                </div>
                <span className="text-[8px] font-bold text-[#333] uppercase">{sc.status}</span>
             </div>
          </div>
        ))}
      </div>

      <div className={clsx("grid gap-6", isWidget ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2")}>
        <TerminalCard title="INTEL_SIGNAL_STREAM">
          {signals.length === 0 ? (
            <StandbyPanel title="NO_SIGNALS" detail="il motore di previsione non ha ancora prodotto risultati" />
          ) : (
            <div className="flex flex-col gap-2 max-h-80 overflow-y-auto custom-scrollbar">
              {signals.map((s) => (
                <div key={`${s.module}-${s.symbol}`} className={clsx("border-l-2 pl-3 py-1", s.status === 'error' ? "border-[#ff3e3e]" : "border-neoGreen/40")}>
                  <div className="flex items-center gap-2 text-[8px] font-bold uppercase tracking-widest">
                    <span className="text-[#606060]">{s.module.split('_')[0]}</span>
                    <span className="text-[#888]">{s.symbol}</span>
                    {s.verdict && <span className="text-[#8fb0ff]">{s.verdict}</span>}
                  </div>
                  <p className={clsx("text-[10px] leading-snug", s.status === 'error' ? "text-[#ff9b9b]" : "text-[#bbb]")}>{s.status === 'error' ? s.error : s.headline}</p>
                </div>
              ))}
            </div>
          )}
        </TerminalCard>

        <TerminalCard title="EXECUTION_FRAMEWORK">
          <div className="p-6 bg-neoGreen/5 border border-neoGreen/20 text-center relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-1 text-[8px] text-neoGreen/20 font-bold">STANCE_v1.0.5</div>
             <span className="text-[9px] text-neoGreen/60 font-bold tracking-[0.4em] block mb-3 uppercase">Current_Strategic_Stance · {MAIN}</span>
             <div className={clsx("text-5xl font-bold tracking-tighter", stance === '—' ? "text-neoGreen/30" : stance === 'RISK_OFF' ? "text-[#ff3e3e]" : "text-neoGreen")}>{stance}</div>
             <p className="mt-2 text-[9px] text-neoGreen/40 font-bold tracking-widest uppercase">regime HMM: {reg || '—'} · trend STL: {dir || '—'}</p>
             <p className="mt-4 text-[10px] text-neoGreen/40 font-bold tracking-widest border-t border-neoGreen/10 pt-4 uppercase">
               Targets 7D: {tp && sl ? `TP ${tp} · SL ${sl}` : 'not_connected'}
             </p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
             <button disabled className="py-4 bg-neoGreen text-black font-bold text-[10px] uppercase tracking-widest opacity-30 cursor-not-allowed">Confirm_Order</button>
             <button disabled className="py-4 bg-white/[0.03] border border-white/10 text-[#606060] font-bold text-[10px] uppercase tracking-widest opacity-30 cursor-not-allowed">Wait_Signal</button>
          </div>
        </TerminalCard>
      </div>
    </div>
  );
};
