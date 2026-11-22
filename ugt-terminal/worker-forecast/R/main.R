# ─────────────────────────────────────────────────────────────
# UGT forecast engine (worker-forecast), M0 skeleton.
#
# Once a day (and at start-up) for each symbol:
#   1. read daily closes from market_daily
#   2. fit the course benchmarks (NAIVE, drift) plus ETS and ARIMA on log prices
#   3. forecast 7 days ahead with 80% and 95% intervals
#   4. write one row to forecast_results (module "M0_smoke") and every
#      point to forecast_log, so live out-of-sample scoring (M6) has history.
#
# Failures are written to forecast_results with status "error": never silent.
# Later modules (M1 Radar, M2 decomposition, M3 Risk Engine, ...) are added
# as new files in R/ and called from run_all().
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages({
  library(DBI)
  library(dplyr)
  library(tsibble)
  library(fable)
  library(fabletools)
  library(jsonlite)
})

source("R/db.R")

SYMBOLS <- trimws(strsplit(Sys.getenv("FORECAST_SYMBOLS", "binance:BTCUSDT,binance:ETHUSDT"), ",")[[1]])
HORIZON <- as.integer(Sys.getenv("FORECAST_HORIZON_DAYS", "7"))
TRAIN_DAYS <- as.integer(Sys.getenv("FORECAST_TRAIN_DAYS", "1095"))
RUN_HOUR_UTC <- as.integer(Sys.getenv("FORECAST_RUN_HOUR_UTC", "1"))

log_msg <- function(...) {
  cat(format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"), "worker-forecast", ..., "\n")
  flush.console()
}

heartbeat <- function() writeLines(format(Sys.time(), tz = "UTC"), "/tmp/heartbeat")

smoke_forecast <- function(con, source, symbol) {
  hist <- dbGetQuery(con, "
      SELECT day, close FROM market_daily
      WHERE source = $1 AND symbol = $2
      ORDER BY day DESC LIMIT $3", params = list(source, symbol, TRAIN_DAYS))
  if (nrow(hist) < 60) {
    stop(sprintf("only %d daily rows for %s:%s in market_daily (need 60): is worker-recorder collecting history?",
                 nrow(hist), source, symbol))
  }
  y <- hist |>
    mutate(day = as.Date(day)) |>
    arrange(day) |>
    as_tsibble(index = day) |>
    fill_gaps() |>
    tidyr::fill(close, .direction = "down")

  fit <- y |> model(
    naive = NAIVE(log(close)),
    drift = RW(log(close) ~ drift()),
    ets   = ETS(log(close)),
    arima = ARIMA(log(close))
  )
  fc <- fit |> forecast(h = HORIZON)
  iv <- fc |>
    hilo(level = c(80, 95)) |>
    unpack_hilo(c(`80%`, `95%`)) |>
    as_tibble() |>
    group_by(.model) |>
    mutate(horizon = row_number()) |>
    ungroup() |>
    transmute(model = .model, horizon, target_date = day, point = .mean,
              lo80 = `80%_lower`, hi80 = `80%_upper`, lo95 = `95%_lower`, hi95 = `95%_upper`)

  issued_on <- max(y$day)
  list(
    issued_on = issued_on,
    rows = iv,
    result = list(
      last_day = as.character(issued_on),
      last_close = tail(y$close, 1),
      n_obs = nrow(y),
      models = lapply(setdiff(names(fit), key_vars(fit)), function(m) list(model = m, spec = format(fit[[m]][[1]]))),
      forecasts = iv |> mutate(target_date = as.character(target_date))
    )
  )
}

run_all <- function() {
  con <- db_connect()
  on.exit(dbDisconnect(con), add = TRUE)
  for (s in SYMBOLS) {
    parts <- strsplit(s, ":")[[1]]
    source <- parts[1]; symbol <- parts[2]
    params <- list(source = source, horizon = HORIZON, train_days = TRAIN_DAYS,
                   models = c("NAIVE", "RW drift", "ETS", "ARIMA"), transform = "log")
    out <- tryCatch(smoke_forecast(con, source, symbol), error = function(e) e)
    if (inherits(out, "error")) {
      log_msg("ERROR", symbol, conditionMessage(out))
      write_result(con, "M0_smoke", symbol, "error", params, list(error = conditionMessage(out)))
    } else {
      write_result(con, "M0_smoke", symbol, "ok", params, out$result)
      write_forecast_log(con, symbol, out$issued_on, out$rows)
      log_msg("ok", symbol, "issued_on", as.character(out$issued_on), nrow(out$rows), "points")
    }
  }
}

seconds_until_next_run <- function(now = Sys.time()) {
  today <- as.POSIXct(format(now, "%Y-%m-%d", tz = "UTC"), tz = "UTC")
  nxt <- today + RUN_HOUR_UTC * 3600
  if (nxt <= now) nxt <- nxt + 86400
  as.numeric(difftime(nxt, now, units = "secs"))
}

main <- function() {
  log_msg("starting; symbols:", paste(SYMBOLS, collapse = ", "))
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
