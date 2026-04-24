import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { 
  CalendarClock, 
  CheckCircle2, 
  Clock 
} from 'lucide-react';
import { TerminalCard } from '../components/Shared';

const StatItem = ({ label, value, unit, trend }: { label: string, value: string, unit: string, trend?: number }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[10px] font-mono text-[#606060] uppercase">{label}</span>
    <div className="flex items-baseline gap-2">
      <span className="text-xl font-mono font-bold text-white">{value}</span>
      <span className="text-[10px] font-mono text-[#606060]">{unit}</span>
      {trend !== undefined && (
        <span className={clsx("text-[10px] font-mono", trend >= 0 ? "text-[#00ff41]" : "text-[#ff3e3e]")}>
          {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </span>
      )}
    </div>
  </div>
);

export const PacPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [plans, setPlans] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/pac/plans')
      .then(res => {
        if (!res.ok) throw new Error('API Error');
        return res.json();
      })
      .then(setPlans)
      .catch(err => {
        console.error('API Fetch failed, using MOCK data:', err);
        setPlans([
          { label: "Crypto Core Accumulation", frequency: "WEEKLY", contribution_amount: "500", contribution_currency: "EUR", next_execution_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString() },
          { label: "DeFi Yield Reserve", frequency: "MONTHLY", contribution_amount: "2000", contribution_currency: "EUR", next_execution_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 12).toISOString() }
        ]);
      });
  }, []);

  return (
    <div className={clsx("h-full overflow-y-auto custom-scrollbar bg-black/20 font-mono flex flex-col", isWidget ? "p-2" : "p-6")}>
      {!isWidget && (
        <header className="flex justify-between items-center bg-white/[0.03] p-6 border border-white/5 mb-6">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-neoGreen/10 border border-neoGreen/30 rounded-sm">
               <CalendarClock className="text-neoGreen animate-pulse" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tighter text-white uppercase">SAVINGS_ENGINE_v1.2</h1>
              <span className="text-[10px] font-bold text-[#606060] uppercase tracking-[0.3em]">AUTOMATED_EXECUTION_ADVISORY</span>
            </div>
          </div>
          <button className="px-6 py-2 bg-neoGreen text-black font-bold text-[10px] uppercase tracking-widest hover:bg-white transition-all shadow-[0_0_15px_rgba(0,255,65,0.2)]">
            + DEPLOY_NEW_PLAN
          </button>
        </header>
      )}

      <div className={clsx("grid gap-6 flex-1", isWidget ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
        <div className={clsx("space-y-6", isWidget ? "" : "lg:col-span-2")}>
          <TerminalCard title="ACTIVE_RECURRING_PLANS">
             <div className="space-y-4">
               {plans.length === 0 && (
                 <div className="p-12 text-center border border-dashed border-white/5 bg-white/[0.02]">
                   <div className="text-white/20 text-xs font-bold tracking-[0.4em] uppercase mb-2">[ SYSTEM_STANDBY ]</div>
                   <div className="text-[10px] text-[#444] font-bold uppercase">NO_ACTIVE_PAC_DETECTED</div>
                 </div>
               )}
               {plans.map((plan, i) => (
                 <div key={i} className="bg-white/[0.02] p-5 border border-white/5 flex justify-between items-center group hover:border-neoGreen/30 transition-all">
                    <div className="flex flex-col gap-1">
                       <span className="text-base font-bold text-white group-hover:text-neoGreen transition-colors">{plan.label}</span>
                       <span className="text-[9px] font-bold text-[#444] uppercase tracking-widest leading-none">FREQ: {plan.frequency} | AMT: {plan.contribution_amount} {plan.contribution_currency}</span>
                    </div>
                    <div className="text-right flex flex-col gap-1 border-l border-white/5 pl-6">
                       <span className="text-[9px] font-bold text-[#444] uppercase tracking-widest">NEXT_WINDOW</span>
                       <span className="text-xs font-bold text-cyberBlue">{new Date(plan.next_execution_date).toLocaleDateString()}</span>
                    </div>
                 </div>
               ))}
             </div>
          </TerminalCard>

          <TerminalCard title="EXECUTION_LOGS_L3">
             <div className="space-y-2">
                {[
                  { date: "2024-03-01", plan: "Crypto Core", status: "COMPLETED", advice: "Deploy €500 (60% BTC, 40% ETH)" },
                  { date: "2024-02-15", plan: "Crypto Core", status: "COMPLETED", advice: "Deploy €500 (60% BTC, 40% ETH)" },
                ].map((exec, i) => (
                  <div key={i} className="flex items-center gap-4 py-3 border-b border-white/[0.02] last:border-0 hover:bg-white/[0.03] transition-colors group px-2">
                     <CheckCircle2 size={12} className="text-neoGreen opacity-50 group-hover:opacity-100" />
                     <div className="flex-1 flex justify-between items-center text-[10px] font-bold">
                        <span className="text-[#606060]">{exec.date}</span>
                        <span className="text-white/40 group-hover:text-white transition-colors">{exec.advice}</span>
                        <span className="text-neoGreen px-1 bg-neoGreen/5 border border-neoGreen/20">OK</span>
                     </div>
                  </div>
                ))}
             </div>
          </TerminalCard>
        </div>

        <div className="space-y-6">
           <TerminalCard title="PERFORMANCE_GRID">
              <div className="space-y-6 p-2">
                <StatItem label="TOTAL_DEPLOYED" value="12,500" unit="EUR" trend={1.2} />
                <StatItem label="ROI_TIME_WEIGHTED" value="15.4" unit="%" trend={0.5} />
                <StatItem label="NEXT_BATCH_ETA" value="12" unit="DAYS" />
              </div>
           </TerminalCard>

           <TerminalCard title="UPCOMING_VECTOR">
              <div className="p-5 bg-white/[0.03] border-l-4 border-neoGreen group">
                <div className="flex justify-between items-center mb-6">
                  <h4 className="text-[10px] font-bold text-white tracking-widest group-hover:text-neoGreen transition-colors uppercase">TARGET: CRYPTO_CORE</h4>
                  <Clock size={12} className="text-[#444]" />
                </div>
                <div className="space-y-4">
                  {[
                    { symbol: "BTC", weight: 60, color: "bg-neoGreen" },
                    { symbol: "ETH", weight: 40, color: "bg-cyberBlue" }
                  ].map(asset => (
                    <div key={asset.symbol} className="space-y-1">
                      <div className="flex justify-between text-[9px] font-bold uppercase">
                        <span className="text-white/60">{asset.symbol}</span>
                        <span className="text-white">{asset.weight}%</span>
                      </div>
                      <div className="w-full h-1 bg-white/5">
                        <div className={clsx("h-full transition-all duration-1000", asset.color)} style={{ width: `${asset.weight}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
           </TerminalCard>
        </div>
      </div>
    </div>
  );
};
