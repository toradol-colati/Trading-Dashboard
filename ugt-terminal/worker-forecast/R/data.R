# Data loaders. Every loader fails with a clear message when data is missing,
# so the interface shows what to fix instead of an empty panel.

suppressPackageStartupMessages({
  library(dplyr)
  library(tsibble)
})

# Assets the modules study. "source:symbol" as stored in market_daily.
ASSETS <- trimws(strsplit(Sys.getenv("FORECAST_ASSETS", "binance:BTCUSDT,binance:ETHUSDT,stooq:SPX"), ",")[[1]])
PAIR <- trimws(strsplit(Sys.getenv("FORECAST_PAIR", "binance:ETHUSDT,binance:BTCUSDT"), ",")[[1]])

split_asset <- function(a) {
  p <- strsplit(a, ":")[[1]]
  list(source = p[1], symbol = p[2])
}

load_daily <- function(con, asset, days = NULL, min_rows = 60) {
  a <- split_asset(asset)
  sql <- "SELECT day, open, high, low, close, volume FROM market_daily WHERE source = $1 AND symbol = $2 ORDER BY day"
  df <- DBI::dbGetQuery(con, sql, params = list(a$source, a$symbol))
  if (nrow(df) < min_rows) {
    stop(sprintf("only %d daily rows for %s in market_daily (need %d): history not collected yet",
                 nrow(df), asset, min_rows))
  }
  df$day <- as.Date(df$day)
  if (!is.null(days)) df <- tail(df, days)
  df
}

# Daily series as a tsibble with gaps filled forward (crypto trades every day,
# stock indices do not: for those use trading days, see load_daily_trading).
daily_tsibble <- function(df) {
  df |>
    as_tsibble(index = day) |>
    fill_gaps() |>
    tidyr::fill(close, .direction = "down")
}

# Trading-day index (row number) for series with weekends and holidays.
trading_tsibble <- function(df) {
  df |>
    mutate(t = row_number()) |>
    as_tsibble(index = t)
}

load_macro <- function(con, series_id, source = "fred", min_rows = 24) {
  df <- DBI::dbGetQuery(con,
    "SELECT obs_date AS date, value FROM macro_history WHERE source = $1 AND series_id = $2 ORDER BY obs_date",
    params = list(source, series_id))
  if (nrow(df) < min_rows) {
    stop(sprintf("only %d rows for %s:%s in macro_history (need %d): history not collected yet",
                 nrow(df), source, series_id, min_rows))
  }
  df$date <- as.Date(df$date)
  df
}

# Monthly tsibble from a macro series (monthly mean of whatever frequency it has).
macro_monthly <- function(df) {
  df |>
    mutate(month = yearmonth(date)) |>
    group_by(month) |>
    summarise(value = mean(value), .groups = "drop") |>
    as_tsibble(index = month) |>
    fill_gaps() |>
    tidyr::fill(value, .direction = "down")
}

# Daily log returns aligned across several assets on common dates.
aligned_returns <- function(con, assets, days = NULL) {
  wide <- NULL
  for (a in assets) {
    d <- load_daily(con, a)[, c("day", "close")]
    d$r <- c(NA, diff(log(d$close)))
    d <- d[!is.na(d$r), c("day", "r")]
    names(d)[2] <- split_asset(a)$symbol
    wide <- if (is.null(wide)) d else inner_join(wide, d, by = "day")
  }
  if (!is.null(days)) wide <- tail(wide, days)
  if (nrow(wide) < 60) stop(sprintf("only %d common days for %s", nrow(wide), paste(assets, collapse = ", ")))
  wide
}

aligned_log_prices <- function(con, assets, days = NULL) {
  wide <- NULL
  for (a in assets) {
    d <- load_daily(con, a)[, c("day", "close")]
    d$close <- log(d$close)
    names(d)[2] <- split_asset(a)$symbol
    wide <- if (is.null(wide)) d else inner_join(wide, d, by = "day")
  }
  if (!is.null(days)) wide <- tail(wide, days)
  if (nrow(wide) < 60) stop(sprintf("only %d common days for %s", nrow(wide), paste(assets, collapse = ", ")))
  wide
}

load_hourly_bars <- function(con, symbol, venue = "binance") {
  DBI::dbGetQuery(con, "
      SELECT date_trunc('hour', bucket) AS hour,
             (array_agg(open ORDER BY bucket))[1]::float8 AS open,
             (array_agg(close ORDER BY bucket DESC))[1]::float8 AS close,
             sum(volume)::float8 AS volume
      FROM price_bars_1m WHERE venue = $1 AND symbol = $2
      GROUP BY 1 ORDER BY 1", params = list(venue, symbol))
}
