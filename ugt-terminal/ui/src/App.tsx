import { useState } from 'react'
import {
  BarChart3,
  Newspaper,
  LayoutDashboard,
  Wallet,
  CalendarClock,
  Terminal as TerminalIcon,
  Circle,
  Maximize2,
  Settings
} from 'lucide-react'
import { clsx } from 'clsx'
import * as RGL from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { NewsPage } from './pages/NewsPage'
import { PricesPage } from './pages/PricesPage'
import { DecisionPage } from './pages/DecisionPage'
import { PortfolioPage } from './pages/PortfolioPage'
import { PacPage } from './pages/PacPage'

const ResponsiveGrid = RGL.Responsive
const WidthProvider = RGL.WidthProvider
const ResponsiveGridLayout = WidthProvider(ResponsiveGrid)

function App() {
  const [isSystemOnline] = useState(true)

  const initialLayout = [
    { i: 'news', x: 0, y: 0, w: 6, h: 6 },
    { i: 'prices', x: 6, y: 0, w: 6, h: 4 },
    { i: 'decision', x: 6, y: 4, w: 6, h: 5 },
    { i: 'portfolio', x: 0, y: 6, w: 4, h: 3 },
    { i: 'pac', x: 4, y: 6, w: 2, h: 3 },
  ]

  const layouts = {
    lg: initialLayout,
    md: initialLayout,
    sm: initialLayout,
    xs: initialLayout,
    xxs: initialLayout
  }

  const widgets = [
    { id: 'news', title: 'ANALYSIS_NEWS', component: NewsPage, icon: Newspaper },
    { id: 'prices', title: 'TERMINAL_PRICE', component: PricesPage, icon: BarChart3 },
    { id: 'decision', title: 'STRATEGIC_DECISION', component: DecisionPage, icon: LayoutDashboard },
    { id: 'portfolio', title: 'BROKER_PORTFOLIO', component: PortfolioPage, icon: Wallet },
    { id: 'pac', title: 'PAC_ENGINE', component: PacPage, icon: CalendarClock },
  ]

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0a0a0a] text-white overflow-hidden font-mono selection:bg-[#00ff41] selection:text-black">
      {/* Top Header */}
      <header className="h-14 border-b border-neoGreen/20 flex items-center justify-between px-6 bg-black z-50">
        <div className="flex items-center gap-4">
          <TerminalIcon className="text-neoGreen animate-pulse" size={20} />
          <h1 className="font-bold tracking-tighter text-xl text-neoGreen">UGT.STRAT v1.0.5 <span className="text-[10px] bg-neoGreen/10 px-1 border border-neoGreen/30 ml-2">STABLE</span></h1>
          <div className="h-4 w-px bg-[#2a2a2a] mx-2" />
          <div className="flex items-center gap-2 text-[10px] text-[#606060] uppercase tracking-[0.2em]">
            <Circle size={6} fill={isSystemOnline ? "#00ff41" : "#ff3e3e"} className={isSystemOnline ? "animate-pulse" : ""} />
            <span>CORE_STATUS: {isSystemOnline ? 'HEALTHY' : 'CRITICAL'}</span>
          </div>
        </div>
        <div className="flex items-center gap-6 text-[10px] uppercase text-[#606060] font-bold">
          <div className="hidden lg:flex gap-6">
            <span className="border-l border-[#222] pl-4">MEM: 124MB</span>
            <span className="border-l border-[#222] pl-4 text-white">CPU: 4.2%</span>
            <span className="border-l border-[#222] pl-4">NET: 42KB/S</span>
          </div>
          <button className="hover:text-neoGreen transition-all hover:scale-110"><Settings size={18} /></button>
        </div>
      </header>

      {/* Grid Content */}
      <main className="flex-1 overflow-y-auto p-2 bg-[#050505]">
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={80}
          draggableHandle=".widget-drag-handle"
          margin={[10, 10]}
        >
          {widgets.map((w) => (
            <div key={w.id} className="bg-[#0d0d0d] border border-[#1a1a1a] flex flex-col group hover:border-neoGreen/50 transition-all duration-300 shadow-[0_0_20px_rgba(0,0,0,0.5)]">
              <div className="h-8 border-b border-[#1a1a1a] bg-[#121212] flex items-center justify-between px-3 widget-drag-handle cursor-grab active:cursor-grabbing group-hover:bg-[#1a1a1a]">
                <div className="flex items-center gap-2">
                  <w.icon size={12} className="text-neoGreen opacity-70" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#888] group-hover:text-neoGreen transition-colors flex items-center gap-2">
                    {w.title}
                    <div className="h-1 w-1 rounded-full bg-neoGreen opacity-0 group-hover:opacity-100" />
                  </span>
                </div>
                <div className="flex gap-2">
                  <button className="text-[#333] hover:text-white transition-colors"><Maximize2 size={10} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-hidden relative bg-black/40">
                <w.component isWidget />
              </div>
            </div>
          ))}
        </ResponsiveGridLayout>
      </main>

      {/* Terminal Bottom Line */}
      <footer className="h-8 border-t border-[#1a1a1a] bg-[#050505] flex items-center px-4 justify-between text-[9px] font-bold uppercase text-[#333]">
        <div className="flex gap-8">
          <span className="flex items-center gap-2 italic"><div className="h-1.5 w-1.5 rounded-full bg-neoGreen animate-ping" /> ROOT@TERMINAL:~# DATA_INGESTION_ACTIVE</span>
          <span className="text-neoGreen/40">U.G.T. CORE SYSTEM v1.0.5-ULTRA OPERATIONAL</span>
        </div>
        <div className="flex gap-6 items-center">
          <span className="hover:text-white transition-colors cursor-help">LATENCY: 0.002MS</span>
          <span className="h-3 w-px bg-[#1a1a1a]" />
          <span>SYSTEM_TIME: {new Date().toISOString()}</span>
        </div>
      </footer>
    </div>
  )
}

export default App
