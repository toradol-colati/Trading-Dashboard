# ─────────────────────────────────────────────────────────────
# M2 · Decomposizione, cicli e rotture strutturali
# Course items: B1 (business cycles and turning points; robust STL and classical
# decomposition, seasonal adjustment), B2 (piecewise trend and structural
# breaks), S5 (interactive STL on trend-cycle and volumes, weekly and monthly
# screening; Box-Cox with Guerrero lambda for volatility regimes).
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages({
  library(feasts)
  library(strucchange)
})

M2_MACRO <- trimws(strsplit(Sys.getenv("FORECAST_MACRO_SERIES", "CPIAUCSL,UNRATE,M2SL"), ",")[[1]])
M2_LOG_SERIES <- c("CPIAUCSL", "M2SL")  # series analysed in logs (levels that grow exponentially)

# Hamilton (2018) filter: regress y[t+h] on y[t], ..., y[t-p+1]; the residual is the cycle.
hamilton_cycle <- function(y, h = 24, p = 12) {
  n <- length(y)
  idx <- (p):(n - h)
  X <- sapply(0:(p - 1), function(j) y[idx - j])
  Y <- y[idx + h]
  fit <- lm(Y ~ X)
  cyc <- rep(NA_real_, n)
  cyc[idx + h] <- residuals(fit)
  cyc
}

# Local extrema within +/- k observations, alternating peak/trough.
turning_points <- function(x, dates, k = 6) {
  n <- length(x)
  pts <- list()
  for (i in seq_len(n)) {
    if (is.na(x[i]) || i <= k || i > n - k) next
    w <- x[(i - k):(i + k)]
    if (any(is.na(w))) next
    if (x[i] == max(w)) pts[[length(pts) + 1]] <- data.frame(i = i, type = "picco")
    if (x[i] == min(w)) pts[[length(pts) + 1]] <- data.frame(i = i, type = "minimo")
  }
  if (length(pts) == 0) return(data.frame(date = character(), type = character(), cycle = numeric()))
  tp <- do.call(rbind, pts)
  keep <- tp[1, , drop = FALSE]
  for (j in seq_len(nrow(tp))[-1]) {
    last <- keep[nrow(keep), ]
    if (tp$type[j] == last$type) {
      better <- if (tp$type[j] == "picco") x[tp$i[j]] > x[last$i] else x[tp$i[j]] < x[last$i]
      if (better) keep[nrow(keep), ] <- tp[j, ]
    } else {
      keep <- rbind(keep, tp[j, ])
    }
  }
  data.frame(date = as.character(dates[keep$i]), type = keep$type, cycle = x[keep$i])
}

m2_macro <- function(con, series_id) {
  raw <- load_macro(con, series_id, min_rows = 60)
  y <- macro_monthly(raw)
  use_log <- series_id %in% M2_LOG_SERIES
  y <- y |> mutate(v = if (use_log) log(value) else value)

  stl <- y |> model(STL(v ~ season(window = 13), robust = TRUE)) |> components()
  classical <- y |> model(classical_decomposition(v, type = "additive")) |> components()
  feats <- y |> features(v, feat_stl)
  cyc <- hamilton_cycle(y$v)
  tp <- turning_points(cyc, y$month)
  recent_tp <- tail(tp, 6)
  phase <- if (nrow(tp) == 0) "—" else if (tail(tp$type, 1) == "minimo") "ESPANSIONE (dopo un minimo)" else "CONTRAZIONE (dopo un picco)"

  last <- tail(stl, 1)
  yoy <- if (use_log) exp(tail(y$v, 1) - y$v[nrow(y) - 12]) - 1 else tail(y$v, 1) - y$v[nrow(y) - 12]
  months <- as.character(y$month)

  module_result(
    headline = sprintf("%s: forza stagionale %.2f, forza del trend %.2f; ciclo di Hamilton in fase %s.",
                       series_id, feats$seasonal_strength_year, feats$trend_strength, tolower(phase)),
    verdict = if (grepl("ESPANSIONE", phase)) "EXPANSION" else if (grepl("CONTRAZIONE", phase)) "CONTRACTION" else NULL,
    summary = list(
      ui_item("Ultimo valore", fmt_num(tail(y$value, 1), 3), as.character(tail(y$month, 1))),
      ui_item(if (use_log) "Variazione 12 mesi" else "Differenza 12 mesi", if (use_log) fmt_pct(yoy) else fmt_num(yoy, 2)),
      ui_item("Forza stagionale", fmt_num(feats$seasonal_strength_year, 2), "0 = nessuna, 1 = tutta stagionalità"),
      ui_item("Forza del trend", fmt_num(feats$trend_strength, 2)),
      ui_item("Fase del ciclo", phase),
      ui_item("Ultimo turning point", if (nrow(tp)) paste(tail(tp$type, 1), tail(tp$date, 1)) else "—")
    ),
    charts = list(
      ui_chart(sprintf("%s%s: dato, trend STL e destagionalizzato", if (use_log) "log " else "", series_id),
               months, list(ui_line("dato", stl$v), ui_line("trend STL", stl$trend), ui_line("destagionalizzato", stl$season_adjust))),
      ui_chart("Componente stagionale (STL robusta vs classica)", months,
               list(ui_line("STL", stl$season_year), ui_line("classica", classical$seasonal))),
      ui_chart("Ciclo (filtro di Hamilton, h = 24 mesi)", months,
               list(ui_line("ciclo", cyc), ui_line("zero", rep(0, length(cyc)))))
    ),
    tables = list(ui_table("Turning points recenti del ciclo", recent_tp)),
    notes = list(
      "STL robusta: i valori anomali non deformano trend e stagionalità. La decomposizione classica serve da confronto.",
      "Il ciclo è stimato col filtro di Hamilton (regressione a 24 mesi): evita i problemi di fine campione del filtro HP.",
      "Turning points = massimi e minimi locali del ciclo su ±6 mesi, alternati."
    )
  )
}

weekly_from_daily <- function(df) {
  df |>
    mutate(week = yearweek(day)) |>
    group_by(week) |>
    summarise(close = last(close), volume = sum(volume, na.rm = TRUE), day = max(day), .groups = "drop") |>
    as_tsibble(index = week) |>
    fill_gaps() |>
    tidyr::fill(close, volume, day, .direction = "down")
}

m2_asset <- function(con, asset) {
  df <- load_daily(con, asset, min_rows = 400)
  sym <- split_asset(asset)$symbol
  w <- weekly_from_daily(df)
  if (nrow(w) < 110) stop(sprintf("only %d weeks of %s: STL with yearly seasonality needs 2+ years", nrow(w), sym))

  lambda <- (w |> features(close, features = guerrero))$lambda_guerrero
  stl_p <- w |> model(STL(log(close) ~ trend(window = 13) + season(period = 52), robust = TRUE)) |> components()
  has_vol <- any(w$volume > 0)
  stl_v <- if (has_vol) w |> model(STL(log1p(volume) ~ trend(window = 13) + season(period = 52), robust = TRUE)) |> components() else NULL

  # Rolling Guerrero lambda on 104-week (2-year) windows: how the right transform drifts with volatility regimes
  ends <- seq(104, nrow(w), by = 4)
  roll_lambda <- vapply(ends, function(e) {
    sub <- w[(e - 103):e, ]
    tryCatch((sub |> features(close, features = guerrero))$lambda_guerrero, error = function(err) NA_real_)
  }, 0)

  # Structural breaks in the log-price trend (Bai-Perron, BIC choice)
  yl <- log(w$close)
  tt <- seq_along(yl)
  bp <- breakpoints(yl ~ tt, h = 0.1)
  nb <- length(bp$breakpoints[!is.na(bp$breakpoints)])
  knots <- if (nb > 0) w$week[bp$breakpoints] else NULL
  fit_pw <- if (nb > 0) {
    w |> model(TSLM(log(close) ~ trend(knots = knots)))
  } else {
    w |> model(TSLM(log(close) ~ trend()))
  }
  pw <- fitted(fit_pw)$.fitted
  seg_slopes <- {
    b <- c(1, if (nb) bp$breakpoints + 1, length(yl) + 1)
    data.frame(
      dal = as.character(w$day[b[-length(b)]]),
      al = as.character(w$day[pmin(b[-1] - 1, length(yl))]),
      pendenza_settimanale = vapply(seq_len(length(b) - 1), function(i) {
        s <- b[i]:(b[i + 1] - 1); if (length(s) > 2) unname(coef(lm(yl[s] ~ s))[2]) else NA_real_
      }, 0)
    ) |> mutate(rendimento_annuo_trend = exp(52 * pendenza_settimanale) - 1)
  }

  close <- df$close
  ch7 <- tail(close, 1) / close[length(close) - 7] - 1
  ch30 <- tail(close, 1) / close[length(close) - 30] - 1
  # Trend direction: change of the STL trend-cycle over the last 4 weeks (not one week times 4).
  # Below a flat band the verdict is TREND_FLAT; the end of an STL trend is the least reliable part.
  trend_slope_4w <- exp(tail(stl_p$trend, 1) - stl_p$trend[nrow(stl_p) - 4]) - 1
  flat_band <- as.numeric(Sys.getenv("M2_FLAT_BAND", "0.02"))
  trend_verdict <- if (trend_slope_4w > flat_band) "TREND_UP" else if (trend_slope_4w < -flat_band) "TREND_DOWN" else "TREND_FLAT"
  weeks <- as.character(w$day)

  charts <- list(
    ui_chart(sprintf("%s settimanale: log prezzo, trend-ciclo STL e trend a tratti (%d rotture)", sym, nb),
             weeks, list(ui_line("log close", stl_p$`log(close)`), ui_line("trend-ciclo STL", stl_p$trend),
                         ui_line("trend a tratti", pw))),
    ui_chart("Lambda di Guerrero su finestre di 2 anni", as.character(w$day[ends]),
             list(ui_line("lambda", roll_lambda), ui_line("0 = log", rep(0, length(ends)))))
  )
  if (has_vol) {
    charts[[length(charts) + 1]] <- ui_chart("Volumi settimanali: log volume e trend-ciclo STL", weeks,
      list(ui_line("log volume", stl_v$`log1p(volume)`), ui_line("trend-ciclo", stl_v$trend)))
  }

  module_result(
    headline = sprintf("%s: %d rotture strutturali nel trend; lambda di Guerrero %.2f (%s); trend-ciclo a 4 settimane %s, prezzo 7g %s e 30g %s.",
                       sym, nb, lambda, if (abs(lambda) < 0.5) "vicino al log, che resta adeguato" else "lontano dal log: la varianza non cresce col livello come assume il log",
                       fmt_pct(trend_slope_4w), fmt_pct(ch7), fmt_pct(ch30)),
    verdict = trend_verdict,
    summary = list(
      ui_item("Variazione 7g", fmt_pct(ch7), NULL, if (ch7 >= 0) "good" else "bad"),
      ui_item("Variazione 30g", fmt_pct(ch30), NULL, if (ch30 >= 0) "good" else "bad"),
      ui_item("Trend-ciclo 4 settimane", fmt_pct(trend_slope_4w), sprintf("variazione del trend STL; piatto entro ±%s", fmt_pct(flat_band, 0))),
      ui_item("Lambda Guerrero", fmt_num(lambda, 2), "Box-Cox ottimale sull'intera storia"),
      ui_item("Lambda ultimi 2 anni", fmt_num(tail(roll_lambda, 1), 2)),
      ui_item("Rotture strutturali", as.character(nb), if (nb) paste(as.character(w$day[bp$breakpoints]), collapse = ", ") else "nessuna")
    ),
    charts = charts,
    tables = list(ui_table("Segmenti del trend a tratti", seg_slopes)),
    notes = list(
      "Rotture strutturali: test di Bai-Perron sul trend lineare del log prezzo settimanale, numero di rotture scelto col BIC (segmento minimo 10% del campione).",
      "Attenzione: Bai-Perron presuppone errori stazionari attorno al trend, ma il log prezzo ha radice unitaria (M1). Le date di rottura sono indicazioni, non prove.",
      "Il verdetto di trend usa la variazione del trend STL nelle ultime 4 settimane, con una fascia 'piatto'. La fine del trend STL è la parte meno affidabile.",
      "Stagionalità a 52 settimane sulle crypto: se la forza stagionale è bassa va ignorata.",
      "Il trend a tratti è un TSLM con nodi (spline lineare) nelle date di rottura.",
      "Lambda di Guerrero vicino a 0 = il log è la trasformazione giusta; se cambia nel tempo, cambia il regime di volatilità."
    )
  )
}

run_m2 <- function(con) {
  for (s in M2_MACRO) run_subject(con, "M2_decomp", s, list(series = s), function() m2_macro(con, s))
  for (a in ASSETS) run_subject(con, "M2_decomp", split_asset(a)$symbol, list(asset = a), function() m2_asset(con, a))
}
