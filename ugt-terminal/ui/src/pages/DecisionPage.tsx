import { clsx } from 'clsx';
import { Target } from 'lucide-react';
import { TerminalCard, NotConnectedBadge, StandbyPanel } from '../components/Shared';

export const DecisionPage = ({ isWidget }: { isWidget?: boolean }) => {
  // Not wired to real data yet: values stay empty instead of showing invented scores.
  const scoreCards = [
    { label: "Market Sentiment", value: "—", score: 0, status: "not_connected" },
    { label: "Macro Environment", value: "—", score: 0, status: "not_connected" },
    { label: "On-Chain Flow", value: "—", score: 0, status: "not_connected" },
    { label: "PAC Execution", value: "—", score: 0, status: "not_connected" }
  ];

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
          <div className="ml-auto"><NotConnectedBadge /></div>
        </header>
      )}

      <div className={clsx("grid gap-4 mb-6", isWidget ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4")}>
        {scoreCards.map(sc => (
          <div key={sc.label} className="bg-white/[0.03] border border-white/5 p-3 group hover:border-neoGreen/30 transition-all">
             <div className="flex flex-col gap-2">
                <span className="text-[9px] font-bold text-[#444] uppercase tracking-widest">{sc.label}</span>
                <span className="text-xl font-bold tracking-tighter text-white group-hover:text-neoGreen transition-colors">{sc.value}</span>
                <div className="w-full h-1 bg-white/5 relative overflow-hidden">
                   <div 
                    className="absolute inset-y-0 left-0 bg-neoGreen shadow-[0_0_8px_rgba(0,255,65,0.5)] transition-all duration-1000" 
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
          <StandbyPanel title="NO_SIGNALS" detail="Decision engine not wired to real data yet" />
        </TerminalCard>

        <TerminalCard title="EXECUTION_FRAMEWORK">
          <div className="p-6 bg-neoGreen/5 border border-neoGreen/20 text-center relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-1 text-[8px] text-neoGreen/20 font-bold">STANCE_v1.0.5</div>
             <span className="text-[9px] text-neoGreen/60 font-bold tracking-[0.4em] block mb-3 uppercase">Current_Strategic_Stance</span>
             <div className="text-5xl font-bold text-neoGreen/30 tracking-tighter">—</div>
             <p className="mt-4 text-[10px] text-neoGreen/40 font-bold tracking-widest border-t border-neoGreen/10 pt-4 uppercase">Targets: not_connected</p>
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
