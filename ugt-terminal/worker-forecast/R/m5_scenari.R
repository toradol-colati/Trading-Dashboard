# ─────────────────────────────────────────────────────────────
# M5 · Scenari, eventi e regimi
# Course items: B2 (scenario analysis with an explanatory TSLM: shocks to rates
# or prices; log-log elasticities), S1 (TSLM / ARIMAX with sentiment as the
# exogenous variable; event study with impulse and step dummies for FED
# decisions and absorption speed; intra-day and intra-week seasonality with
# Fourier terms). Notion extra: hidden Markov models (regimes).
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages(library(depmixS4))

M5_MAIN <- Sys.getenv("M5_MAIN_ASSET", "binance:BTCUSDT")
M5_EVENT_ASSETS <- trimws(strsplit(Sys.getenv("M5_EVENT_ASSETS", "binance:BTCUSDT,stooq:SPX"), ",")[[1]])
M5_HMM_ASSETS <- trimws(strsplit(Sys.getenv("M5_HMM_ASSETS", "binance:BTCUSDT,binance:ETHUSDT,stooq:SPX"), ",")[[1]])

tidy_coefs <- function(fit) {
  t <- tidy(fit)
  t <- t[, intersect(c("term", "estimate", "std.error", "statistic", "p.value"), names(t))]
  as.data.frame(t)
}

# ── 1. Sentiment as exogenous variable (TSLM and ARIMAX) ─────
m5_sentiment <- function(con) {
  px <- load_daily(con, M5_MAIN, days = 1500)
  fng <- load_macro(con, "FNG", source = "alternative_me", min_rows = 200)
  d <- px |>
    transmute(day, r = c(NA, diff(log(close)))) |>
    inner_join(fng |> rename(day = date, fng = value), by = "day") |>
    arrange(day) |>
    mutate(dfng = c(NA, diff(fng)), dfng_lag = lag(dfng), fng_lag = lag(fng))

  news <- DBI::dbGetQuery(con, "
      SELECT (hour AT TIME ZONE 'UTC')::date AS day, sum(mean_compound * article_count) / sum(article_count) AS news
      FROM sentiment_hourly WHERE ticker = $1 GROUP BY 1", params = list(sub("USDT|EUR", "", split_asset(M5_MAIN)$symbol)))
  use_news <- nrow(news) >= 60
  if (use_news) d <- d |> left_join(news |> mutate(day = as.Date(day)), by = "day") |> mutate(news_lag = lag(news))

  d <- d |> filter(!is.na(r), !is.na(dfng_lag))
  if (use_news) d <- d |> filter(!is.na(news_lag))
  y <- d |> mutate(t = row_number()) |> as_tsibble(index = t)

  f_contemp <- if (use_news) TSLM(r ~ dfng + news) else TSLM(r ~ dfng)
  f_lead <- if (use_news) TSLM(r ~ dfng_lag + fng_lag + news_lag) else TSLM(r ~ dfng_lag + fng_lag)
  f_arimax <- if (use_news) ARIMA(r ~ dfng_lag + fng_lag + news_lag + pdq(0:2, 0, 0:2) + PDQ(0, 0, 0)) else ARIMA(r ~ dfng_lag + fng_lag + pdq(0:2, 0, 0:2) + PDQ(0, 0, 0))
  fits <- y |> model(contemporaneo = f_contemp, predittivo = f_lead, arimax = f_arimax, benchmark = ARIMA(r ~ pdq(0:2, 0, 0:2) + PDQ(0, 0, 0)))
  gl <- glance(fits) |> dplyr::select(any_of(c(".model", "r_squared", "adj_r_squared", "AICc", "BIC", "sigma2")))

  co_c <- tidy_coefs(fits |> dplyr::select(contemporaneo)); co_c$modello <- "contemporaneo"
  co_l <- tidy_coefs(fits |> dplyr::select(predittivo)); co_l$modello <- "predittivo"
  co_a <- tidy_coefs(fits |> dplyr::select(arimax)); co_a$modello <- "arimax"
  coefs <- rbind(co_c, co_l, co_a)[, c("modello", "term", "estimate", "std.error", "p.value")]

  # Scenarios for the next 7 days: Fear & Greed path
  last_fng <- tail(d$fng, 1)
  scen <- list(paura = -3, neutrale = 0, euforia = 3)  # points per day
  scen_rows <- lapply(names(scen), function(nm) {
    path <- pmin(100, pmax(0, last_fng + scen[[nm]] * (1:7)))
    nd <- tibble::tibble(t = max(y$t) + 1:7, fng = path, dfng = c(path[1] - last_fng, diff(path)))
    nd$dfng_lag <- c(tail(d$dfng, 1), head(nd$dfng, -1))
    nd$fng_lag <- c(last_fng, head(path, -1))
    if (use_news) { nd$news_lag <- tail(d$news, 1); nd$news <- tail(d$news, 1) }
    nd <- as_tsibble(nd, index = t)
    fc <- fits |> dplyr::select(arimax) |> forecast(new_data = nd)
    data.frame(scenario = nm, fng_finale = tail(path, 1),
               rendimento_7g = exp(sum(fc$.mean)) - 1)
  })
  scen_tab <- do.call(rbind, scen_rows)

  pv <- co_l$p.value[co_l$term == "dfng_lag"]
  module_result(
    headline = sprintf("Il Fear & Greed %s i rendimenti dello stesso giorno (R² %.2f); come predittore del giorno dopo %s (p = %s). Scenario a 7 giorni con l'ARIMAX: paura %s, neutrale %s, euforia %s.",
                       if (co_c$p.value[co_c$term == "dfng"] < 0.05) "spiega" else "non spiega",
                       gl$r_squared[gl$.model == "contemporaneo"],
                       if (length(pv) && pv < 0.05) "aggiunge informazione" else "non aggiunge informazione significativa", fmt_p(pv),
                       fmt_pct(scen_tab$rendimento_7g[1]), fmt_pct(scen_tab$rendimento_7g[2]), fmt_pct(scen_tab$rendimento_7g[3])),
    verdict = if (length(pv) && pv < 0.05) "SENTIMENT_LEADS" else "SENTIMENT_LAGS",
    summary = list(
      ui_item("Fear & Greed oggi", fmt_num(last_fng, 0), as.character(tail(d$day, 1))),
      ui_item("R² contemporaneo", fmt_num(gl$r_squared[gl$.model == "contemporaneo"], 3)),
      ui_item("R² predittivo", fmt_num(gl$r_squared[gl$.model == "predittivo"], 3), "solo variabili di ieri"),
      ui_item("AICc ARIMAX vs benchmark", paste(fmt_num(gl$AICc[gl$.model == "arimax"], 0), "/", fmt_num(gl$AICc[gl$.model == "benchmark"], 0)),
              "più basso è meglio", if (gl$AICc[gl$.model == "arimax"] < gl$AICc[gl$.model == "benchmark"]) "good" else "warn"),
      ui_item("Sentiment news", if (use_news) "incluso" else "non ancora", if (use_news) "media giornaliera da sentiment_hourly" else "servono 60 giorni di news valutate", if (use_news) "good" else "warn")
    ),
    charts = list(ui_chart("Fear & Greed e rendimento cumulato", as.character(d$day), list(
      ui_line("Fear & Greed / 100", d$fng / 100), ui_line("rendimento cumulato", cumsum(d$r))))),
    tables = list(ui_table("Coefficienti", coefs), ui_table("Confronto modelli", gl), ui_table("Scenari Fear & Greed a 7 giorni (ARIMAX)", scen_tab)),
    notes = list(
      "Contemporaneo: rendimento di oggi spiegato dalla variazione di oggi del sentiment (descrive, non prevede).",
      "Predittivo e ARIMAX: solo valori di ieri, quindi utilizzabili per prevedere. L'ARIMAX aggiunge errori ARMA.",
      "Finché lo storico del sentiment delle nostre news è corto si usa il Crypto Fear & Greed index; il sentiment NLP entra da solo appena ci sono 60 giorni."
    )
  )
}

# ── 2. Macro scenarios (TSLM) and log-log elasticities ───────
m5_macro <- function(con) {
  px <- load_daily(con, M5_MAIN, min_rows = 400)
  btc <- px |> mutate(month = yearmonth(day)) |> group_by(month) |> summarise(btc = last(close), .groups = "drop")
  series <- c(FEDFUNDS = "FEDFUNDS", DGS10 = "DGS10", DXY = "DTWEXBGS", M2 = "M2SL")
  m <- btc
  for (nm in names(series)) {
    s <- macro_monthly(load_macro(con, series[[nm]], min_rows = 24)) |> as_tibble()
    names(s)[2] <- nm
    m <- inner_join(m, s, by = "month")
  }
  m <- m |> arrange(month) |>
    mutate(r = c(NA, diff(log(btc))), d_ff = c(NA, diff(FEDFUNDS)), d_10y = c(NA, diff(DGS10)),
           d_dxy = c(NA, diff(log(DXY))), d_m2 = c(NA, diff(log(M2))))
  md <- m |> filter(!is.na(r)) |> as_tsibble(index = month)
  if (nrow(md) < 36) stop(sprintf("only %d common months: need 36", nrow(md)))

  fit <- md |> model(scenari = TSLM(r ~ d_ff + d_10y + d_dxy + d_m2))
  co <- tidy_coefs(fit)
  r2 <- glance(fit)$adj_r_squared

  scen <- list(
    rialzista = c(d_ff = -0.25, d_10y = -0.20, d_dxy = -0.01, d_m2 = 0.010),
    neutrale = c(d_ff = 0, d_10y = 0, d_dxy = 0, d_m2 = 0.004),
    ribassista = c(d_ff = 0.25, d_10y = 0.20, d_dxy = 0.01, d_m2 = -0.005)
  )
  fut <- yearmonth(max(md$month)) + 1:3
  scen_fc <- lapply(names(scen), function(nm) {
    s <- scen[[nm]]
    nd <- tsibble::tsibble(month = fut, d_ff = s[["d_ff"]], d_10y = s[["d_10y"]], d_dxy = s[["d_dxy"]], d_m2 = s[["d_m2"]], index = month)
    fc <- fit |> forecast(new_data = nd) |> hilo(level = 80) |> unpack_hilo(`80%`)
    data.frame(scenario = nm, rendimento_3m = exp(sum(fc$.mean)) - 1,
               mese1_basso80 = exp(fc$`80%_lower`[1]) - 1, mese1_alto80 = exp(fc$`80%_upper`[1]) - 1)
  })
  scen_tab <- do.call(rbind, scen_fc)

  # Log-log elasticities: levels (long run, check residual stationarity) and differences (short run)
  lv <- lm(log(btc) ~ log(M2) + log(DXY) + DGS10, data = m)
  lv_co <- as.data.frame(summary(lv)$coefficients); lv_co$term <- rownames(lv_co)
  res_adf <- suppressWarnings(tseries::adf.test(residuals(lv))$p.value)
  df_ <- lm(r ~ d_m2 + d_dxy + d_10y, data = m)
  df_co <- as.data.frame(summary(df_)$coefficients); df_co$term <- rownames(df_co)
  el <- data.frame(
    variabile = c("M2", "dollaro (DXY)", "Treasury 10Y (punti)"),
    elasticita_livelli = lv_co$Estimate[match(c("log(M2)", "log(DXY)", "DGS10"), lv_co$term)],
    p_livelli = lv_co$`Pr(>|t|)`[match(c("log(M2)", "log(DXY)", "DGS10"), lv_co$term)],
    elasticita_differenze = df_co$Estimate[match(c("d_m2", "d_dxy", "d_10y"), df_co$term)],
    p_differenze = df_co$`Pr(>|t|)`[match(c("d_m2", "d_dxy", "d_10y"), df_co$term)]
  )

  module_result(
    headline = sprintf("Scenari macro a 3 mesi per %s: rialzista %s, neutrale %s, ribassista %s (R² corretto %.2f). Elasticità di lungo periodo a M2 %.2f e al dollaro %.2f; residui %s.",
                       split_asset(M5_MAIN)$symbol, fmt_pct(scen_tab$rendimento_3m[1]), fmt_pct(scen_tab$rendimento_3m[2]), fmt_pct(scen_tab$rendimento_3m[3]), r2,
                       el$elasticita_livelli[1], el$elasticita_livelli[2],
                       if (res_adf < 0.05) "stazionari (relazione credibile)" else "non stazionari: possibile regressione spuria, fidarsi delle differenze"),
    verdict = "SCENARIOS",
    summary = list(
      ui_item("Rialzista 3m", fmt_pct(scen_tab$rendimento_3m[1]), "tassi −25 pb/mese, dollaro −1%, M2 +1%", "good"),
      ui_item("Neutrale 3m", fmt_pct(scen_tab$rendimento_3m[2])),
      ui_item("Ribassista 3m", fmt_pct(scen_tab$rendimento_3m[3]), "tassi +25 pb/mese, dollaro +1%, M2 −0.5%", "bad"),
      ui_item("R² corretto", fmt_num(r2, 3), "TSLM mensile"),
      ui_item("Elasticità a M2", fmt_num(el$elasticita_livelli[1], 2), "1% di M2 in più → x% di prezzo"),
      ui_item("ADF residui livelli", fmt_p(res_adf), "p < 0.05 = cointegrazione plausibile", if (res_adf < 0.05) "good" else "warn")
    ),
    charts = list(ui_chart("Log prezzo vs log M2 (standardizzati)", as.character(m$month), list(
      ui_line("log prezzo", as.numeric(scale(log(m$btc)))), ui_line("log M2", as.numeric(scale(log(m$M2)))), ui_line("log dollaro", as.numeric(scale(log(m$DXY))))))),
    tables = list(ui_table("TSLM mensile: rendimento ~ Δ tassi, Δ 10Y, Δ log dollaro, Δ log M2", co),
                  ui_table("Scenari a 3 mesi", scen_tab), ui_table("Elasticità log-log", el)),
    notes = list(
      "Scenari: si fissano i percorsi delle variabili macro per 3 mesi e il TSLM restituisce il rendimento atteso con intervallo all'80%.",
      "Elasticità nei livelli: log prezzo su log M2, log dollaro e livello del 10Y. È di lungo periodo ma vale solo se i residui sono stazionari.",
      "Elasticità nelle differenze: variazioni mensili, più robuste ma di breve periodo."
    )
  )
}

# ── 3. Event study on FED rate decisions ──────────────────────
fed_events <- function(con) {
  tgt <- load_macro(con, "DFEDTARU", min_rows = 100)
  ch <- c(0, diff(tgt$value))
  data.frame(day = tgt$date[ch != 0], change = ch[ch != 0])
}

m5_events <- function(con, asset) {
  sym <- split_asset(asset)$symbol
  px <- load_daily(con, asset, min_rows = 300)
  r <- diff(log(px$close)); days <- px$day[-1]
  ev <- fed_events(con)
  ev <- ev[ev$day > days[130] & ev$day < days[length(days) - 10], ]
  if (nrow(ev) < 3) stop(sprintf("only %d FED rate changes inside the price history", nrow(ev)))
  win <- -5:10
  ar <- t(vapply(seq_len(nrow(ev)), function(i) {
    e <- which(days >= ev$day[i])[1]
    est <- r[(e - 120):(e - 11)]
    r[e + win] - mean(est)
  }, numeric(length(win))))
  sd_est <- sd(r)
  grp <- ifelse(ev$change > 0, "rialzo", "taglio")
  caar <- function(rows) cumsum(colMeans(ar[rows, , drop = FALSE]))
  aar_all <- colMeans(ar); tstat <- aar_all / (sd_est / sqrt(nrow(ar)))
  car_all <- cumsum(aar_all)
  post <- car_all[win >= 0]
  final <- tail(post, 1)
  absorb <- which(abs(post - final) <= 0.1 * abs(final))[1] - 1

  # Dummy regression: impulse on the event day, step after it (full sample, ARIMA errors)
  dd <- tibble::tibble(t = seq_along(r), r = r, day = days) |>
    mutate(imp_hike = as.integer(day %in% ev$day[ev$change > 0]),
           imp_cut = as.integer(day %in% ev$day[ev$change < 0]),
           step_tight = cumsum(imp_hike) - cumsum(imp_cut)) |>
    as_tsibble(index = t)
  fitd <- dd |> model(ARIMA(r ~ imp_hike + imp_cut + step_tight + pdq(0:1, 0, 0:1) + PDQ(0, 0, 0)))
  cod <- tidy_coefs(fitd)

  tab <- data.frame(giorno = win, AAR = aar_all, t_stat = tstat, CAAR = car_all,
                    CAAR_rialzi = if (any(grp == "rialzo")) caar(grp == "rialzo") else NA,
                    CAAR_tagli = if (any(grp == "taglio")) caar(grp == "taglio") else NA)

  module_result(
    headline = sprintf("%s intorno alle %d decisioni FED con cambio dei tassi: rendimento anomalo cumulato a +10 giorni %s (rialzi %s, tagli %s); l'effetto si assorbe in circa %s giorni.",
                       sym, nrow(ev), fmt_pct(final),
                       if (any(grp == "rialzo")) fmt_pct(tail(caar(grp == "rialzo"), 1)) else "—",
                       if (any(grp == "taglio")) fmt_pct(tail(caar(grp == "taglio"), 1)) else "—",
                       if (is.na(absorb)) "—" else absorb),
    verdict = "EVENT_STUDY",
    summary = list(
      ui_item("Eventi", as.character(nrow(ev)), sprintf("%d rialzi, %d tagli", sum(grp == "rialzo"), sum(grp == "taglio"))),
      ui_item("AAR giorno 0", fmt_pct(aar_all[win == 0], 2), paste("t =", fmt_num(tstat[win == 0], 2)), if (abs(tstat[win == 0]) > 1.96) "warn" else NULL),
      ui_item("CAAR +10", fmt_pct(final)),
      ui_item("Giorni di assorbimento", if (is.na(absorb)) "—" else as.character(absorb), "CAAR entro il 10% del valore finale"),
      ui_item("Ultimo evento", paste(as.character(tail(ev$day, 1)), sprintf("%+.2f", tail(ev$change, 1))))
    ),
    charts = list(ui_chart("Rendimento anomalo cumulato medio (giorni dall'evento)", as.character(win), list(
      ui_line("tutti", car_all),
      ui_line("rialzi", if (any(grp == "rialzo")) caar(grp == "rialzo") else rep(NA, length(win))),
      ui_line("tagli", if (any(grp == "taglio")) caar(grp == "taglio") else rep(NA, length(win))),
      ui_bar("AAR", aar_all)))),
    tables = list(ui_table("Event study", tab), ui_table("Regressione con dummy (errori ARMA)", cod),
                  ui_table("Eventi usati", data.frame(giorno = as.character(ev$day), variazione_tasso = ev$change))),
    notes = list(
      "Eventi: i giorni in cui il limite superiore del tasso FED (FRED DFEDTARU) cambia.",
      "Rendimento anomalo = rendimento meno la media della finestra di stima [−120, −11] giorni.",
      "Dummy a impulso (giorno della decisione) e a gradino (somma cumulata di rialzi meno tagli, cioè il regime dei tassi).",
      "Le date di CPI ed earnings non sono ancora nel database: si aggiungono come eventi appena c'è una fonte gratuita affidabile."
    )
  )
}

# ── 4. Seasonality: intra-day (hourly Fourier) and intra-week ─
m5_intraday <- function(con, symbol) {
  h <- load_hourly_bars(con, symbol)
  if (nrow(h) < 24 * 14) stop(sprintf("only %d hours of %s bars: Fourier on hourly data needs at least 14 days of recorded prices", nrow(h), symbol))
  h$hour <- as.POSIXct(h$hour, tz = "UTC")
  y <- h |> mutate(r = c(NA, diff(log(close)))) |> filter(!is.na(r)) |>
    as_tsibble(index = hour) |> fill_gaps(r = 0) |> mutate(absr = abs(r))
  fits_r <- y |> model(
    fourier = TSLM(r ~ fourier(period = 24, K = 3) + fourier(period = 168, K = 2)),
    nessuna = TSLM(r ~ 1)
  )
  fits_v <- y |> model(vol_fourier = TSLM(absr ~ fourier(period = 24, K = 3) + fourier(period = 168, K = 2)))
  gl <- bind_rows(glance(fits_r), glance(fits_v)) |> dplyr::select(any_of(c(".model", "r_squared", "adj_r_squared", "AICc", "p_value")))
  prof <- as_tibble(y) |> mutate(ora = as.integer(format(hour, "%H"))) |> group_by(ora) |>
    summarise(rendimento_medio = mean(r), volatilita_media = mean(abs(r)), n = n(), .groups = "drop")
  fv <- fitted(fits_v)
  vol_prof <- as_tibble(fv) |> mutate(ora = as.integer(format(hour, "%H"))) |> group_by(ora) |> summarise(fourier = mean(.fitted), .groups = "drop")
  best_h <- prof$ora[which.max(prof$volatilita_media)]
  pv <- gl$p_value[gl$.model == "vol_fourier"]

  module_result(
    headline = sprintf("%s su %d ore: la stagionalità oraria della volatilità %s (p = %s); ora più agitata %02d:00 UTC.",
                       symbol, nrow(y), if (length(pv) && !is.na(pv) && pv < 0.05) "è significativa" else "non è significativa", fmt_p(pv), best_h),
    verdict = "INTRADAY",
    summary = list(
      ui_item("Ore di dati", as.character(nrow(y))),
      ui_item("Ora più volatile (UTC)", sprintf("%02d:00", best_h)),
      ui_item("R² volatilità (Fourier)", fmt_num(gl$r_squared[gl$.model == "vol_fourier"], 3)),
      ui_item("R² rendimenti (Fourier)", fmt_num(gl$r_squared[gl$.model == "fourier"], 4), "di solito vicino a zero: i rendimenti medi sono quasi imprevedibili")
    ),
    charts = list(ui_chart("Profilo orario (UTC)", sprintf("%02d", prof$ora), list(
      ui_bar("|rendimento| medio", prof$volatilita_media), ui_line("Fourier", vol_prof$fourier), ui_line("rendimento medio", prof$rendimento_medio)))),
    tables = list(ui_table("Modelli", gl), ui_table("Profilo orario", prof)),
    notes = list("Termini di Fourier con periodo 24 ore (K = 3) e 168 ore, cioè una settimana (K = 2), stimati con TSLM sui rendimenti orari e sul loro valore assoluto.")
  )
}

m5_weekday <- function(con, asset) {
  sym <- split_asset(asset)$symbol
  px <- load_daily(con, asset, days = 1500)
  d <- px |> transmute(day, r = c(NA, diff(log(close)))) |> filter(!is.na(r)) |>
    mutate(giorno = factor(c("lun", "mar", "mer", "gio", "ven", "sab", "dom")[as.integer(format(day, "%u"))]))
  y <- d |> as_tsibble(index = day) |> fill_gaps(r = 0) |> mutate(absr = abs(r))
  fits_r <- y |> model(fourier = TSLM(r ~ fourier(period = 7, K = 3)), nessuna = TSLM(r ~ 1))
  fits_v <- y |> model(vol = TSLM(absr ~ fourier(period = 7, K = 3)))
  gl <- bind_rows(glance(fits_r), glance(fits_v)) |> dplyr::select(any_of(c(".model", "r_squared", "AICc", "p_value")))
  prof <- d |> mutate(n_giorno = as.integer(format(day, "%u"))) |> group_by(n_giorno) |>
    summarise(giorno = first(giorno), rendimento_medio = mean(r), volatilita_media = mean(abs(r)), n = n(), .groups = "drop")
  kw <- kruskal.test(r ~ giorno, data = d)$p.value
  module_result(
    headline = sprintf("%s: differenze di rendimento tra giorni della settimana %s (Kruskal-Wallis p = %s); giorno più volatile %s.",
                       sym, if (kw < 0.05) "significative" else "non significative", fmt_p(kw), prof$giorno[which.max(prof$volatilita_media)]),
    verdict = "WEEKDAY",
    summary = list(ui_item("Kruskal-Wallis", fmt_p(kw)), ui_item("Giorno migliore", prof$giorno[which.max(prof$rendimento_medio)]),
                   ui_item("Giorno più volatile", prof$giorno[which.max(prof$volatilita_media)])),
    charts = list(ui_chart("Profilo settimanale", prof$giorno, list(ui_bar("rendimento medio", prof$rendimento_medio), ui_line("|rendimento| medio", prof$volatilita_media)))),
    tables = list(ui_table("Profilo per giorno", prof |> dplyr::select(-n_giorno)), ui_table("Modelli Fourier (periodo 7)", gl)),
    notes = list("Intra-week su dati giornalieri: Fourier con periodo 7 e test non parametrico di Kruskal-Wallis.")
  )
}

# ── 5. Hidden Markov regimes ───────────────────────────────────
fit_hmm <- function(r, k, tries = 4) {
  best <- NULL
  for (s in seq_len(tries)) {
    set.seed(100 + s)
    mod <- depmix(r ~ 1, data = data.frame(r = r), nstates = k, family = gaussian())
    f <- tryCatch(suppressMessages(fit(mod, verbose = FALSE, emcontrol = em.control(maxit = 500))), error = function(e) NULL)
    if (!is.null(f) && (is.null(best) || logLik(f) > logLik(best))) best <- f
  }
  if (is.null(best)) stop(sprintf("HMM with %d states did not converge", k))
  best
}

m5_hmm <- function(con, asset) {
  sym <- split_asset(asset)$symbol
  trading <- split_asset(asset)$source == "stooq"
  px <- load_daily(con, asset, days = 1500, min_rows = 400)
  r <- diff(log(px$close)); days <- px$day[-1]
  fits <- list(`2` = fit_hmm(r, 2), `3` = fit_hmm(r, 3))
  bics <- vapply(fits, BIC, 0)
  k <- as.integer(names(which.min(bics))); f <- fits[[as.character(k)]]
  ann <- if (trading) 252 else 365
  pars <- t(vapply(seq_len(k), function(s) unname(f@response[[s]][[1]]@parameters$coefficients[1]), 0) |> rbind(
    vapply(seq_len(k), function(s) f@response[[s]][[1]]@parameters$sd, 0)))
  ord <- order(pars[, 2])  # states sorted by volatility
  names_k <- if (k == 2) c("calmo", "turbolento") else c("calmo", "normale", "turbolento")
  A <- f@trDens[1, , ]
  post <- posterior(f, type = "smoothing")
  post <- as.matrix(post)[, ord, drop = FALSE]
  A <- A[ord, ord, drop = FALSE]
  pars <- pars[ord, , drop = FALSE]
  cur <- which.max(tail(post, 1))
  dur <- 1 / (1 - diag(A))
  stab <- data.frame(regime = names_k, media_annua = pars[, 1] * ann, volatilita_annua = pars[, 2] * sqrt(ann),
                     durata_attesa_giorni = dur, prob_oggi = as.numeric(tail(post, 1)),
                     quota_tempo = colMeans(post))
  At <- as.data.frame(A); names(At) <- paste0("verso_", names_k); At <- cbind(da = names_k, At)
  series <- lapply(seq_len(k), function(s) ui_line(paste("P", names_k[s]), post[, s]))

  module_result(
    headline = sprintf("%s: %d regimi (scelti col BIC). Oggi regime %s con probabilità %s; volatilità annua del regime %s, durata attesa %.0f giorni.",
                       sym, k, toupper(names_k[cur]), fmt_pct(max(tail(post, 1))), fmt_pct(stab$volatilita_annua[cur]), dur[cur]),
    verdict = toupper(names_k[cur]),
    summary = list(
      ui_item("Regime attuale", names_k[cur], NULL, if (names_k[cur] == "turbolento") "bad" else if (names_k[cur] == "calmo") "good" else NULL),
      ui_item("Probabilità", fmt_pct(max(tail(post, 1)))),
      ui_item("Rendimento annuo del regime", fmt_pct(stab$media_annua[cur])),
      ui_item("Volatilità annua del regime", fmt_pct(stab$volatilita_annua[cur])),
      ui_item("Durata attesa", paste(fmt_num(dur[cur], 0), "giorni")),
      ui_item("BIC 2 vs 3 stati", paste(fmt_num(bics[1], 0), "/", fmt_num(bics[2], 0)))
    ),
    charts = list(
      ui_chart("Probabilità dei regimi (smoothing)", as.character(days), series),
      ui_chart("Log prezzo", as.character(px$day), list(ui_line("log close", log(px$close))))
    ),
    tables = list(ui_table("Regimi", stab), ui_table("Matrice di transizione giornaliera", At)),
    notes = list(
      "HMM gaussiano sui rendimenti giornalieri (depmixS4): ogni regime ha media e volatilità sue e il mercato salta tra regimi con le probabilità della matrice.",
      "Numero di regimi scelto col BIC tra 2 e 3; stime ripetute da 4 punti di partenza diversi.",
      "Le probabilità di smoothing usano tutto il campione; per i segnali in tempo reale conta solo l'ultimo valore."
    )
  )
}

run_m5 <- function(con) {
  run_subject(con, "M5_scenari", "SENTIMENT", list(asset = M5_MAIN), function() m5_sentiment(con))
  run_subject(con, "M5_scenari", "MACRO_SCENARI", list(asset = M5_MAIN), function() m5_macro(con))
  for (a in M5_EVENT_ASSETS) run_subject(con, "M5_scenari", paste("FED", split_asset(a)$symbol), list(asset = a), function() m5_events(con, a))
  run_subject(con, "M5_scenari", "INTRADAY", list(symbol = split_asset(M5_MAIN)$symbol), function() m5_intraday(con, split_asset(M5_MAIN)$symbol))
  run_subject(con, "M5_scenari", "SETTIMANA", list(asset = M5_MAIN), function() m5_weekday(con, M5_MAIN))
  for (a in M5_HMM_ASSETS) run_subject(con, "M5_scenari", paste("HMM", split_asset(a)$symbol), list(asset = a), function() m5_hmm(con, a))
}
