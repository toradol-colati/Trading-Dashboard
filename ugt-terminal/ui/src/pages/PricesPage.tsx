import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { TerminalCard, OfflineNotice, NotConnectedBadge, StandbyPanel } from '../components/Shared';
import { useStream } from '../hooks/useStream';

export const PricesPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCEUR');
  const [ticks, setTicks] = useState<any[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const { data } = useStream(['prices']);

  useEffect(() => {
    fetch(`/api/prices/ticks?symbol=${selectedSymbol}&limit=50`)
      .then(res => {
        if (!res.ok) throw new Error('API Error');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
            setTicks(data.reverse());
        }
        setApiError(null);
      })
      .catch(err => {
        console.error('Prices API unreachable:', err);
        setTicks([]);
        setApiError('Backend prezzi non raggiungibile: nessun dato mostrato.');
      });
  }, [selectedSymbol]);

  useEffect(() => {
    if (data.prices && data.prices.data) {
      const dataArray = Array.isArray(data.prices.data) ? data.prices.data : [data.prices.data];
      const newTicks = dataArray.filter((t: any) => t && t.symbol === selectedSymbol);
      if (newTicks.length > 0) {
        setTicks(prev => {
            const updated = [...prev, ...newTicks].slice(-50);
            return updated;
        });
      }
    }
  }, [data.prices, selectedSymbol]);

  const latestPrice = ticks.length > 0 ? (ticks[ticks.length - 1]?.price || 0) : 0;
  const prevPrice = ticks.length > 1 ? (ticks[ticks.length - 2]?.price || latestPrice) : latestPrice;
  const change = latestPrice - prevPrice;
  const volume = ticks.length > 0 ? (ticks[ticks.length - 1]?.volume || 0) : 0;

  return (
    <div className={clsx("flex flex-col h-full bg-black/40 font-mono", isWidget ? "p-2" : "p-6")}>
      <div className="grid grid-cols-12 gap-6 h-full overflow-hidden">
        {/* Chart and Main Display */}
        <div className={clsx("flex flex-col gap-6", isWidget ? "col-span-12" : "col-span-12 lg:col-span-9")}>
          <header className="flex justify-between items-end border-b border-white/5 pb-4">
            <div className="flex gap-6 items-baseline">
              <div className="relative group">
                <select 
                  value={selectedSymbol} 
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="bg-neoGreen/5 border border-neoGreen/20 text-neoGreen text-2xl font-bold px-3 py-1 outline-none appearance-none cursor-pointer hover:bg-neoGreen/10 transition-colors pr-8"
                >
                  <option value="BTCEUR">BTC/EUR</option>
                  <option value="ETHEUR">ETH/EUR</option>
                  <option value="SOLEUR">SOL/EUR</option>
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-neoGreen/50 text-[10px]">▼</div>
              </div>
              <div className="flex flex-col">
                <div className="flex items-baseline gap-3">
                  <span className="text-4xl font-bold tracking-tighter text-white">€{latestPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                  <span className={`text-sm font-bold ${change >= 0 ? 'text-neoGreen' : 'text-[#ff3e3e]'}`}>
                    {change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)} ({((change / (prevPrice || 1)) * 100).toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
            {!isWidget && (
              <div className="hidden lg:flex gap-4 text-[#444] text-[10px] uppercase font-bold">
                <div className="flex flex-col items-end"><span className="text-white/40">24H_VOL</span><span>—</span></div>
                <div className="flex flex-col items-end"><span className="text-white/40">MKT_DOM</span><span>—</span></div>
                <div className="flex flex-col items-end">
                  {apiError || ticks.length === 0
                    ? <span className="text-black bg-[#ff3e3e] px-1">OFFLINE</span>
                    : <span className="text-black bg-neoGreen px-1">LIVE</span>}
                </div>
              </div>
            )}
          </header>

          {apiError && <OfflineNotice message={apiError} compact={isWidget} />}

          <div className="flex-1 min-h-[250px] relative">
            <div className={clsx("absolute top-2 left-2 text-[8px] font-bold z-10", ticks.length > 0 ? "text-neoGreen/30" : "text-[#ff3e3e]/60")}>
              {ticks.length > 0 ? '[ HISTORICAL_PRICE_STREAM_ACTIVE ]' : '[ NO_PRICE_DATA ]'}
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ticks}>
                <defs>
                  <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis domain={['auto', 'auto']} orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#333', fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: '0px', padding: '10px' }}
                  itemStyle={{ color: '#00ff41', fontSize: '10px', textTransform: 'uppercase' }}
                  labelStyle={{ display: 'none' }}
                />
                <Line 
                  type="monotone" 
                  dataKey="price" 
                  stroke="#00ff41" 
                  strokeWidth={2} 
                  dot={false} 
                  isAnimationActive={false}
                  filter="url(#glow)"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sidebars: Book and Ticks */}
        {!isWidget && (
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-6 overflow-hidden border-l border-white/5 pl-6">
             <div className="flex flex-col h-1/2 overflow-hidden">
               <div className="text-[10px] font-bold text-white/40 mb-3 border-b border-white/5 pb-1 flex items-center justify-between">
                 <span>ORDER_BOOK_L2</span>
                 <NotConnectedBadge />
               </div>
               <div className="flex-1 overflow-hidden">
                 <StandbyPanel title="NO_L2_FEED" detail="Order book feed not wired to the UI yet" />
               </div>
             </div>

             <div className="flex flex-col h-1/2 overflow-hidden">
                <div className="text-[10px] font-bold text-white/40 mb-3 border-b border-white/5 pb-1">EXECUTION_HISTORY</div>
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                   {ticks.slice().reverse().map((t, i) => (
                     <div key={i} className="flex justify-between text-[9px] font-bold group border-b border-white/[0.02] pb-1">
                       <span className={t.price >= prevPrice ? 'text-neoGreen' : 'text-[#ff3e3e]'}>
                         {t.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                       </span>
                       <span className="text-[#444] group-hover:text-white transition-colors">
                         {t.volume.toFixed(4)}
                       </span>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        )}
      </div>
    </div>
  );
};
