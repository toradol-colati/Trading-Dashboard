# ─────────────────────────────────────────────────────────────
# M1 · Radar di stazionarietà ed efficienza
# Course items: B3 (ADF with/without drift and trend vs KPSS, order d;
# Ljung-Box white-noise check), S3 (Unit Root Monitor on series and spreads:
# mean-reversion or trend-following; rolling Ljung-Box "efficiency radar").
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages({
  library(urca)
})

M1_LB_LAG <- 10
M1_WINDOW <- 90      # rolling Ljung-Box window (days)
M1_ADF_WINDOW <- 180 # rolling ADF window on the spread (days)
M1_STEP <- 5

adf_row <- function(y, type, label) {
  t <- ur.df(y, type = type, lags = 10, selectlags = "AIC")
  stat <- t@teststat[1, 1]
  cv5 <- t@cval[1, "5pct"]
  data.frame(series = label, test = paste0("ADF (", type, ")"), statistic = stat, crit_5pct = cv5,
             reject_h0 = stat < cv5, h0 = "unit root", stringsAsFactors = FALSE)
}

kpss_row <- function(y, type, label) {
  t <- ur.kpss(y, type = type, lags = "short")
  stat <- t@teststat
  cv5 <- t@cval[1, "5pct"]
  data.frame(series = label, test = paste0("KPSS (", type, ")"), statistic = stat, crit_5pct = cv5,
             reject_h0 = stat > cv5, h0 = "stationary", stringsAsFactors = FALSE)
}

verdict_it <- function(v) switch(v,
  STATIONARY = "stazionario", UNIT_ROOT = "con radice unitaria", AMBIGUOUS = "ambiguo (ADF e KPSS non concordano)", v)

unit_root_verdict <- function(adf_reject, kpss_reject) {
  if (adf_reject && !kpss_reject) return("STATIONARY")
  if (!adf_reject && kpss_reject) return("UNIT_ROOT")
  "AMBIGUOUS"
}

rolling_lb <- function(r, day, window = M1_WINDOW, step = M1_STEP, lag = M1_LB_LAG) {
  ends <- seq(window, length(r), by = step)
  if (tail(ends, 1) != length(r)) ends <- c(ends, length(r))
  data.frame(
    day = day[ends],
    p = vapply(ends, function(e) Box.test(r[(e - window + 1):e], lag = lag, type = "Ljung-Box")$p.value, 0)
  )
}

radar_series <- function(day, logp, label) {
  r <- diff(logp)
  rday <- day[-1]

  tests <- rbind(
    adf_row(logp, "none", "log price"), adf_row(logp, "drift", "log price"), adf_row(logp, "trend", "log price"),
    kpss_row(logp, "mu", "log price"), kpss_row(logp, "tau", "log price"),
    adf_row(r, "drift", "log return"), kpss_row(r, "mu", "log return")
  )
  d <- feasts::unitroot_ndiffs(logp)[[1]]
  lv <- unit_root_verdict(tests$reject_h0[tests$series == "log price" & tests$test == "ADF (drift)"],
                          tests$reject_h0[tests$series == "log price" & tests$test == "KPSS (mu)"])
  lb <- Box.test(r, lag = M1_LB_LAG, type = "Ljung-Box")
  lb2 <- Box.test(r^2, lag = M1_LB_LAG, type = "Ljung-Box")
  roll <- rolling_lb(r, rday)
  share_ineff <- mean(roll$p < 0.05)
  last_p <- tail(roll$p, 1)

  style <- switch(lv,
    STATIONARY = "MEAN_REVERSION",
    UNIT_ROOT = "TREND_FOLLOWING",
    "UNCLEAR")
  efficiency <- if (lb$p.value < 0.05) "AUTOCORRELATED" else "WHITE_NOISE"

  list(
    tests = tests, d = d, level_verdict = lv, style = style, efficiency = efficiency,
    lb = lb, lb2 = lb2, roll = roll, share_ineff = share_ineff, last_p = last_p,
    r = r, rday = rday
  )
}

m1_asset <- function(con, asset) {
  df <- load_daily(con, asset, days = 2000, min_rows = 250)
  x <- radar_series(df$day, log(df$close), asset)
  sym <- split_asset(asset)$symbol

  module_result(
    headline = sprintf("%s: prezzo %s (d = %d), quindi setup %s; rendimenti %s (Ljung-Box p = %s), finestra recente p = %s.",
                       sym, verdict_it(x$level_verdict), x$d, x$style,
                       if (x$efficiency == "WHITE_NOISE") "senza memoria" else "con autocorrelazione",
                       fmt_p(x$lb$p.value), fmt_p(x$last_p)),
    verdict = x$style,
    summary = list(
      ui_item("Ordine di integrazione d", as.character(x$d), "unitroot_ndiffs (KPSS)"),
      ui_item("Livelli", x$level_verdict, "ADF con drift vs KPSS (mu)", if (x$level_verdict == "AMBIGUOUS") "warn" else NULL),
      ui_item("Setup suggerito", x$style),
      ui_item("Ljung-Box rendimenti", fmt_p(x$lb$p.value), paste0("lag ", M1_LB_LAG, ", H0 white noise"),
              if (x$lb$p.value < 0.05) "warn" else "good"),
      ui_item("Ljung-Box rendimenti²", fmt_p(x$lb2$p.value), "effetto ARCH: volatilità a grappoli",
              if (x$lb2$p.value < 0.05) "warn" else "good"),
      ui_item("Finestre inefficienti", fmt_pct(x$share_ineff), sprintf("quota di finestre da %d giorni con p < 0.05", M1_WINDOW))
    ),
    charts = list(
      ui_chart(sprintf("Radar di efficienza: p-value Ljung-Box su finestre mobili di %d giorni", M1_WINDOW),
               x$roll$day, list(ui_line("p-value", x$roll$p), ui_line("soglia 0.05", rep(0.05, nrow(x$roll))))),
      ui_chart("Log prezzo", df$day, list(ui_line("log close", log(df$close))))
    ),
    tables = list(ui_table("Test di radice unitaria", x$tests)),
    notes = list(
      "ADF: H0 radice unitaria (rifiuto = stazionaria). KPSS: H0 stazionaria (rifiuto = radice unitaria). Si leggono insieme.",
      "Livelli stazionari suggeriscono mean-reversion; radice unitaria suggerisce trend-following sul prezzo e analisi sui rendimenti.",
      "Ljung-Box sui rendimenti: p < 0.05 vuol dire autocorrelazione, quindi una parte del movimento è prevedibile (mercato meno efficiente).",
      "Lag dell'ADF scelti con AIC fino a 10; KPSS con lag 'short'."
    )
  )
}

m1_spread <- function(con, pair) {
  w <- aligned_log_prices(con, pair, days = 2000)
  ys <- split_asset(pair[1])$symbol; xs <- split_asset(pair[2])$symbol
  fit <- lm(w[[ys]] ~ w[[xs]])
  beta <- unname(coef(fit)[2])
  spread <- w[[ys]] - beta * w[[xs]]
  x <- radar_series(w$day, spread, "spread")

  ends <- seq(M1_ADF_WINDOW, length(spread), by = 10)
  roll_adf <- data.frame(day = w$day[ends], p = vapply(ends, function(e) {
    suppressWarnings(tseries::adf.test(spread[(e - M1_ADF_WINDOW + 1):e])$p.value)
  }, 0))
  share_mr <- mean(roll_adf$p < 0.05)

  module_result(
    headline = sprintf("Spread %s − %.2f·%s: %s; nelle finestre da %d giorni è stazionario il %s delle volte.",
                       ys, beta, xs, verdict_it(x$level_verdict), M1_ADF_WINDOW, fmt_pct(share_mr)),
    verdict = x$style,
    summary = list(
      ui_item("Hedge ratio (OLS)", fmt_num(beta, 3), sprintf("log %s su log %s", ys, xs)),
      ui_item("Spread", x$level_verdict, "ADF con drift vs KPSS (mu)"),
      ui_item("Setup suggerito", x$style),
      ui_item("Finestre stazionarie", fmt_pct(share_mr), "ADF p < 0.05 su finestre mobili"),
      ui_item("ADF ultima finestra", fmt_p(tail(roll_adf$p, 1)))
    ),
    charts = list(
      ui_chart("Spread", w$day, list(ui_line("spread", spread), ui_line("media", rep(mean(spread), length(spread))))),
      ui_chart(sprintf("Unit Root Monitor: p-value ADF su finestre mobili di %d giorni", M1_ADF_WINDOW),
               roll_adf$day, list(ui_line("p-value ADF", roll_adf$p), ui_line("soglia 0.05", rep(0.05, nrow(roll_adf)))))
    ),
    tables = list(ui_table("Test di radice unitaria sullo spread", x$tests)),
    notes = list(
      "Lo spread è il residuo della regressione dei log prezzi: se è stazionario la coppia torna verso l'equilibrio (base per lo stat-arb di M7).",
      "Il test di cointegrazione vero e proprio (Johansen) è nel modulo M7."
    )
  )
}

run_m1 <- function(con) {
  for (a in ASSETS) run_subject(con, "M1_radar", split_asset(a)$symbol, list(asset = a), function() m1_asset(con, a))
  run_subject(con, "M1_radar", paste0(split_asset(PAIR[1])$symbol, "/", split_asset(PAIR[2])$symbol),
              list(pair = PAIR), function() m1_spread(con, PAIR))
}
