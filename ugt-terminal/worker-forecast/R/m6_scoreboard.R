# ─────────────────────────────────────────────────────────────
# M6 · Scoreboard
# Live out-of-sample check of every forecast saved in forecast_log (M0 and M3
# write there every day): errors, interval coverage, Winkler and quantile
# scores, direction hit rate, Ljung-Box on the 1-day errors. Course items:
# S4 (Quantile score, Winkler score, backtesting) and B3 (Ljung-Box on model
# residuals). Also the material for the report to the professor.
# ─────────────────────────────────────────────────────────────

winkler <- function(lo, hi, y, level) {
  a <- 1 - level
  (hi - lo) + (2 / a) * pmax(lo - y, 0) + (2 / a) * pmax(y - hi, 0)
}
pinball <- function(q, y, p) ifelse(y >= q, p * (y - q), (1 - p) * (q - y))

load_scored <- function(con) {
  DBI::dbGetQuery(con, "
      WITH px AS (SELECT DISTINCT ON (symbol, day) symbol, day, close FROM market_daily ORDER BY symbol, day, source)
      SELECT f.model, f.symbol, f.issued_on, f.horizon, f.target_date, f.point, f.lo80, f.hi80, f.lo95, f.hi95,
             a.close AS actual, i.close AS at_issue
      FROM forecast_log f
      JOIN px a ON a.symbol = f.symbol AND a.day = f.target_date
      JOIN px i ON i.symbol = f.symbol AND i.day = f.issued_on")
}

score_table <- function(d) {
  d |>
    mutate(err = actual - point,
           # Direction is undefined for NAIVE: its point is the last price (plus only the small log
           # back-transform bias, which would always read as "up"). Left out instead of counted.
           hit = ifelse(grepl("(^|_)naive$", model) | abs(point / at_issue - 1) < 1e-6, NA,
                        sign(point - at_issue) == sign(actual - at_issue)),
           in80 = actual >= lo80 & actual <= hi80, in95 = actual >= lo95 & actual <= hi95,
           w80 = winkler(lo80, hi80, actual, 0.8), w95 = winkler(lo95, hi95, actual, 0.95),
           qs = (pinball(lo80, actual, 0.1) + pinball(hi80, actual, 0.9)) / 2) |>
    group_by(model) |>
    summarise(n = n(), MAE = mean(abs(err)), RMSE = sqrt(mean(err^2)), MAPE = 100 * mean(abs(err / actual)),
              direzione = if (all(is.na(hit))) NA_real_ else mean(hit, na.rm = TRUE), coverage80 = mean(in80), coverage95 = mean(in95),
              winkler80 = mean(w80), winkler95 = mean(w95), quantile_score = mean(qs), .groups = "drop") |>
    arrange(MAE)
}

m6_symbol <- function(con, d, symbol) {
  d <- d |> filter(symbol == !!symbol)
  if (nrow(d) == 0) {
    return(module_result(
      headline = sprintf("%s: nessuna previsione ancora verificabile. Una previsione si valuta quando la sua data obiettivo ha un prezzo di chiusura vero.", symbol),
      verdict = "WAITING"))
  }
  d$issued_on <- as.Date(d$issued_on); d$target_date <- as.Date(d$target_date)
  all_h <- score_table(d)
  h1 <- score_table(d |> filter(horizon == 1))
  h7 <- score_table(d |> filter(horizon == 7))
  best <- all_h$model[1]

  # Ljung-Box on 1-day-ahead errors of each model (are the errors white noise?)
  lb <- d |> filter(horizon == 1) |> arrange(target_date) |> group_by(model) |>
    summarise(n = n(), ljung_box_p = if (n() > 12) Box.test(actual - point, lag = min(10, n() %/% 3), type = "Ljung-Box")$p.value else NA_real_,
              errore_medio = mean(actual - point), .groups = "drop")

  # Running MAE of the 1-day forecasts, per model
  run <- d |> filter(horizon == 1) |> arrange(target_date) |> group_by(model) |>
    mutate(mae_cum = cumsum(abs(actual - point)) / row_number()) |> ungroup()
  dates <- sort(unique(as.character(run$target_date)))
  models <- unique(run$model)
  series <- lapply(head(models[order(match(models, all_h$model))], 6), function(m) {
    rm <- run[run$model == m, ]
    ui_line(m, rm$mae_cum[match(dates, as.character(rm$target_date))])
  })
  cov_best <- all_h$coverage80[1]

  module_result(
    headline = sprintf("%s: %d previsioni verificate. Il più preciso finora è %s (MAE %s); copertura reale dell'intervallo 80%% %s, del 95%% %s.",
                       symbol, nrow(d), best, fmt_num(all_h$MAE[1]), fmt_pct(cov_best), fmt_pct(all_h$coverage95[1])),
    verdict = toupper(best),
    summary = list(
      ui_item("Previsioni verificate", as.character(nrow(d)), sprintf("dal %s al %s", min(d$issued_on), max(d$target_date))),
      ui_item("Modello più preciso", best),
      ui_item("MAE", fmt_num(all_h$MAE[1])),
      ui_item("Copertura 80%", fmt_pct(cov_best), "dovrebbe stare vicino all'80%", if (abs(cov_best - 0.8) <= 0.1) "good" else "warn"),
      ui_item("Copertura 95%", fmt_pct(all_h$coverage95[1]), "dovrebbe stare vicino al 95%", if (abs(all_h$coverage95[1] - 0.95) <= 0.05) "good" else "warn"),
      ui_item("Direzione giusta", fmt_pct(all_h$direzione[1]), "quota di volte in cui il segno della variazione è corretto")
    ),
    charts = if (length(dates) > 1) list(ui_chart("MAE cumulato delle previsioni a 1 giorno", dates, series)) else list(),
    tables = list(
      ui_table("Tutti gli orizzonti (1-7 giorni)", all_h),
      ui_table("Orizzonte 1 giorno", h1),
      ui_table("Orizzonte 7 giorni", h7),
      ui_table("Residui a 1 giorno: Ljung-Box (H0 white noise)", lb)
    ),
    notes = list(
      "Previsioni vere, salvate prima di conoscere il risultato: è il test fuori campione più onesto possibile.",
      "Winkler: ampiezza dell'intervallo più una penalità quando il prezzo esce. Quantile score: pinball ai quantili 10% e 90% (i bordi dell'80%).",
      "Ljung-Box sugli errori a 1 giorno: p < 0.05 vuol dire che gli errori hanno una struttura che il modello non ha catturato.",
      "Modelli con prefisso m3_ vengono dal Risk Engine, gli altri dal modulo M0.",
      "Direzione: vuota per i modelli la cui previsione non si muove (NAIVE), per cui la direzione non è definita.",
      "Le tabelle sono ordinate per MAE; M3 sceglie il vincitore per CRPS. Il Winkler 80% è il criterio più vicino a quello di M3.",
      "Previsioni emesse ogni giorno a 1-7 giorni si sovrappongono: gli errori sono correlati e le conclusioni vanno tratte dopo qualche mese, non dopo poche settimane."
    )
  )
}

m6_summary <- function(con, d) {
  if (nrow(d) == 0) stop("no scored forecast yet: the first ones are scored the day after the engine starts")
  tab <- d |> group_by(symbol) |> group_modify(~ score_table(.x) |> head(3)) |> ungroup()
  pending <- DBI::dbGetQuery(con, "SELECT count(*)::int AS n, min(target_date) AS next FROM forecast_log WHERE target_date > (SELECT max(day) FROM market_daily)")
  module_result(
    headline = sprintf("%d previsioni verificate su %d simboli; %d in attesa del prezzo reale.", nrow(d), length(unique(d$symbol)), pending$n),
    verdict = "SCOREBOARD",
    summary = list(ui_item("Verificate", as.character(nrow(d))), ui_item("In attesa", as.character(pending$n)),
                   ui_item("Modelli", as.character(length(unique(d$model))))),
    tables = list(ui_table("Podio per simbolo (MAE su tutti gli orizzonti)", tab)),
    notes = list("Questa tabella è la base del report per il Professore: per ogni modulo domanda, modello, risultato e limiti.")
  )
}

run_m6 <- function(con) {
  d <- load_scored(con)
  run_subject(con, "M6_scoreboard", "RIEPILOGO", list(), function() m6_summary(con, d))
  syms <- unique(DBI::dbGetQuery(con, "SELECT DISTINCT symbol FROM forecast_log ORDER BY 1")$symbol)
  for (s in syms) run_subject(con, "M6_scoreboard", s, list(symbol = s), function() m6_symbol(con, d, s))
}
