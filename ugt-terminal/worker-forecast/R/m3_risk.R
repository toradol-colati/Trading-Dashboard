# ─────────────────────────────────────────────────────────────
# M3 · Risk Engine
# Course items: S4 (80/95% prediction intervals from ETS and ARIMA as take
# profit / stop loss; quantile forecasts, Quantile score and Winkler score,
# backtesting), the theory part (benchmarks MEAN, NAIVE, SNAIVE, drift = random
# walk; rolling-origin cross-validation). Notion extra: EWMA volatility.
# ─────────────────────────────────────────────────────────────

M3_WINDOW <- as.integer(Sys.getenv("M3_WINDOW_DAYS", "1500"))
M3_INIT <- as.integer(Sys.getenv("M3_CV_INIT", "1000"))
M3_STEP <- as.integer(Sys.getenv("M3_CV_STEP", "30"))
M3_H <- 7
M3_EWMA_LAMBDA <- 0.94
M3_RISK_PER_TRADE <- 0.01

m3_models <- function(season) {
  list(
    mean = MEAN(log(close)),
    naive = NAIVE(log(close)),
    snaive = SNAIVE(log(close) ~ lag(season)),
    drift = RW(log(close) ~ drift()),
    ets = ETS(log(close)),
    arima = ARIMA(log(close) ~ pdq(0:2, 1, 0:2) + PDQ(0, 0, 0))
  )
}

fit_models <- function(data, season) {
  mods <- m3_models(season)
  do.call(model, c(list(data), mods))
}

ewma_sigma <- function(r, lambda = M3_EWMA_LAMBDA) {
  s2 <- numeric(length(r))
  s2[1] <- var(r[1:min(30, length(r))])
  for (i in 2:length(r)) s2[i] <- lambda * s2[i - 1] + (1 - lambda) * r[i - 1]^2
  sqrt(s2)
}

future_dates <- function(last_day, h, trading) {
  if (!trading) return(last_day + seq_len(h))
  out <- c(); d <- last_day
  while (length(out) < h) {
    d <- d + 1
    if (!(format(d, "%u") %in% c("6", "7"))) out <- c(out, d)
  }
  as.Date(out, origin = "1970-01-01")
}

m3_asset <- function(con, asset) {
  a <- split_asset(asset)
  trading <- a$source == "stooq"
  df <- load_daily(con, asset, days = M3_WINDOW, min_rows = M3_INIT + 60)
  season <- if (trading) 5 else 7
  y <- if (trading) trading_tsibble(df[, c("day", "close")]) else daily_tsibble(df[, c("day", "close")])

  # 1. Rolling-origin cross-validation (expanding window)
  cv <- y |> stretch_tsibble(.init = M3_INIT, .step = M3_STEP)
  n_folds <- length(unique(cv$.id))
  fc_cv <- cv |> fit_models(season) |> forecast(h = M3_H)
  acc <- fc_cv |>
    accuracy(y, measures = list(
      RMSE = RMSE, MAE = MAE, MAPE = MAPE, MASE = MASE,
      winkler80 = function(...) winkler_score(..., level = 80),
      winkler95 = function(...) winkler_score(..., level = 95),
      QS10 = function(...) quantile_score(..., probs = 0.1),
      QS90 = function(...) quantile_score(..., probs = 0.9),
      CRPS = CRPS
    )) |>
    select(-any_of(c(".type", "symbol"))) |>
    arrange(CRPS)
  best <- acc$.model[1]

  # Coverage of the 80/95% intervals across all CV forecasts
  cov <- fc_cv |>
    hilo(level = c(80, 95)) |>
    unpack_hilo(c(`80%`, `95%`)) |>
    as_tibble() |>
    select(-close) |>
    left_join(as_tibble(y) |> select(all_of(c(index_var(y), "close"))) |> rename(actual = close), by = index_var(y)) |>
    group_by(.model) |>
    summarise(coverage80 = mean(actual >= `80%_lower` & actual <= `80%_upper`, na.rm = TRUE),
              coverage95 = mean(actual >= `95%_lower` & actual <= `95%_upper`, na.rm = TRUE), .groups = "drop")
  acc <- acc |> left_join(cov, by = ".model")

  # 2. Forecast from the full window with every model; TP/SL from the best one
  fit <- y |> fit_models(season)
  fc <- fit |> forecast(h = M3_H)
  iv <- fc |>
    hilo(level = c(80, 95)) |>
    unpack_hilo(c(`80%`, `95%`)) |>
    as_tibble() |>
    group_by(.model) |> mutate(horizon = row_number()) |> ungroup()
  last_close <- tail(y$close, 1)
  last_day <- tail(df$day, 1)
  dates <- future_dates(last_day, M3_H, trading)
  iv$target_date <- dates[iv$horizon]

  b <- iv |> filter(.model == best)
  q <- fc |> filter(.model == best) |> as_tibble()
  probs <- c(0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95)
  qtab <- data.frame(giorno = as.character(dates))
  for (p in probs) qtab[[paste0("q", p * 100)]] <- vapply(q$close, function(d) quantile(d, p), 0)

  tp <- tail(b$`80%_upper`, 1); sl <- tail(b$`80%_lower`, 1)
  rr <- (tp - last_close) / (last_close - sl)
  stop_dist <- (last_close - sl) / last_close
  size <- M3_RISK_PER_TRADE / stop_dist

  # 3. EWMA volatility and VaR
  r <- diff(log(df$close))
  sig <- ewma_sigma(r)
  ann <- if (trading) sqrt(252) else sqrt(365)
  sig_next <- sqrt(M3_EWMA_LAMBDA * tail(sig, 1)^2 + (1 - M3_EWMA_LAMBDA) * tail(r, 1)^2)
  var95 <- qnorm(0.95) * sig_next; var99 <- qnorm(0.99) * sig_next
  hist_r <- tail(r, 500)
  hvar95 <- -quantile(hist_r, 0.05); es975 <- -mean(hist_r[hist_r <= quantile(hist_r, 0.025)])

  # 4. Log every model's forecast for live scoring in M6
  log_rows <- iv |> transmute(model = paste0("m3_", .model), horizon, target_date, point = .mean,
                              lo80 = `80%_lower`, hi80 = `80%_upper`, lo95 = `95%_lower`, hi95 = `95%_upper`)
  write_forecast_log(con, a$symbol, last_day, log_rows)

  hist_tail <- tail(df, 120)
  x <- c(as.character(hist_tail$day), as.character(dates))
  pad <- rep(NA, nrow(hist_tail))
  conn <- c(rep(NA, nrow(hist_tail) - 1), last_close)

  module_result(
    headline = sprintf("%s: il modello migliore in cross-validation è %s (CRPS più basso su %d origini). A 7 giorni: centro %s, take profit %s (80%% alto), stop %s (80%% basso), rapporto rischio/rendimento %.2f.",
                       a$symbol, toupper(best), n_folds, fmt_num(tail(b$.mean, 1)), fmt_num(tp), fmt_num(sl), rr),
    verdict = toupper(best),
    summary = list(
      ui_item("Ultima chiusura", fmt_num(last_close), as.character(last_day)),
      ui_item("Take profit (80% alto, +7)", fmt_num(tp), fmt_pct(tp / last_close - 1), "good"),
      ui_item("Stop loss (80% basso, +7)", fmt_num(sl), fmt_pct(sl / last_close - 1), "bad"),
      ui_item("Rischio/rendimento", fmt_num(rr, 2), "(TP − prezzo) / (prezzo − SL)"),
      ui_item("Size con rischio 1%", fmt_pct(size), "quota di capitale se lo stop costa l'1%"),
      ui_item("Volatilità EWMA annua", fmt_pct(sig_next * ann), "lambda 0.94 (RiskMetrics)"),
      ui_item("VaR 1g 95% / 99%", paste(fmt_pct(var95), "/", fmt_pct(var99)), "normale con sigma EWMA"),
      ui_item("VaR storico 95% / ES 97.5%", paste(fmt_pct(hvar95), "/", fmt_pct(es975)), "ultimi 500 giorni")
    ),
    charts = list(
      ui_chart(sprintf("Previsione %s a 7 giorni con intervalli 80/95%%", toupper(best)), x, list(
        ui_band("95%", c(pad, b$`95%_lower`), c(pad, b$`95%_upper`)),
        ui_band("80%", c(pad, b$`80%_lower`), c(pad, b$`80%_upper`)),
        ui_line("close", c(hist_tail$close, rep(NA, M3_H))),
        ui_line(best, c(conn, b$.mean))
      ), max_points = 200),
      ui_chart("Volatilità EWMA annualizzata", as.character(df$day[-1]), list(ui_line("sigma EWMA annua", sig * ann)))
    ),
    tables = list(
      ui_table(sprintf("Cross-validation a origine mobile: %d origini, orizzonte 1-7 giorni, ordinati per CRPS", n_folds), acc),
      ui_table(sprintf("Previsioni per quantili (%s)", toupper(best)), qtab)
    ),
    notes = list(
      sprintf("CV a origine mobile: si stima su %d giorni, si prevedono i 7 successivi, si sposta l'origine di %d giorni e si ripete.", M3_INIT, M3_STEP),
      "Tutti i modelli lavorano sul log prezzo; le previsioni sono riportate in prezzo (media corretta per il bias).",
      "Winkler score: ampiezza dell'intervallo più una penalità quando il prezzo esce; più basso è meglio. Quantile score (pinball) ai quantili 10% e 90%. CRPS valuta tutta la distribuzione.",
      "Take profit e stop loss sono i bordi dell'intervallo all'80% a 7 giorni del modello migliore: una soglia statistica, non un consiglio d'investimento.",
      "Coverage: quota di prezzi reali finiti dentro l'intervallo. Un 80% ben calibrato dovrebbe stare vicino a 0.80."
    )
  )
}

run_m3 <- function(con) {
  for (a in ASSETS) run_subject(con, "M3_risk", split_asset(a)$symbol, list(asset = a, window = M3_WINDOW, init = M3_INIT, step = M3_STEP, h = M3_H),
                                function() m3_asset(con, a))
}
