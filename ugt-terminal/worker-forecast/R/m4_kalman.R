# ─────────────────────────────────────────────────────────────
# M4 · Kalman
# Course items: B1 (Kalman smoothing and nowcasting, RTS smoother), S2 (local
# level and local linear trend instead of moving averages; time-varying beta
# and dynamic hedge ratio; stochastic cycle: expansion or contraction vs trend).
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages(library(KFAS))

M4_DAYS <- as.integer(Sys.getenv("M4_WINDOW_DAYS", "730"))
M4_CYCLE_PERIODS <- c(30, 45, 60, 90, 120, 180, 240)

fit_ssm <- function(model, n_par, y) {
  v <- var(diff(y), na.rm = TRUE)
  fitSSM(model, inits = rep(log(v), n_par), method = "BFGS")$model
}

# Smooth trend (fixed level, random slope) + stochastic cycle of a given period.
# Variances are estimated on the log scale through an explicit update function.
fit_cycle_model <- function(y, period) {
  v <- var(diff(y), na.rm = TRUE)
  m <- SSModel(y ~ SSMtrend(2, Q = list(matrix(0), matrix(v * 1e-4))) +
                 SSMcycle(period = period, Q = matrix(v * 0.1)), H = matrix(v * 0.5))
  q_idx <- seq_len(dim(m$Q)[1])
  upd <- function(pars, model) {
    Q <- model$Q
    Q[2, 2, 1] <- exp(pars[1])
    Q[3, 3, 1] <- Q[4, 4, 1] <- exp(pars[2])
    model$Q <- Q
    model$H[1, 1, 1] <- exp(pars[3])
    model
  }
  stopifnot(length(q_idx) == 4)
  fitSSM(m, inits = log(c(v * 1e-4, v * 0.1, v * 0.5)), updatefn = upd, method = "BFGS")$model
}

sma <- function(x, n) as.numeric(stats::filter(x, rep(1 / n, n), sides = 1))
ema <- function(x, n) {
  a <- 2 / (n + 1); out <- numeric(length(x)); out[1] <- x[1]
  for (i in 2:length(x)) out[i] <- a * x[i] + (1 - a) * out[i - 1]
  out
}

m4_asset <- function(con, asset) {
  sym <- split_asset(asset)$symbol
  df <- load_daily(con, asset, days = M4_DAYS, min_rows = 250)
  y <- log(df$close)
  n <- length(y)

  # Local level
  ll <- fit_ssm(SSModel(y ~ SSMtrend(1, Q = list(matrix(NA))), H = matrix(NA)), 2, y)
  k_ll <- KFS(ll, filtering = "state", smoothing = "state")
  q_ratio <- ll$Q[1, 1, 1] / ll$H[1, 1, 1]

  # Local linear trend
  llt <- fit_ssm(SSModel(y ~ SSMtrend(2, Q = list(matrix(NA), matrix(NA))), H = matrix(NA)), 3, y)
  k_llt <- KFS(llt, filtering = "state", smoothing = "state")
  filt_level <- k_llt$att[, 1]; smooth_level <- k_llt$alphahat[, 1]; smooth_slope <- k_llt$alphahat[, 2]
  pred <- predict(llt, n.ahead = 7, interval = "prediction", level = 0.8)

  # One-step-ahead predictors: Kalman vs SMA20 and EMA20 (all using data up to t-1)
  k_pred <- k_llt$a[1:n, 1]
  s20 <- c(NA, head(sma(y, 20), -1)); e20 <- c(NA, head(ema(y, 20), -1))
  ok <- 30:n
  mse <- c(kalman = mean((y[ok] - k_pred[ok])^2), sma20 = mean((y[ok] - s20[ok])^2), ema20 = mean((y[ok] - e20[ok])^2))
  best <- names(which.min(mse))

  # Stochastic cycle on a smooth trend: pick the period with the highest likelihood
  cyc_fits <- lapply(M4_CYCLE_PERIODS, function(p) {
    tryCatch({
      f <- fit_cycle_model(y, p)
      list(period = p, model = f, ll = logLik(f))
    }, error = function(e) NULL)
  })
  cyc_fits <- Filter(Negate(is.null), cyc_fits)
  if (length(cyc_fits) == 0) stop("stochastic cycle model did not converge for any period")
  cbest <- cyc_fits[[which.max(vapply(cyc_fits, function(z) as.numeric(z$ll), 0))]]
  k_c <- KFS(cbest$model, smoothing = "state")
  cyc <- signal(k_c, states = "cycle")$signal[, 1]
  cyc_trend <- signal(k_c, states = "trend")$signal[, 1]
  rising <- tail(cyc, 1) > cyc[n - 5]
  phase <- if (tail(cyc, 1) >= 0) { if (rising) "ESPANSIONE" else "PICCO_IN_FORMAZIONE" } else { if (rising) "RIPRESA" else "CONTRAZIONE" }

  days <- as.character(df$day)
  last <- tail(df$close, 1)
  nowcast <- exp(tail(filt_level, 1))
  slope_ann <- exp(365 * tail(smooth_slope, 1)) - 1
  fx <- c(days, as.character(tail(df$day, 1) + 1:7))
  padn <- rep(NA, n)

  module_result(
    headline = sprintf("%s: livello filtrato (nowcast) %s contro chiusura %s; pendenza del trend %s annuo; ciclo stocastico di circa %d giorni in fase %s. Predittore a un passo migliore: %s.",
                       sym, fmt_num(nowcast), fmt_num(last), fmt_pct(slope_ann), cbest$period, tolower(phase), toupper(best)),
    verdict = phase,
    summary = list(
      ui_item("Nowcast (livello filtrato)", fmt_num(nowcast), "stima del prezzo 'vero' al netto del rumore"),
      ui_item("Rumore oggi", fmt_pct(last / nowcast - 1), "chiusura rispetto al livello filtrato"),
      ui_item("Pendenza locale annualizzata", fmt_pct(slope_ann), "local linear trend, smoother RTS", if (slope_ann >= 0) "good" else "bad"),
      ui_item("Rapporto segnale/rumore q", fmt_num(q_ratio, 3), "Q/H del local level"),
      ui_item("Ciclo stocastico", paste0(cbest$period, " giorni"), "periodo con la massima verosimiglianza"),
      ui_item("Fase del ciclo", phase),
      ui_item("MSE a un passo: Kalman", formatC(mse["kalman"], format = "e", digits = 2), NULL, if (best == "kalman") "good" else NULL),
      ui_item("MSE a un passo: SMA20 / EMA20", paste(formatC(mse["sma20"], format = "e", digits = 2), "/", formatC(mse["ema20"], format = "e", digits = 2)))
    ),
    charts = list(
      ui_chart("Log prezzo: dato, filtro di Kalman, smoother RTS, SMA20", c(days, rep(NA, 0)), list(
        ui_line("log close", y), ui_line("Kalman filtrato", filt_level), ui_line("RTS smoothed", smooth_level), ui_line("SMA20", sma(y, 20))
      )),
      ui_chart("Local linear trend: previsione a 7 giorni (80%)", fx, list(
        ui_band("80%", c(padn, pred[, "lwr"]), c(padn, pred[, "upr"])),
        ui_line("log close", c(y, rep(NA, 7))), ui_line("previsione", c(padn, pred[, "fit"]))
      ), max_points = 500),
      ui_chart(sprintf("Ciclo stocastico (periodo %d giorni) rispetto al trend", cbest$period), days,
               list(ui_line("ciclo", cyc), ui_line("zero", rep(0, n)))),
      ui_chart("Pendenza del trend (drift giornaliero, smoother)", days, list(ui_line("slope", smooth_slope)))
    ),
    tables = list(ui_table("Varianze stimate (massima verosimiglianza)", data.frame(
      modello = c("local level", "local linear trend", "trend + ciclo"),
      H_osservazione = c(ll$H[1, 1, 1], llt$H[1, 1, 1], cbest$model$H[1, 1, 1]),
      Q_livello = c(ll$Q[1, 1, 1], llt$Q[1, 1, 1], 0),
      Q_pendenza = c(NA, llt$Q[2, 2, 1], cbest$model$Q[2, 2, 1]),
      Q_ciclo = c(NA, NA, cbest$model$Q[3, 3, 1]),
      loglik = c(logLik(ll), logLik(llt), as.numeric(cbest$ll))
    ))),
    notes = list(
      "Local level: prezzo = livello + rumore, il livello è un random walk. Local linear trend: si aggiunge una pendenza che evolve nel tempo.",
      "Filtro = stima con i dati fino a oggi (nowcast). Smoother RTS = stima con tutto il campione, più liscia ma usa il futuro: non va usata per i segnali.",
      "Il confronto con SMA20 ed EMA20 usa per tutti solo i dati fino al giorno prima.",
      "Ciclo stocastico: trend liscio più un ciclo smorzato; il periodo è scelto per massima verosimiglianza su una griglia."
    )
  )
}

# Time-varying regression: y_t = alpha_t + beta_t x_t + e_t, alpha and beta random walks
m4_beta <- function(con, pair, use_returns) {
  ys <- split_asset(pair[1])$symbol; xs <- split_asset(pair[2])$symbol
  w <- if (use_returns) aligned_returns(con, pair, days = M4_DAYS) else aligned_log_prices(con, pair, days = M4_DAYS)
  y <- w[[ys]]; x <- w[[xs]]
  m <- SSModel(y ~ SSMregression(~ x, Q = matrix(NA)) + SSMtrend(1, Q = list(matrix(NA))), H = matrix(NA))
  f <- fit_ssm(m, 3, y)
  k <- KFS(f, filtering = "state", smoothing = "state")
  bcol <- which(colnames(k$alphahat) == "x")
  beta_s <- k$alphahat[, bcol]; beta_f <- k$att[, bcol]
  sd_f <- sqrt(k$Ptt[bcol, bcol, ])
  ols <- unname(coef(lm(y ~ x))[2])
  roll <- slider::slide_dbl(seq_along(y), function(i) if (length(i) < 60) NA else unname(coef(lm(y[i] ~ x[i]))[2]), .before = 59, .complete = TRUE)
  label <- if (use_returns) "beta dei rendimenti" else "hedge ratio dei log prezzi"
  days <- as.character(w$day)

  module_result(
    headline = sprintf("%s su %s: %s oggi %s (filtrato), contro %s statico OLS; intervallo ±2σ %s – %s.",
                       ys, xs, label, fmt_num(tail(beta_f, 1), 3), fmt_num(ols, 3),
                       fmt_num(tail(beta_f, 1) - 2 * tail(sd_f, 1), 3), fmt_num(tail(beta_f, 1) + 2 * tail(sd_f, 1), 3)),
    verdict = if (use_returns) "DYNAMIC_BETA" else "DYNAMIC_HEDGE",
    summary = list(
      ui_item(paste(label, "(filtrato)"), fmt_num(tail(beta_f, 1), 3), "Kalman, solo dati fino a oggi"),
      ui_item("Smoother RTS", fmt_num(tail(beta_s, 1), 3)),
      ui_item("OLS statico", fmt_num(ols, 3), sprintf("ultimi %d giorni", length(y))),
      ui_item("OLS su 60 giorni", fmt_num(tail(roll, 1), 3)),
      ui_item("Min / max nel periodo", paste(fmt_num(min(beta_f[30:length(beta_f)]), 2), "/", fmt_num(max(beta_f[30:length(beta_f)]), 2)))
    ),
    charts = list(ui_chart(sprintf("%s nel tempo", label), days, list(
      ui_band("±2σ filtrato", beta_f - 2 * sd_f, beta_f + 2 * sd_f),
      ui_line("Kalman filtrato", beta_f), ui_line("RTS smoothed", beta_s), ui_line("OLS 60g", roll),
      ui_line("OLS statico", rep(ols, length(y)))
    ))),
    notes = list(
      "Regressione con coefficienti che seguono un random walk: il beta si aggiorna ogni giorno invece di restare fisso.",
      if (use_returns) "Beta dei rendimenti: quanto si muove l'asset per ogni 1% del benchmark. Serve per il rischio di portafoglio." else
        "Hedge ratio dei log prezzi: quante unità del secondo asset vendere per coprire il primo; la base per lo spread di M1 e M7."
    )
  )
}

run_m4 <- function(con) {
  for (a in ASSETS) run_subject(con, "M4_kalman", split_asset(a)$symbol, list(asset = a, days = M4_DAYS), function() m4_asset(con, a))
  pair_name <- paste0(split_asset(PAIR[1])$symbol, "~", split_asset(PAIR[2])$symbol)
  run_subject(con, "M4_kalman", paste(pair_name, "beta"), list(pair = PAIR), function() m4_beta(con, PAIR, TRUE))
  run_subject(con, "M4_kalman", paste(pair_name, "hedge"), list(pair = PAIR), function() m4_beta(con, PAIR, FALSE))
  bench <- c(ASSETS[1], "stooq:SPX")
  if (all(bench %in% ASSETS)) {
    run_subject(con, "M4_kalman", paste0(split_asset(bench[1])$symbol, "~SPX beta"), list(pair = bench), function() m4_beta(con, bench, TRUE))
  }
}
