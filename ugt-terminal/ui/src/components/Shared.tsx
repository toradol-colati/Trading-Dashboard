import { ReactNode } from 'react';
import { clsx } from 'clsx';

export const TerminalCard = ({ children, title, className }: { children: ReactNode, title?: string, className?: string }) => (
  <div className={clsx("bg-[#121212] border border-[#2a2a2a] flex flex-col", className)}>
    {title && (
      <div className="px-4 py-2 border-b border-[#2a2a2a] flex items-center justify-between">
        <h3 className="text-[10px] font-mono font-bold tracking-widest text-[#606060] uppercase">{title}</h3>
        <div className="flex gap-1">
          <div className="w-1.5 h-1.5 bg-[#2a2a2a]" />
          <div className="w-1.5 h-1.5 bg-[#2a2a2a]" />
        </div>
      </div>
    )}
    <div className="p-4 flex-1">
      {children}
    </div>
  </div>
);

export const StatItem = ({ label, value, trend, unit }: { label: string, value: string | number, trend?: number, unit?: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-mono text-[#606060] uppercase">{label}</span>
    <div className="flex items-baseline gap-1">
      <span className="text-xl font-mono font-bold">{value}</span>
      {unit && <span className="text-[10px] text-[#606060] font-mono">{unit}</span>}
    </div>
    {trend !== undefined && (
      <span className={clsx("text-[10px] font-mono", trend >= 0 ? "text-[#00ff41]" : "text-[#ff3e3e]")}>
        {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}%
      </span>
    )}
  </div>
);

export const SentimentBadge = ({ score }: { score: number }) => {
  const getLabel = () => {
    if (score > 0.5) return 'BULLISH';
    if (score < -0.5) return 'BEARISH';
    return 'NEUTRAL';
  };
  const getColor = () => {
    if (score > 0.5) return 'text-[#00ff41] border-[#00ff41]';
    if (score < -0.5) return 'text-[#ff3e3e] border-[#ff3e3e]';
    return 'text-[#ffb800] border-[#ffb800]';
  };
  return (
    <span className={clsx("text-[9px] font-mono font-bold px-1.5 py-0.5 border leading-none", getColor())}>
      {getLabel()} ({score.toFixed(2)})
    </span>
  );
};

/** Shown whenever real data is missing. UGT never fills the gap with invented values. */
export const OfflineNotice = ({ message, compact }: { message: string, compact?: boolean }) => (
  <div className={clsx(
    "border border-[#ff3e3e]/40 bg-[#ff3e3e]/[0.06] font-mono flex items-start gap-3",
    compact ? "px-3 py-2" : "px-4 py-3"
  )}>
    <span className="w-1.5 h-1.5 mt-1 bg-[#ff3e3e] shadow-[0_0_8px_rgba(255,62,62,0.8)] animate-pulse shrink-0" />
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold tracking-[0.3em] text-[#ff3e3e] uppercase">API_OFFLINE</span>
      <span className="text-[11px] text-[#ff9b9b]/80 leading-snug">{message}</span>
    </div>
  </div>
);

/** Marks a panel whose content is not yet wired to real data. */
export const NotConnectedBadge = ({ label = 'NOT_CONNECTED' }: { label?: string }) => (
  <span className="text-[8px] font-mono font-bold px-1.5 py-0.5 border border-[#ffb800]/40 text-[#ffb800] tracking-widest uppercase leading-none">
    {label}
  </span>
);

/** Empty state in the terminal's standby style, for panels with no real data yet. */
export const StandbyPanel = ({ title, detail }: { title: string, detail: string }) => (
  <div className="p-8 text-center border border-dashed border-white/5 bg-white/[0.02]">
    <div className="text-white/20 text-xs font-bold tracking-[0.4em] uppercase mb-2">[ {title} ]</div>
    <div className="text-[10px] text-[#444] font-bold uppercase">{detail}</div>
  </div>
);
