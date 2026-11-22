# ─────────────────────────────────────────────────────────────
# M8 · Rischio estremo ed esecuzione (Notion extras)
#   Copulas: joint tail risk and stress between assets
#   Hawkes processes: self-exciting intensity of news and of large price moves
# The Hawkes likelihood (exponential kernel) is written here, so the formula
# is visible and no extra package is needed.
# ─────────────────────────────────────────────────────────────

suppressPackageStartupMessages(library(copula))

M8_PAIRS <- list(c("binance:BTCUSDT", "binance:ETHUSDT"), c("binance:BTCUSDT", "stooq:SPX"))
M8_Q <- 0.05

# ── Copulas ───────────────────────────────────────────────────
# P(U < q, V < q) by simulation: works for every family, including t with fractional df
joint_crash_prob <- function(cop, q = M8_Q, n = 200000) {
  set.seed(11)
  S <- rCopula(n, cop)
  mean(S[, 1] <= q & S[, 2] <= q)
}

fit_copulas <- function(U) {
  cands <- list(
    gaussiana = normalCopula(dim = 2), t = tCopula(dim = 2),
    clayton = claytonCopula(dim = 2), gumbel = gumbelCopula(dim = 2), frank = frankCopula(dim = 2)
  )
  out <- lapply(names(cands), function(nm) {
    f <- tryCatch(fitCopula(cands[[nm]], U, method = "mpl"), error = function(e) NULL)
    if (is.null(f)) return(NULL)
    k <- length(coef(f))
    lam <- tryCatch(lambda(f@copula), error = function(e) c(lower = NA, upper = NA))
    list(name = nm, fit = f, aic = -2 * f@loglik + 2 * k,
         row = data.frame(copula = nm, parametri = paste(sprintf("%.3f", coef(f)), collapse = ", "),
                          loglik = f@loglik, AIC = -2 * f@loglik + 2 * k,
                          coda_bassa = unname(lam[1]), coda_alta = unname(lam[2]),
                          P_crollo_congiunto = joint_crash_prob(f@copula)))
  })
  Filter(Negate(is.null), out)
}

m8_copula <- function(con, pair) {
  syms <- vapply(pair, function(a) split_asset(a)$symbol, "")
  w <- aligned_returns(con, pair, days = 1500)
  X <- as.matrix(w[, syms])
  U <- pobs(X)
  fits <- fit_copulas(U)
  if (length(fits) == 0) stop("no copula could be fitted")
  tab <- do.call(rbind, lapply(fits, `[[`, "row")) |> arrange(AIC)
  best <- tab$copula[1]
  emp <- mean(U[, 1] <= M8_Q & U[, 2] <= M8_Q)
  pc <- tab$P_crollo_congiunto[1]
  cond <- pc / M8_Q
  rho <- cor(X[, 1], X[, 2]); tau <- cor(X[, 1], X[, 2], method = "kendall")
  q1 <- quantile(X[, 1], M8_Q); q2 <- quantile(X[, 2], M8_Q)

  module_result(
    headline = sprintf("%s e %s: la copula migliore (AIC) è %s. Se %s fa una giornata nel peggior 5%%, la probabilità che lo faccia anche %s è %s (indipendenza: 5%%; storico: %s).",
                       syms[1], syms[2], toupper(best), syms[1], syms[2], fmt_pct(cond), fmt_pct(emp / M8_Q)),
    verdict = toupper(best),
    summary = list(
      ui_item("Copula migliore", best, "AIC più basso"),
      ui_item("Crollo congiunto (modello)", fmt_pct(pc, 2), sprintf("P(entrambi sotto il loro %d%% peggiore)", M8_Q * 100)),
      ui_item("Crollo congiunto (storico)", fmt_pct(emp, 2)),
      ui_item("Indipendenza", fmt_pct(M8_Q^2, 2), "se non fossero legati"),
      ui_item("Dipendenza di coda bassa", fmt_num(tab$coda_bassa[1], 3), "lambda_L della copula migliore"),
      ui_item("Correlazione / tau di Kendall", paste(fmt_num(rho, 2), "/", fmt_num(tau, 2)))
    ),
    charts = list(ui_chart(sprintf("Rendimenti giornalieri: %s e %s (ultimi 300)", syms[1], syms[2]),
                           as.character(tail(w$day, 300)), list(ui_line(syms[1], tail(X[, 1], 300)), ui_line(syms[2], tail(X[, 2], 300))))),
    tables = list(ui_table("Copule stimate (pseudo-osservazioni, massima pseudo-verosimiglianza)", tab),
                  ui_table("Soglie del 5% peggiore", data.frame(asset = syms, rendimento_soglia = c(q1, q2)))),
    notes = list(
      "La copula separa la dipendenza dalle distribuzioni dei singoli asset: si stima sui ranghi (pseudo-osservazioni).",
      "Gaussiana: nessuna dipendenza nelle code. t: code simmetriche. Clayton: crolli insieme. Gumbel: rally insieme. Frank: nessuna coda.",
      "Il crollo congiunto misura quanto la diversificazione sparisce proprio nei giorni peggiori."
    )
  )
}

m8_portfolio <- function(con) {
  w <- aligned_returns(con, ASSETS, days = 1500)
  syms <- vapply(ASSETS, function(a) split_asset(a)$symbol, "")
  X <- as.matrix(w[, syms]); d <- ncol(X)
  U <- pobs(X)
  tc <- fitCopula(tCopula(dim = d, dispstr = "un"), U, method = "mpl")
  set.seed(7)
  sim <- rCopula(20000, tc@copula)
  # Empirical marginals: map simulated uniforms back to returns
  R <- sapply(seq_len(d), function(j) quantile(X[, j], sim[, j], type = 8))
  gc <- fitCopula(normalCopula(dim = d, dispstr = "un"), U, method = "mpl")
  Rg <- sapply(seq_len(d), function(j) quantile(X[, j], rCopula(20000, gc@copula)[, j], type = 8))
  wts <- rep(1 / d, d)
  pt <- R %*% wts; pg <- Rg %*% wts; ph <- X %*% wts
  risk <- function(p) c(VaR95 = -quantile(p, 0.05), VaR99 = -quantile(p, 0.01), ES975 = -mean(p[p <= quantile(p, 0.025)]))
  tab <- rbind(t_copula = risk(pt), gaussiana = risk(pg), storico = risk(ph))
  tab <- data.frame(metodo = rownames(tab), VaR95 = tab[, 1], VaR99 = tab[, 2], ES975 = tab[, 3])
  stress <- data.frame(scenario = paste("caduta", syms, "nel peggior 1%"), rendimento_portafoglio_medio = vapply(seq_len(d), function(j) {
    sel <- R[, j] <= quantile(R[, j], 0.01); mean(pt[sel])
  }, 0))
  module_result(
    headline = sprintf("Portafoglio equipesato %s: con una t-copula il VaR 1 giorno 99%% è %s e l'Expected Shortfall 97.5%% %s; la copula gaussiana li sottostima a %s e %s.",
                       paste(syms, collapse = "/"), fmt_pct(tab$VaR99[1]), fmt_pct(tab$ES975[1]), fmt_pct(tab$VaR99[2]), fmt_pct(tab$ES975[2])),
    verdict = "STRESS",
    summary = list(
      ui_item("VaR 99% (t-copula)", fmt_pct(tab$VaR99[1]), NULL, "bad"),
      ui_item("ES 97.5% (t-copula)", fmt_pct(tab$ES975[1]), NULL, "bad"),
      ui_item("VaR 99% (gaussiana)", fmt_pct(tab$VaR99[2])),
      ui_item("VaR 99% (storico)", fmt_pct(tab$VaR99[3])),
      ui_item("Gradi di libertà t-copula", fmt_num(tail(coef(tc), 1), 1), "bassi = più crolli congiunti")
    ),
    tables = list(ui_table("Rischio del portafoglio (20 000 scenari simulati)", tab), ui_table("Stress test condizionati", stress)),
    notes = list("Simulazione: copula stimata sui ranghi, poi i rendimenti tornano alla distribuzione storica di ogni asset (marginali empiriche).",
                 "Pesi uguali tra gli asset di FORECAST_ASSETS; si cambiano dalla configurazione.")
  )
}

# ── Hawkes (exponential kernel) ───────────────────────────────
hawkes_nll <- function(th, t, Tend) {
  mu <- exp(th[1]); a <- plogis(th[2]); b <- exp(th[3])
  n <- length(t); A <- 0; ll <- 0
  for (i in seq_len(n)) {
    if (i > 1) A <- exp(-b * (t[i] - t[i - 1])) * (1 + A)
    ll <- ll + log(mu + a * b * A)
  }
  ll <- ll - mu * Tend - a * sum(1 - exp(-b * (Tend - t)))
  -ll
}

fit_hawkes <- function(t, Tend) {
  rate <- length(t) / Tend
  best <- NULL
  for (b0 in c(0.5, 2, 8)) {
    o <- tryCatch(optim(c(log(rate * 0.5), qlogis(0.4), log(b0)), hawkes_nll, t = t, Tend = Tend, method = "BFGS"), error = function(e) NULL)
    if (!is.null(o) && (is.null(best) || o$value < best$value)) best <- o
  }
  if (is.null(best)) stop("Hawkes likelihood did not converge")
  list(mu = exp(best$par[1]), alpha = plogis(best$par[2]), beta = exp(best$par[3]), ll = -best$value,
       ll_pois = length(t) * log(rate) - rate * Tend)
}

hawkes_intensity <- function(fit, t, grid) {
  vapply(grid, function(g) fit$mu + fit$alpha * fit$beta * sum(exp(-fit$beta * (g - t[t < g]))), 0)
}

m8_hawkes <- function(con, kind) {
  if (kind == "news") {
    ev <- DBI::dbGetQuery(con, "SELECT published_at AS t FROM news_articles WHERE published_at > now() - interval '30 days' AND published_at <= now() ORDER BY 1")
    label <- "arrivi di notizie"
  } else {
    ev <- DBI::dbGetQuery(con, "
        WITH b AS (SELECT bucket, ln(close / lag(close) OVER (ORDER BY bucket)) AS r
                   FROM price_bars_1m WHERE venue = 'binance' AND symbol = $1 AND bucket > now() - interval '30 days'),
             s AS (SELECT bucket, r, stddev_samp(r) OVER (ORDER BY bucket ROWS BETWEEN 1440 PRECEDING AND 1 PRECEDING) AS sd FROM b)
        SELECT bucket AS t FROM s WHERE sd > 0 AND abs(r) > 4 * sd ORDER BY 1", params = list(split_asset(M5_MAIN)$symbol))
    label <- sprintf("movimenti estremi di %s (|rendimento 1m| > 4 deviazioni standard)", split_asset(M5_MAIN)$symbol)
  }
  if (nrow(ev) < 30) stop(sprintf("only %d events (%s) in the last 30 days: need 30", nrow(ev), label))
  tt <- as.numeric(as.POSIXct(ev$t, tz = "UTC"))
  t0 <- min(tt); t <- (tt - t0) / 3600
  t <- t + cumsum(c(0, diff(t) == 0)) * 1e-4  # break exact ties
  Tend <- (as.numeric(Sys.time()) - t0) / 3600
  f <- fit_hawkes(t, Tend)
  lr <- 2 * (f$ll - f$ll_pois); p_lr <- pchisq(lr, df = 2, lower.tail = FALSE)
  hl_min <- 60 * log(2) / f$beta
  now_int <- hawkes_intensity(f, t, Tend)
  grid <- seq(max(0, Tend - 72), Tend, by = 0.5)
  inten <- hawkes_intensity(f, t, grid)
  counts <- vapply(grid, function(g) sum(t > g - 0.5 & t <= g), 0) / 0.5
  base <- f$mu / (1 - f$alpha)
  lab_x <- format(as.POSIXct(t0 + grid * 3600, origin = "1970-01-01", tz = "UTC"), "%m-%d %H:%M")

  module_result(
    headline = sprintf("Hawkes (%s): rapporto di ramificazione %.2f, cioè il %s degli eventi è innescato da eventi precedenti; l'eccitazione si dimezza in %s minuti. Intensità attuale %s eventi/ora contro una media di %s.",
                       label, f$alpha, fmt_pct(f$alpha), fmt_num(hl_min, 0), fmt_num(now_int, 2), fmt_num(base, 2)),
    verdict = if (now_int > 2 * base) "CLUSTER_IN_CORSO" else "NORMALE",
    summary = list(
      ui_item("Eventi (30 giorni)", as.character(length(t))),
      ui_item("Intensità di fondo mu", paste(fmt_num(f$mu, 3), "/ora")),
      ui_item("Ramificazione alpha", fmt_num(f$alpha, 3), "quota di eventi figli di altri eventi"),
      ui_item("Dimezzamento eccitazione", paste(fmt_num(hl_min, 0), "min"), "ln 2 / beta"),
      ui_item("Intensità ora", paste(fmt_num(now_int, 2), "/ora"), NULL, if (now_int > 2 * base) "warn" else NULL),
      ui_item("LR test vs Poisson", fmt_p(p_lr), "p < 0.05 = gli eventi si raggruppano davvero", if (p_lr < 0.05) "good" else NULL)
    ),
    charts = list(ui_chart("Ultime 72 ore: intensità stimata ed eventi osservati (per ora)", lab_x, list(
      ui_bar("eventi osservati", counts), ui_line("intensità Hawkes", inten), ui_line("media stazionaria", rep(base, length(grid)))))),
    tables = list(ui_table("Stime (massima verosimiglianza, tempo in ore)", data.frame(
      mu = f$mu, alpha = f$alpha, beta = f$beta, loglik_hawkes = f$ll, loglik_poisson = f$ll_pois, LR = lr, p_value = p_lr))),
    notes = list(
      "Processo di Hawkes con nucleo esponenziale: ogni evento alza l'intensità di alpha·beta, che poi decade al ritmo beta. alpha < 1 garantisce la stazionarietà.",
      "Confronto con un processo di Poisson a intensità costante tramite test del rapporto di verosimiglianza.",
      "L'intensità degli ordini sull'order book richiede di registrare i trade grezzi per settimane: si aggiunge appena ci sono abbastanza dati."
    )
  )
}

run_m8 <- function(con) {
  for (p in M8_PAIRS) {
    if (!all(p %in% ASSETS)) next
    run_subject(con, "M8_tail", paste("COPULA", paste(vapply(p, function(a) split_asset(a)$symbol, ""), collapse = "/")), list(pair = p), function() m8_copula(con, p))
  }
  run_subject(con, "M8_tail", "PORTAFOGLIO", list(assets = ASSETS), function() m8_portfolio(con))
  run_subject(con, "M8_tail", "HAWKES NEWS", list(kind = "news"), function() m8_hawkes(con, "news"))
  run_subject(con, "M8_tail", "HAWKES PREZZI", list(kind = "moves"), function() m8_hawkes(con, "moves"))
}
