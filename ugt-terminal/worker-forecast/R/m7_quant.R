# ─────────────────────────────────────────────────────────────
# M7 · Quant avanzato (Notion extras)
#   GARCH / GJR-GARCH / EGARCH with Student-t errors (volatility, VaR, sizing)
#   Johansen cointegration and Ornstein-Uhlenbeck on the spread (stat-arb)
#   PCA and multivariate regressions on returns and macro changes
# The GARCH family is estimated by maximum likelihood written here (rugarch is
# not available as a binary package), so every formula is visible.
# ─────────────────────────────────────────────────────────────

M7_GARCH_DAYS <- as.integer(Sys.getenv("M7_GARCH_DAYS", "1500"))
M7_H <- 10

# ── GARCH family ──────────────────────────────────────────────
t_loglik <- function(e, s2, nu) {
  # Standardised Student-t with nu degrees of freedom and variance s2
  sum(lgamma((nu + 1) / 2) - lgamma(nu / 2) - 0.5 * log(pi * (nu - 2) * s2) -
        (nu + 1) / 2 * log(1 + e^2 / ((nu - 2) * s2)))
}

garch_filter <- function(type, p, e) {
  n <- length(e); s2 <- numeric(n); v0 <- var(e)
  if (type == "egarch") {
    ls <- numeric(n); ls[1] <- log(v0)
    Ez <- sqrt((p$nu - 2) / pi) * gamma((p$nu - 1) / 2) / gamma(p$nu / 2)  # E|z| for standardised t
    for (t in 2:n) {
      z <- e[t - 1] / sqrt(exp(ls[t - 1]))
      ls[t] <- p$omega + p$alpha * (abs(z) - Ez) + p$gamma * z + p$beta * ls[t - 1]
    }
    return(exp(ls))
  }
  s2[1] <- v0
  for (t in 2:n) {
    neg <- if (type == "gjr" && e[t - 1] < 0) 1 else 0
    s2[t] <- p$omega + (p$alpha + p$gamma * neg) * e[t - 1]^2 + p$beta * s2[t - 1]
  }
  s2
}

unpack <- function(type, th) {
  if (type == "egarch") {
    list(omega = th[1], alpha = th[2], gamma = th[3], beta = tanh(th[4]), nu = 2.05 + exp(th[5]))
  } else {
    list(omega = exp(th[1]), alpha = plogis(th[2]), gamma = if (type == "gjr") plogis(th[3]) else 0,
         beta = plogis(th[4]), nu = 2.05 + exp(th[5]))
  }
}

fit_garch <- function(e, type) {
  v <- var(e)
  start <- if (type == "egarch") c(0.05 * log(v), 0.15, -0.05, atanh(0.95), log(6)) else c(log(0.05 * v), qlogis(0.08), qlogis(0.05), qlogis(0.88), log(6))
  nll <- function(th) {
    p <- unpack(type, th)
    if (type != "egarch" && (p$alpha + p$gamma / 2 + p$beta) >= 0.999) return(1e10)
    s2 <- garch_filter(type, p, e)
    if (any(!is.finite(s2)) || any(s2 <= 0)) return(1e10)
    -t_loglik(e, s2, p$nu)
  }
  o <- optim(start, nll, method = "Nelder-Mead", control = list(maxit = 4000))
  o <- optim(o$par, nll, method = "BFGS", control = list(maxit = 500))
  p <- unpack(type, o$par)
  k <- if (type == "garch") 4 else 5
  list(type = type, p = p, ll = -o$value, aic = 2 * o$value + 2 * k, bic = 2 * o$value + log(length(e)) * k,
       s2 = garch_filter(type, p, e), conv = o$convergence)
}

simulate_vol <- function(f, e, h = M7_H, n = 3000) {
  set.seed(42)
  p <- f$p
  last_e <- tail(e, 1); last_s2 <- tail(f$s2, 1)
  z <- matrix(rt(n * h, df = p$nu) * sqrt((p$nu - 2) / p$nu), n, h)
  out <- matrix(0, n, h)
  s2 <- rep(if (f$type == "egarch") {
    Ez <- sqrt((p$nu - 2) / pi) * gamma((p$nu - 1) / 2) / gamma(p$nu / 2)
    zz <- last_e / sqrt(last_s2)
    exp(p$omega + p$alpha * (abs(zz) - Ez) + p$gamma * zz + p$beta * log(last_s2))
  } else {
    p$omega + (p$alpha + p$gamma * (last_e < 0)) * last_e^2 + p$beta * last_s2
  }, n)
  Ez <- if (f$type == "egarch") sqrt((p$nu - 2) / pi) * gamma((p$nu - 1) / 2) / gamma(p$nu / 2) else 0
  for (j in seq_len(h)) {
    out[, j] <- s2
    ej <- z[, j] * sqrt(s2)
    s2 <- if (f$type == "egarch") exp(p$omega + p$alpha * (abs(z[, j]) - Ez) + p$gamma * z[, j] + p$beta * log(s2)) else
      p$omega + (p$alpha + p$gamma * (ej < 0)) * ej^2 + p$beta * s2
  }
  sqrt(colMeans(out))
}

news_impact <- function(f, grid, s2bar) {
  p <- f$p
  if (f$type == "egarch") {
    Ez <- sqrt((p$nu - 2) / pi) * gamma((p$nu - 1) / 2) / gamma(p$nu / 2)
    z <- grid / sqrt(s2bar)
    exp(p$omega + p$alpha * (abs(z) - Ez) + p$gamma * z + p$beta * log(s2bar))
  } else {
    p$omega + (p$alpha + p$gamma * (grid < 0)) * grid^2 + p$beta * s2bar
  }
}

m7_garch <- function(con, asset) {
  sym <- split_asset(asset)$symbol
  trading <- split_asset(asset)$source == "stooq"
  ann <- if (trading) 252 else 365
  px <- load_daily(con, asset, days = M7_GARCH_DAYS, min_rows = 500)
  r <- 100 * diff(log(px$close)); days <- px$day[-1]
  e <- r - mean(r)
  fits <- lapply(c("garch", "gjr", "egarch"), function(tp) fit_garch(e, tp))
  names(fits) <- c("GARCH(1,1)", "GJR-GARCH(1,1)", "EGARCH(1,1)")
  tab <- do.call(rbind, lapply(names(fits), function(nm) {
    f <- fits[[nm]]; p <- f$p
    pers <- if (f$type == "egarch") p$beta else p$alpha + p$gamma / 2 + p$beta
    data.frame(modello = nm, omega = p$omega, alpha = p$alpha, gamma = p$gamma, beta = p$beta, nu = p$nu,
               persistenza = pers, half_life_giorni = log(0.5) / log(pers), loglik = f$ll, AIC = f$aic, BIC = f$bic)
  }))
  best <- names(fits)[which.min(tab$BIC)]
  fb <- fits[[best]]
  vol_path <- simulate_vol(fb, e)
  sig1 <- vol_path[1] / 100
  tq <- function(a) qt(a, fb$p$nu) * sqrt((fb$p$nu - 2) / fb$p$nu)
  var95 <- -tq(0.05) * sig1; var99 <- -tq(0.01) * sig1
  target_vol <- as.numeric(Sys.getenv("M7_TARGET_VOL", "0.20"))
  lev <- target_vol / (sig1 * sqrt(ann))
  grid <- seq(-3, 3, length.out = 61) * sd(e)
  s2bar <- var(e)
  asym <- if (best != "GARCH(1,1)") fb$p$gamma else 0

  module_result(
    headline = sprintf("%s: il modello migliore per il BIC è %s; volatilità attesa domani %s annua (%s al giorno), VaR 1 giorno 99%% %s. %s",
                       sym, best, fmt_pct(sig1 * sqrt(ann)), fmt_pct(sig1, 2), fmt_pct(var99),
                       if (best == "GARCH(1,1)") "Nessuna asimmetria rilevante." else if ((best == "EGARCH(1,1)" && asym < 0) || (best == "GJR-GARCH(1,1)" && asym > 0)) "I ribassi alzano la volatilità più dei rialzi (effetto leva)." else "Asimmetria opposta all'effetto leva."),
    verdict = best,
    summary = list(
      ui_item("Volatilità domani (annua)", fmt_pct(sig1 * sqrt(ann)), best),
      ui_item("Volatilità a 10 giorni (annua)", fmt_pct(tail(vol_path, 1) / 100 * sqrt(ann))),
      ui_item("VaR 1g 95% / 99%", paste(fmt_pct(var95), "/", fmt_pct(var99)), "Student-t con i gradi di libertà stimati"),
      ui_item("Gradi di libertà t", fmt_num(fb$p$nu, 1), "code grasse se bassi"),
      ui_item("Half-life degli shock", paste(fmt_num(tab$half_life_giorni[tab$modello == best], 0), "giorni")),
      ui_item(sprintf("Esposizione per vol %s", fmt_pct(target_vol, 0)), fmt_pct(lev), "volatility targeting: quota del capitale")
    ),
    charts = list(
      ui_chart(sprintf("Volatilità condizionata giornaliera (%s) e |rendimento|, in %%", best), as.character(days), list(
        ui_line("|rendimento| %", abs(r)), ui_line("sigma giornaliera %", sqrt(fb$s2))
      )),
      ui_chart("News impact curve: varianza di domani in funzione dello shock di oggi", round(grid, 2), lapply(names(fits), function(nm) ui_line(nm, news_impact(fits[[nm]], grid, s2bar)))),
      ui_chart("Volatilità giornaliera prevista nei prossimi 10 giorni (%)", as.character(seq_len(M7_H)), list(ui_line(best, vol_path)))
    ),
    tables = list(ui_table("Stime per massima verosimiglianza (rendimenti in %)", tab)),
    notes = list(
      "GARCH: la varianza di oggi dipende dallo shock e dalla varianza di ieri. GJR aggiunge un termine solo per gli shock negativi. EGARCH modella il log della varianza, con asimmetria nel termine gamma.",
      "Errori Student-t standardizzati: catturano le code grasse dei rendimenti crypto.",
      "Previsioni della volatilità a più giorni per simulazione (3000 percorsi).",
      "Volatility targeting: quanta esposizione tenere perché la volatilità del portafoglio sia quella obiettivo (M7_TARGET_VOL)."
    )
  )
}

# ── Johansen + Ornstein-Uhlenbeck ─────────────────────────────
m7_johansen <- function(con, pair) {
  w <- aligned_log_prices(con, pair, days = 1500)
  syms <- vapply(pair, function(a) split_asset(a)$symbol, "")
  Y <- as.matrix(w[, syms])
  jo <- urca::ca.jo(Y, ecdet = "const", type = "trace", K = 2)
  stats <- rev(jo@teststat); cv5 <- rev(jo@cval[, "5pct"])
  rank <- sum(cumprod(stats > cv5))
  vec <- jo@V[, 1]; vec <- vec / vec[1]
  spread <- as.numeric(Y %*% vec[seq_along(syms)] + if (length(vec) > length(syms)) vec[length(vec)] else 0)

  # OU via AR(1): s_t = c + phi s_{t-1} + e
  ar <- lm(spread[-1] ~ spread[-length(spread)])
  phi <- unname(coef(ar)[2]); cc <- unname(coef(ar)[1]); se <- sd(residuals(ar))
  mean_rev <- is.finite(phi) && phi > 0 && phi < 1
  if (mean_rev) {
    theta <- -log(phi); mu <- cc / (1 - phi); sd_eq <- se / sqrt(1 - phi^2)
    hl <- log(2) / theta
  } else {
    # phi >= 1 (or <= 0): no mean reversion, OU parameters and half-life are not defined
    theta <- NA_real_; mu <- mean(spread); sd_eq <- sd(spread); hl <- NA_real_
  }
  z <- (spread - mu) / sd_eq
  zt <- tail(z, 1)
  signal <- if (!mean_rev || rank == 0) "NO_SIGNAL" else if (zt > 2) "SHORT_SPREAD" else if (zt < -2) "LONG_SPREAD" else if (abs(zt) < 0.5) "FLAT" else "HOLD"
  jt <- data.frame(ipotesi = paste0("r <= ", seq_along(stats) - 1), statistica_trace = stats, critico_5pct = cv5, rifiuto = stats > cv5)

  module_result(
    headline = sprintf("Johansen su %s: rango di cointegrazione %d. Spread %s, %s; z-score attuale %.2f, quindi %s.",
                       paste(syms, collapse = " e "), rank, if (rank > 0) "stazionario" else "non garantito stazionario",
                       if (mean_rev) sprintf("half-life OU di %s giorni", fmt_num(hl, 1)) else "nessuna mean reversion (phi >= 1)", zt, signal),
    verdict = signal,
    summary = list(
      ui_item("Rango di cointegrazione", as.character(rank), "trace test al 5%", if (rank > 0) "good" else "warn"),
      ui_item("Vettore (normalizzato)", paste(sprintf("%.3f", vec[seq_along(syms)]), collapse = " / ")),
      ui_item("Half-life OU", if (mean_rev) paste(fmt_num(hl, 1), "giorni") else "—", if (mean_rev) "tempo medio per dimezzare la distanza dalla media" else "phi >= 1: lo spread non torna alla media", if (mean_rev) NULL else "warn"),
      ui_item("Theta (velocità)", fmt_num(theta, 4)),
      ui_item("Z-score oggi", fmt_num(zt, 2), "> 2 vendi lo spread, < −2 compralo, |z| < 0.5 chiudi",
              if (abs(zt) > 2) "warn" else NULL),
      ui_item("Segnale", signal)
    ),
    charts = list(ui_chart("Z-score dello spread di cointegrazione", as.character(w$day), list(
      ui_line("z", z), ui_line("+2", rep(2, length(z))), ui_line("−2", rep(-2, length(z))), ui_line("0", rep(0, length(z)))))),
    tables = list(ui_table("Test di Johansen (trace)", jt),
                  ui_table("Ornstein-Uhlenbeck (da AR(1) sullo spread)", data.frame(phi = phi, theta = theta, media = mu, sd_stazionaria = sd_eq, half_life = hl))),
    notes = list(
      "Johansen (trace, costante nel vettore, VAR con 2 lag): quante combinazioni lineari dei log prezzi sono stazionarie.",
      "Lo spread usa il primo vettore di cointegrazione. Ornstein-Uhlenbeck stimato come AR(1) discreto: theta = −ln(phi), half-life = ln 2 / theta.",
      "Senza cointegrazione (rango 0) o con phi >= 1 lo z-score non ha garanzia di tornare a zero: il segnale è NO_SIGNAL.",
      "Vettore, media e deviazione standard sono stimati su tutto il periodo: lo z-score storico è più pulito di come sarebbe stato in tempo reale. L'ultimo valore è quello che conta."
    )
  )
}

# ── PCA and multivariate regression ───────────────────────────
macro_daily_changes <- function(con) {
  d10 <- load_macro(con, "DGS10", min_rows = 200); dx <- load_macro(con, "DTWEXBGS", min_rows = 200)
  d10 <- d10 |> arrange(date) |> transmute(day = date, d10y = c(NA, diff(value)))
  dx <- dx |> arrange(date) |> transmute(day = date, ddxy = c(NA, diff(log(value))))
  inner_join(d10, dx, by = "day") |> filter(!is.na(d10y), !is.na(ddxy))
}

m7_pca <- function(con) {
  rets <- aligned_returns(con, ASSETS, days = 1500)
  X <- tryCatch(inner_join(rets, macro_daily_changes(con), by = "day"), error = function(e) rets)
  M <- as.matrix(X[, -1])
  pc <- prcomp(M, scale. = TRUE)
  ve <- pc$sdev^2 / sum(pc$sdev^2)
  load <- as.data.frame(pc$rotation[, seq_len(min(3, ncol(M)))]); load <- cbind(variabile = rownames(load), load)
  pc1 <- cumsum(pc$x[, 1] * sign(sum(pc$rotation[, 1])))
  module_result(
    headline = sprintf("PCA su %d serie giornaliere: la prima componente spiega il %s della varianza (fattore comune 'rischio'), le prime due il %s.",
                       ncol(M), fmt_pct(ve[1]), fmt_pct(sum(ve[1:min(2, length(ve))]))),
    verdict = "PCA",
    summary = list(ui_item("PC1", fmt_pct(ve[1])), ui_item("PC2", fmt_pct(ve[2])), ui_item("PC3", if (length(ve) > 2) fmt_pct(ve[3]) else "—"),
                   ui_item("Giorni", as.character(nrow(M)))),
    charts = list(
      ui_chart("Varianza spiegata per componente", paste0("PC", seq_along(ve)), list(ui_bar("quota", ve))),
      ui_chart("PC1 cumulata (fattore comune)", as.character(X$day), list(ui_line("PC1", pc1)))
    ),
    tables = list(ui_table("Loadings (prime 3 componenti)", load)),
    notes = list("Rendimenti log giornalieri degli asset, variazione giornaliera del Treasury 10Y e del log dollaro, standardizzati.")
  )
}

m7_regression <- function(con) {
  rets <- aligned_returns(con, ASSETS, days = 1500)
  X <- inner_join(rets, macro_daily_changes(con), by = "day")
  syms <- vapply(ASSETS, function(a) split_asset(a)$symbol, "")
  bench <- if ("SPX" %in% syms) "SPX" else syms[length(syms)]
  ys <- setdiff(syms, bench)
  f <- as.formula(paste0("cbind(", paste(ys, collapse = ", "), ") ~ ", bench, " + d10y + ddxy"))
  mlm <- lm(f, data = X)
  co <- do.call(rbind, lapply(ys, function(y) {
    s <- summary(lm(as.formula(paste(y, "~", bench, "+ d10y + ddxy")), data = X))
    cf <- as.data.frame(s$coefficients); cf$termine <- rownames(cf)
    data.frame(asset = y, termine = cf$termine, stima = cf$Estimate, std_error = cf$`Std. Error`, p_value = cf$`Pr(>|t|)`, R2 = s$r.squared)
  }))
  res_cor <- cor(residuals(mlm))
  rc <- as.data.frame(res_cor); rc <- cbind(asset = rownames(rc), rc)
  b <- co$stima[co$asset == ys[1] & co$termine == bench]
  module_result(
    headline = sprintf("Regressione multivariata: %s ha beta %.2f su %s; R² %s.%s",
                       ys[1], b, bench, paste(sprintf("%s %.2f", ys, unique(co$R2)), collapse = ", "),
                       if (length(ys) < 2) "" else if (res_cor[1, 2] > 0.3)
                         sprintf(" I residui di %s restano correlati (%.2f): c'è un fattore comune oltre a quello di mercato.", paste(ys, collapse = " e "), res_cor[1, 2])
                       else sprintf(" Correlazione dei residui di %s bassa (%.2f): il mercato spiega quasi tutto il legame.", paste(ys, collapse = " e "), res_cor[1, 2])),
    verdict = "MULTIVARIATE",
    summary = list(ui_item(paste("Beta", ys[1], "su", bench), fmt_num(b, 2)),
                   ui_item("Correlazione dei residui", if (length(ys) > 1) fmt_num(res_cor[1, 2], 2) else "—")),
    tables = list(ui_table("Coefficienti per equazione", co), ui_table("Correlazione dei residui", rc)),
    notes = list("Modello lineare multivariato (più variabili dipendenti con gli stessi regressori): rendimenti crypto su mercato azionario, variazione del 10Y e del dollaro.",
                 "Errori standard OLS classici: con eteroschedasticità (vedi GARCH) vanno letti con prudenza.")
  )
}

run_m7 <- function(con) {
  for (a in ASSETS) run_subject(con, "M7_quant", paste("GARCH", split_asset(a)$symbol), list(asset = a), function() m7_garch(con, a))
  run_subject(con, "M7_quant", paste("JOHANSEN", paste(vapply(PAIR, function(a) split_asset(a)$symbol, ""), collapse = "/")),
              list(pair = PAIR), function() m7_johansen(con, PAIR))
  run_subject(con, "M7_quant", "PCA", list(assets = ASSETS), function() m7_pca(con))
  run_subject(con, "M7_quant", "REGRESSIONE", list(assets = ASSETS), function() m7_regression(con))
}
