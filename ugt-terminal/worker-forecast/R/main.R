# ─────────────────────────────────────────────────────────────
# UGT forecast engine (worker-forecast).
#
# Once a day (and at start-up) every module runs in order. Each module writes
# one row per subject to forecast_results; a failure is written with status
# "error" and its message, never hidden. FORECAST_LAB shows the latest row of
# every module and subject.
#
#   M0  smoke forecast (benchmarks, ETS, ARIMA)          R/m0_smoke.R
#   M1  stationarity and efficiency radar                R/m1_radar.R
#   M2  decomposition, cycles, structural breaks         R/m2_decomp.R
#   M3  risk engine: CV, intervals, TP/SL, EWMA, VaR      R/m3_risk.R
#   M4  Kalman: level, trend, cycle, dynamic beta         R/m4_kalman.R
#   M5  scenarios, sentiment, FED events, Fourier, HMM    R/m5_scenari.R
#   M6  scoreboard of the saved forecasts                R/m6_scoreboard.R
#   M7  GARCH family, Johansen + OU, PCA, regressions     R/m7_quant.R
#   M8  copulas, portfolio stress, Hawkes                 R/m8_tail.R
#
# FORECAST_MODULES (comma separated, e.g. "M1,M3") limits which modules run.
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages({
  library(DBI)
  library(dplyr)
  library(tsibble)
  library(fable)
  library(fabletools)
  library(jsonlite)
})

for (f in c("R/util.R", "R/db.R", "R/data.R", sort(Sys.glob("R/m[0-9]*_*.R")))) source(f)

RUN_HOUR_UTC <- as.integer(Sys.getenv("FORECAST_RUN_HOUR_UTC", "1"))

MODULES <- list(
  M0 = function(con) run_m0(con),
  M1 = function(con) run_m1(con),
  M2 = function(con) run_m2(con),
  M3 = function(con) run_m3(con),
  M4 = function(con) run_m4(con),
  M5 = function(con) run_m5(con),
  M6 = function(con) run_m6(con),
  M7 = function(con) run_m7(con),
  M8 = function(con) run_m8(con)
)

enabled_modules <- function() {
  sel <- trimws(strsplit(Sys.getenv("FORECAST_MODULES", ""), ",")[[1]])
  if (length(sel) == 0 || all(sel == "")) names(MODULES) else intersect(names(MODULES), sel)
}

run_all <- function() {
  con <- db_connect()
  on.exit(dbDisconnect(con), add = TRUE)
  for (m in enabled_modules()) {
    heartbeat()
    tryCatch(MODULES[[m]](con), error = function(e) log_msg("ERROR module", m, conditionMessage(e)))
  }
}

seconds_until_next_run <- function(now = Sys.time()) {
  today <- as.POSIXct(format(now, "%Y-%m-%d", tz = "UTC"), tz = "UTC")
  nxt <- today + RUN_HOUR_UTC * 3600
  if (nxt <= now) nxt <- nxt + 86400
  as.numeric(difftime(nxt, now, units = "secs"))
}

main <- function() {
  log_msg("starting; modules:", paste(enabled_modules(), collapse = ", "))
  wait_for_schema()
  repeat {
    heartbeat()
    tryCatch(run_all(), error = function(e) log_msg("ERROR run_all:", conditionMessage(e)))
    remaining <- seconds_until_next_run()
    log_msg("next run in", round(remaining / 3600, 1), "hours")
    while (remaining > 0) {
      heartbeat()
      step <- min(remaining, 300)
      Sys.sleep(step)
      remaining <- remaining - step
    }
  }
}

if (sys.nframe() == 0) main()
