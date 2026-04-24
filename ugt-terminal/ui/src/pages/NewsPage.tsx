import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { TerminalCard, SentimentBadge } from '../components/Shared';
import { useStream } from '../hooks/useStream';
import { Newspaper, ChevronRight } from 'lucide-react';

export const NewsPage = ({ isWidget }: { isWidget?: boolean }) => {
  const [articles, setArticles] = useState<any[]>([]);
  const { data } = useStream(['news']);

  useEffect(() => {
    // Fetch initial news from API
    fetch('/api/news')
      .then(res => {
        if (!res.ok) throw new Error('API Error');
        return res.json();
      })
      .then(setArticles)
      .catch(err => {
        console.error('API Fetch failed, using MOCK data:', err);
        setArticles([
          { source: "REUTERS", sentiment: '{"compound": -0.15}', published_at: new Date(Date.now() - 1000 * 60).toISOString(), title: "FED officials indicate potential delay in rate cuts following persistent inflation data.", tickers: '["USD", "EUR"]' },
          { source: "COINDESK", sentiment: '{"compound": 0.85}', published_at: new Date(Date.now() - 1000 * 60 * 5).toISOString(), title: "Institutional inflows to Bitcoin ETFs reach new monthly high as macro uncertainty looms.", tickers: '["BTC"]' },
          { source: "UGT_ENGINE", sentiment: '{"compound": 0.45}', published_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(), title: "Network congestion on Solana resolved. On-chain volume recovering rapidly.", tickers: '["SOL"]' },
          { source: "BLOOMBERG", sentiment: '{"compound": -0.4}', published_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(), title: "Tech equities stumble as NVIDIA guidance falls slightly below expectations.", tickers: '["NVDA"]' },
          { source: "ON-CHAIN", sentiment: '{"compound": 0.9}', published_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(), title: "Large transfer of 50,000 ETH off exchanges detected. Accumulation phase suspected.", tickers: '["ETH"]' },
        ]);
      });
  }, []);

  useEffect(() => {
    if (data.news && data.news.data) {
      setArticles(prev => [data.news.data, ...prev].slice(0, 50));
    }
  }, [data.news]);

  const safeParse = (val: any, fallback: any) => {
    if (!val) return fallback;
    if (typeof val === 'object') return val;
    try {
      return JSON.parse(val);
    } catch {
      return fallback;
    }
  };

  return (
  return (
    <div className={clsx("flex flex-col h-full bg-black/20", isWidget ? "p-2" : "p-6")}>
      <div className="grid grid-cols-12 gap-4 h-full">
        {/* Sentiment Analysis Overview */}
        {!isWidget && (
          <div className="col-span-12 lg:col-span-4 flex flex-col gap-4">
            <TerminalCard title="METRIC_DIVERGENCE">
              <div className="h-48 flex flex-col items-center justify-center border border-white/5 bg-white/5 rounded-sm">
                <div className="text-[10px] text-neoGreen/50 mb-2 font-bold">[ SCANNING_SENTIMENT_LAYERS ]</div>
                <div className="flex items-end gap-1 h-20 items-center">
                   {[40, 70, 45, 90, 65, 80, 30].map((h, i) => (
                     <div key={i} style={{ height: `${h}%` }} className="w-2 bg-neoGreen/20 border-t-2 border-neoGreen animate-pulse" />
                   ))}
                </div>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex justify-between items-center group">
                  <span className="text-[10px] text-[#606060] group-hover:text-white transition-colors">CRYPTO_NATIVE</span>
                  <span className="text-[11px] text-neoGreen font-bold bg-neoGreen/10 px-2 py-0.5 border border-neoGreen/20">BULLISH (+1.42)</span>
                </div>
                <div className="flex justify-between items-center group">
                  <span className="text-[10px] text-[#606060] group-hover:text-white transition-colors">TRAD_FINANCE</span>
                  <span className="text-[11px] text-[#ff3e3e] font-bold bg-[#ff3e3e10] px-2 py-0.5 border border-[#ff3e3e20]">BEARISH (-0.23)</span>
                </div>
              </div>
            </TerminalCard>
          </div>
        )}

        {/* Intelligence Stream */}
        <div className={clsx("flex flex-col h-full", isWidget ? "col-span-12" : "col-span-12 lg:col-span-8")}>
          <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-4">
            {articles.length === 0 && (
              <div className="h-full flex items-center justify-center">
                <div className="text-neoGreen/30 text-[10px] animate-pulse tracking-widest font-bold">ESTABLISHING_DATA_LINK...</div>
              </div>
            )}
            {articles.map((item, idx) => {
              const sentiment = safeParse(item.sentiment, { compound: 0 });
              const tickers = safeParse(item.tickers, []);
              
              return (
              <div key={idx} className="group border-l-2 border-transparent hover:border-neoGreen/50 bg-white/[0.02] hover:bg-white/[0.05] p-3 transition-all duration-200">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-[9px] font-bold text-neoGreen bg-neoGreen/10 px-1.5 py-0.5">{item.source || 'INTEL'}</span>
                    <SentimentBadge score={sentiment.compound} />
                  </div>
                  <span className="text-[9px] text-[#444] font-bold">{new Date(item.published_at || Date.now()).toLocaleTimeString()}</span>
                </div>
                <h4 className="text-sm font-bold text-[#eee] group-hover:text-white transition-colors leading-tight mb-2 tracking-tight">
                  {item.title}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                   {tickers.map((t: string) => (
                     <span key={t} className="text-[8px] font-bold text-cyberBlue border border-cyberBlue/30 px-1 bg-cyberBlue/5">#{t}</span>
                   ))}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
