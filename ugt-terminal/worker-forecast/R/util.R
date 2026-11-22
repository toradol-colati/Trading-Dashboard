# Shared helpers: logging, heartbeat and the result format read by FORECAST_LAB.
#
# Every module writes, per "subject" (a symbol, a pair, "MACRO", ...), one JSON
# document with the same shape, so the interface can show any module without
# module-specific code:
#   headline  one sentence with the answer
#   verdict   short tag (e.g. "MEAN_REVERSION"), optional
#   summary   list of {label, value, hint, tone}  tone: "good" | "bad" | "warn" | NULL
#   charts    list of {title, x, series = list({name, values, kind = "line"|"band"|"bar", lower, upper})}
#   tables    list of {title, columns, rows}
#   notes     list of strings: method, assumptions, limits

log_msg <- function(...) {
  cat(format(Sys.time(), "%Y-%m-%dT%H:%M:%SZ", tz = "UTC"), "worker-forecast", ..., "\n")
  flush.console()
}

heartbeat <- function() writeLines(format(Sys.time(), tz = "UTC"), "/tmp/heartbeat")

ui_item <- function(label, value, hint = NULL, tone = NULL) {
  list(label = label, value = value, hint = hint, tone = tone)
}

fmt_num <- function(x, digits = 2) {
  if (length(x) == 0 || is.null(x) || is.na(x)) return("—")
  formatC(x, format = "f", digits = digits, big.mark = ",")
}

fmt_pct <- function(x, digits = 1) {
  if (length(x) == 0 || is.null(x) || is.na(x)) return("—")
  paste0(formatC(100 * x, format = "f", digits = digits), "%")
}

fmt_p <- function(p) {
  if (length(p) == 0 || is.null(p) || is.na(p)) return("—")
  if (p < 0.001) "< 0.001" else formatC(p, format = "f", digits = 3)
}

# Keep charts light: at most n points, always keeping the last one.
thin_idx <- function(len, n = 400) {
  if (len <= n) return(seq_len(len))
  unique(c(round(seq(1, len, length.out = n)), len))
}

ui_line <- function(name, values, kind = "line") list(name = name, values = unname(values), kind = kind)
ui_band <- function(name, lower, upper) list(name = name, lower = unname(lower), upper = unname(upper), kind = "band")
ui_bar <- function(name, values) list(name = name, values = unname(values), kind = "bar")

ui_chart <- function(title, x, series, max_points = 400) {
  idx <- thin_idx(length(x), max_points)
  series <- lapply(series, function(s) {
    for (k in c("values", "lower", "upper")) if (!is.null(s[[k]])) s[[k]] <- round(as.numeric(s[[k]])[idx], 6)
    s
  })
  list(title = title, x = as.character(x[idx]), series = series)
}

ui_table <- function(title, df, digits = 4) {
  df <- as.data.frame(df, stringsAsFactors = FALSE)
  rows <- lapply(seq_len(nrow(df)), function(i) {
    lapply(df[i, , drop = FALSE], function(v) {
      v <- v[[1]]
      if (is.logical(v)) { if (is.na(v)) "—" else if (v) "sì" else "no" }
      else if (is.numeric(v)) signif(v, digits) else as.character(v)
    }) |> unname()
  })
  list(title = title, columns = names(df), rows = rows)
}

module_result <- function(headline, summary = list(), charts = list(), tables = list(),
                          notes = list(), verdict = NULL, extra = NULL) {
  out <- list(headline = headline, verdict = verdict, summary = summary,
              charts = charts, tables = tables, notes = as.list(notes))
  if (!is.null(extra)) out$extra <- extra
  out
}

# Run one module for one subject: the result or the error always reaches the database.
run_subject <- function(con, module, subject, params, fn) {
  heartbeat()
  t0 <- Sys.time()
  out <- tryCatch(fn(), error = function(e) e)
  secs <- round(as.numeric(difftime(Sys.time(), t0, units = "secs")), 1)
  params$runtime_secs <- secs
  if (inherits(out, "error")) {
    log_msg("ERROR", module, subject, conditionMessage(out))
    write_result(con, module, subject, "error", params, list(error = conditionMessage(out)))
  } else {
    write_result(con, module, subject, "ok", params, out)
    log_msg("ok", module, subject, paste0(secs, "s"))
  }
  invisible(out)
}

# Engle-Granger critical values for the ADF test on residuals of a cointegrating
# regression with constant (MacKinnon 2010 response surfaces, 5% level):
# c(T) = b_inf + b1 / T + b2 / T^2, by number of variables in the regression.
EG_CRIT_5 <- list(`2` = c(-3.3377, -5.967, -8.98), `3` = c(-3.7429, -8.352, -13.41), `4` = c(-4.1193, -12.024, -13.13))
eg_crit <- function(n_obs, n_vars) {
  b <- EG_CRIT_5[[as.character(n_vars)]]
  b[1] + b[2] / n_obs + b[3] / n_obs^2
}
# ADF without deterministic terms (urca::ur.df) on a regression residual, compared with Engle-Granger values.
eg_test <- function(resid, n_vars) {
  t <- urca::ur.df(resid, type = "none", lags = 10, selectlags = "AIC")
  stat <- t@teststat[1, 1]
  cv <- eg_crit(length(resid), n_vars)
  list(stat = stat, crit = cv, reject = stat < cv)
}
