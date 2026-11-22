# worker-forecast

R forecast engine of UGT (fable / feasts / tsibble, i.e. the fpp3 tools, plus urca,
strucchange, KFAS, depmixS4, copula). It reads history from the database and writes
one result per module and subject to `forecast_results`; FORECAST_LAB shows them.

| Module | File | What it answers |
|---|---|---|
| M0 | `R/m0_smoke.R` | 7-day NAIVE, drift, ETS, ARIMA forecasts (logged to `forecast_log`) |
| M1 | `R/m1_radar.R` | Stationary or unit root? Mean-reversion or trend-following? Are returns white noise? |
| M2 | `R/m2_decomp.R` | STL / classical decomposition, cycle and turning points, structural breaks, Guerrero lambda |
| M3 | `R/m3_risk.R` | Which model forecasts best in rolling-origin CV; 80/95% intervals as TP/SL; EWMA, VaR |
| M4 | `R/m4_kalman.R` | Kalman local level / trend, RTS smoother, stochastic cycle, time-varying beta |
| M5 | `R/m5_scenari.R` | Sentiment ARIMAX, macro scenarios, elasticities, FED event study, Fourier, HMM regimes |
| M6 | `R/m6_scoreboard.R` | How the saved forecasts performed against real prices |
| M7 | `R/m7_quant.R` | GARCH / GJR / EGARCH, Johansen + Ornstein-Uhlenbeck, PCA, multivariate regression |
| M8 | `R/m8_tail.R` | Copulas, portfolio stress (t-copula), Hawkes processes |

Every result has the same shape (`headline`, `verdict`, `summary`, `charts`, `tables`,
`notes`, see `R/util.R`), so the interface needs no module-specific code. A failure is
stored with `status = 'error'` and its message.

## Configuration (environment variables)

- `FORECAST_MODULES` — run only some modules, e.g. `M1,M3` (default: all)
- `FORECAST_RUN_HOUR_UTC` — daily run hour (default 1)
- `FORECAST_ASSETS` — `source:symbol` list (default `binance:BTCUSDT,binance:ETHUSDT,stooq:SPX`)
- `FORECAST_PAIR` — pair for spread, hedge ratio and Johansen (default `binance:ETHUSDT,binance:BTCUSDT`)
- `M3_WINDOW_DAYS`, `M3_CV_INIT`, `M3_CV_STEP`, `M4_WINDOW_DAYS`, `M7_GARCH_DAYS`, `M7_TARGET_VOL`

## Running one module by hand

```bash
docker compose run --rm -e FORECAST_MODULES=M3 worker-forecast \
  Rscript -e 'source("R/main.R"); wait_for_schema(); run_all()'
```
A full run of all modules takes about 4 minutes.
