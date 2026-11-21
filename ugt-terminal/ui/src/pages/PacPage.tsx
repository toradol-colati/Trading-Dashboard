import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { 
  CalendarClock
} from 'lucide-react';
import { TerminalCard, StatItem, OfflineNotice, NotConnectedBadge, StandbyPanel } from '../components/Shared';

export const PacPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pac/plans')
      .then(res => {
        if (!res.ok) throw new Error('API Error');
        return res.json();
      })
      .then(data => {
        setPlans(Array.isArray(data) ? data : []);
        setApiError(null);
      })
      .catch(err => {
        console.error('PAC API unreachable:', err);
        setPlans([]);
        setApiError('Backend PAC non raggiungibile: nessun dato mostrato.');
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

      {apiError && <div className="mb-4"><OfflineNotice message={apiError} compact={isWidget} /></div>}

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
             <div className="flex justify-end mb-3"><NotConnectedBadge /></div>
             <StandbyPanel title="NO_EXECUTION_LOGS" detail="Execution history not wired to the UI yet" />
          </TerminalCard>
        </div>

        <div className="space-y-6">
           <TerminalCard title="PERFORMANCE_GRID">
              <div className="space-y-6 p-2">
                <div className="flex justify-end"><NotConnectedBadge /></div>
                <StatItem label="TOTAL_DEPLOYED" value="—" unit="EUR" />
                <StatItem label="ROI_TIME_WEIGHTED" value="—" unit="%" />
                <StatItem label="NEXT_BATCH_ETA" value="—" unit="DAYS" />
              </div>
           </TerminalCard>

           <TerminalCard title="UPCOMING_VECTOR">
              <div className="flex justify-end mb-3"><NotConnectedBadge /></div>
              <StandbyPanel title="NO_TARGET_ALLOCATION" detail="Target allocation not wired to the UI yet" />
           </TerminalCard>
        </div>
      </div>
    </div>
  );
};
