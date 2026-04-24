import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Wallet } from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { TerminalCard } from '../components/Shared';

export const PortfolioPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [holdings, setHoldings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/portfolio/aggregated')
      .then(res => {
        if (!res.ok) throw new Error('API Error');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
            setHoldings(data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('API Fetch failed, using MOCK data:', err);
        setHoldings([
          { symbol: "BTC", total_quantity: "0.452", avg_cost: "52000" },
          { symbol: "ETH", total_quantity: "4.5", avg_cost: "2800" },
          { symbol: "SOL", total_quantity: "150", avg_cost: "85" },
          { symbol: "EUR", total_quantity: "12500", avg_cost: "1" },
          { symbol: "NVDA", total_quantity: "25", avg_cost: "450" },
        ]);
        setLoading(false);
      });
  }, []);

  const holdingsList = Array.isArray(holdings) ? holdings : [];
  const totalValue = holdingsList.reduce((acc, h) => acc + (parseFloat(h.total_quantity || '0') * (parseFloat(h.avg_cost) || 0)), 0);

  const chartData = holdingsList.map(h => ({
    name: h.symbol || '?',
    value: parseFloat(h.total_quantity || '0') * (parseFloat(h.avg_cost) || 0)
  })).sort((a, b) => b.value - a.value).slice(0, 5);

  const COLORS = ['#00ff41', '#00d4ff', '#ffb800', '#ff3e3e', '#606060'];

  return (
    <div className={clsx("h-full overflow-y-auto custom-scrollbar bg-black/20 font-mono flex flex-col", isWidget ? "p-2" : "p-6")}>
      {!isWidget && (
        <div className="flex justify-between items-center bg-white/[0.03] p-6 border border-white/5 mb-6">
          <div className="flex items-center gap-6">
            <div className="p-4 bg-neoGreen/10 border border-neoGreen/30 rounded-sm shadow-[0_0_15px_rgba(0,255,65,0.1)]">
               <Wallet className="text-neoGreen animate-pulse" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tighter text-white">GLOBAL_PORTFOLIO_CORE</h1>
              <span className="text-[10px] font-bold text-[#606060] uppercase tracking-[0.3em]">AGGREGATED_ASSETS_LAYER_0</span>
            </div>
          </div>
          <div className="text-right border-l border-white/5 pl-8">
            <span className="text-[9px] font-bold text-[#444] uppercase tracking-widest">NET_ESTIMATED_VALUE</span>
            <div className="text-4xl font-bold text-neoGreen tracking-tighter">€{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
        </div>
      )}
      
      {isWidget && (
        <div className="flex justify-between items-center bg-neoGreen/5 p-3 border border-neoGreen/20 mb-4 rounded-sm">
           <span className="text-[9px] font-bold text-neoGreen/60 uppercase racking-widest">NET_WORTH</span>
           <div className="text-xl font-bold text-neoGreen tracking-tighter">€{totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
      )}

      <div className={clsx("grid gap-6 flex-1", isWidget ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3")}>
        <div className="col-span-1">
          <TerminalCard title="ALLOCATION_SCHEMA">
            <div className="h-64 relative">
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-[10px] text-white/10 font-bold uppercase tracking-[0.4em]">LAYER_TOP_5</div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={90}
                    paddingAngle={8}
                    dataKey="value"
                    stroke="none"
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-all cursor-pointer outline-none" />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '0px', padding: '10px' }}
                    itemStyle={{ fontSize: '10px', textTransform: 'uppercase', fontFamily: 'JetBrains Mono', fontWeight: 'bold' }}
                    labelStyle={{ display: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </TerminalCard>
        </div>

        <div className={clsx("flex flex-col gap-6", isWidget ? "" : "lg:col-span-2")}>
          <TerminalCard title="ASSET_BREAKDOWN_MATRIX">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left font-mono">
                <thead className="text-[9px] font-bold text-[#444] uppercase tracking-widest border-b border-white/5">
                  <tr>
                    <th className="py-3 px-2">ASSET_ID</th>
                    <th className="py-3 px-2 text-right">QUANTITY</th>
                    <th className="py-3 px-2 text-right">UNIT_COST</th>
                    <th className="py-3 px-2 text-right text-white/60">TOTAL_RESERVE</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {holdingsList.map((h, i) => (
                    <tr key={i} className="hover:bg-neoGreen/[0.03] transition-colors group">
                      <td className="py-3 px-2 font-bold text-neoGreen group-hover:pl-4 transition-all">{h.symbol}</td>
                      <td className="py-3 px-2 text-right text-[11px] font-bold text-[#ccc]">{(parseFloat(h.total_quantity || '0')).toFixed(4)}</td>
                      <td className="py-3 px-2 text-right text-[11px] text-[#444]">€{(parseFloat(h.avg_cost || '0')).toFixed(2)}</td>
                      <td className="py-3 px-2 text-right text-[11px] font-bold text-white">€{(parseFloat(h.total_quantity || '0') * (parseFloat(h.avg_cost) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TerminalCard>
        </div>
      </div>
    </div>
  );
};
