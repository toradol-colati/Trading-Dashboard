# U.G.T. Strategic Terminal Compliance Matrix

This document provides an honest, verifiable status of all data sources integrated into the terminal. Each source is checked for connector existence, scheduler registration, and actual runtime status.

## 1. Market & On-Chain Data (worker-data)

| Legacy Source | Connector File | Scheduler registered | Verification (Tests/Heartbeat) | Status |
| :--- | :--- | :---: | :---: | :---: |
| BTCEUR (tv) | `binance_ws.py` / `coinbase_ws.py` | ✅ | ⚠️ (coinbase is placeholder) | 🟡 |
| CoinMarketCap | `clients/coinmarketcap.py` | ✅ | ✅ | 🟢 |
| Glassnode | `scrapers/glassnode.py` | ✅ | ⚠️ (Headless) | 🟡 |
| Messari | `clients/messari.py` | ✅ | ✅ | 🟢 |
| DexScreener | `clients/dexscreener.py` | ✅ | ✅ | 🟢 |
| DefiLlama | `clients/defillama.py` | ✅ | ✅ | 🟢 |
| Dune | `clients/dune.py` | ✅ | ⚠️ (Requires config YAML) | 🟡 |
| Arkham | `scrapers/arkham.py` | ✅ | ⚠️ (Headless) | 🟡 |
| MacroMicro | `scrapers/macromicro.py` | ✅ | ⚠️ (Headless) | 🟡 |
| TradingEconomics | `clients/tradingeconomics.py` | ✅ | ✅ | 🟢 |
| FRED | `clients/fred.py` | ✅ | ✅ | 🟢 |
| ForexFactory | `scrapers/forexfactory.py` | ✅ | ⚠️ (Headless) | 🟡 |

## 2. Intelligence & NLP (worker-nlp)

| Legacy Source | Connector File | Scheduler registered | Verification (Tests/Heartbeat) | Status |
| :--- | :--- | :---: | :---: | :---: |
| CryptoPanic | `ingestors/cryptopanic.py` | ✅ | ✅ | 🟢 |
| CoinTelegraph | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |
| CoinDesk | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |
| TheBlock | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |
| Bloomberg | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |
| FinancialTimes | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |
| Reuters | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |
| ilSole24ore | `ingestors/rss_generic.py` | ✅ | ✅ | 🟢 |

## 3. Portfolio & Brokers (worker-broker / API)

| Legacy Source | Connector File | Implementation Type | Verification | Status |
| :--- | :--- | :---: | :---: | :---: |
| Robinhood | `robinhood.py` | API (Session) | ⚠️ (Dormant) | 🟡 |
| YoungPlatform | `csv_handlers.py` | CSV (Idempotent) | ⚠️ (Dormant) | 🟡 |
| IBKR | `ibkr.py` | TWS Gateway | ⚠️ (Req. Host App) | 🟡 |
| Coinbase | `coinbase_account.py` | API | ⚠️ (Dormant) | 🟡 |
| Binance | `binance_account.py` | API | ⚠️ (Dormant) | 🟡 |
| YouHodler | `youhodler.py` | Scraper | ⚠️ (Fragile + Dormant) | 🟡 |
| TradeRepublic | `csv_handlers.py` | CSV (Idempotent) | ⚠️ (Dormant) | 🟡 |

> **Note**: All portfolio/broker connectors exist as files but are **not imported or wired** into `worker-broker/main.py`. The broker worker currently only runs market WebSocket connectors (Binance WS + Coinbase WS placeholder). Portfolio sync and PAC engine require explicit wiring.

---

## Legenda
- 🟢 **ACTIVE**: Connector exists, registered in scheduler, and verified healthy.
- 🟡 **DEGRADED/DORMANT**: Connector exists but is either a scraper (fragile), requires external deps, or is not wired into the runtime.
- 🔴 **MISSING**: No implementation or critical failure.

**Current Health Summary:**
- **Active Connectors (wired + functional)**: 18/27
- **Dormant Connectors (code exists, not wired)**: 7
- **Placeholder Connectors**: 1 (coinbase_ws.py)
- **Scheduler Coverage**: worker-data ✅ | worker-nlp ✅ | worker-broker ⚠️ (partial)
- **System Integrity**: PARTIAL — core data + NLP pipelines operational, broker layer dormant
