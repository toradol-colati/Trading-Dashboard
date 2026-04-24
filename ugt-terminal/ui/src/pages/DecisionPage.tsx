import { clsx } from 'clsx';
import { 
  Target, 
  CheckCircle2, 
  TrendingUp, 
  Info, 
  AlertTriangle 
} from 'lucide-react';
import { TerminalCard } from '../components/Shared';

export const DecisionPage = ({ isWidget }: { isWidget?: boolean }) => {
  const scoreCards = [
    { label: "Market Sentiment", value: "BULLISH", score: 0.72, status: "stable" },
    { label: "Macro Environment", value: "NEUTRAL", score: 0.05, status: "risk" },
    { label: "On-Chain Flow", value: "BULLISH", score: 0.88, status: "improving" },
    { label: "PAC Execution", value: "ON-TRACK", score: 1.0, status: "stable" }
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
          <div className="space-y-3">
             {[
               { icon: CheckCircle2, color: "text-neoGreen", text: "Sentiment divergence confirmed: Crypto-native leading TradFi (Bullish)" },
               { icon: TrendingUp, color: "text-neoGreen", text: "On-chain TVL increasing + Low DEX volume (Accumulation stage)" },
               { icon: Info, color: "text-cyberBlue", text: "Macro: CPI release in 48h. Maintain hedge delta." },
               { icon: AlertTriangle, color: "text-[#ffb800]", text: "Risk parity: SOL concentration exceeding 15% threshold." }
             ].map((signal, i) => (
               <div key={i} className="flex gap-4 items-start border-l border-white/5 pl-4 py-2 hover:bg-white/[0.02] transition-all">
                  <signal.icon size={14} className={clsx(signal.color, "mt-0.5")} />
                  <p className="text-xs font-bold text-[#888] leading-tight group-hover:text-white">{signal.text}</p>
               </div>
             ))}
          </div>
        </TerminalCard>

        <TerminalCard title="EXECUTION_FRAMEWORK">
          <div className="p-6 bg-neoGreen/5 border border-neoGreen/20 text-center relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-1 text-[8px] text-neoGreen/20 font-bold">STANCE_v1.0.5</div>
             <span className="text-[9px] text-neoGreen/60 font-bold tracking-[0.4em] block mb-3 uppercase">Current_Strategic_Stance</span>
             <div className="text-5xl font-bold text-neoGreen tracking-tighter group-hover:scale-105 transition-transform duration-500">ACCUMULATE</div>
             <p className="mt-4 text-[10px] text-neoGreen/40 font-bold tracking-widest border-t border-neoGreen/10 pt-4 uppercase">Targets: BTC (60%) | ETH (30%) | SOL (10%)</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
             <button className="py-4 bg-neoGreen text-black font-bold text-[10px] uppercase tracking-widest hover:bg-white transition-all shadow-[0_0_20px_rgba(0,255,65,0.2)]">Confirm_Order</button>
             <button className="py-4 bg-white/[0.03] border border-white/10 text-[#606060] hover:text-white hover:bg-white/10 font-bold text-[10px] uppercase tracking-widest transition-all">Wait_Signal</button>
          </div>
        </TerminalCard>
      </div>
    </div>
  );
};
