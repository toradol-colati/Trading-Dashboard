# Database helpers for the forecast engine.

db_connect <- function() {
  url <- Sys.getenv("DATABASE_URL")
  if (!nzchar(url)) stop("DATABASE_URL missing: worker-forecast cannot run without a database.")
  p <- parse_database_url(url)
  DBI::dbConnect(RPostgres::Postgres(), host = p$host, port = p$port, dbname = p$dbname,
                 user = p$user, password = p$password)
}

# postgresql://user:password@host:port/dbname  (the same DATABASE_URL the other services use)
parse_database_url <- function(url) {
  m <- regmatches(url, regexec("^postgres(ql)?://([^:@/]+)(:([^@/]*))?@([^:/]+)(:([0-9]+))?/([^?]+)", url))[[1]]
  if (length(m) == 0) stop("DATABASE_URL is not a postgresql:// URL")
  list(user = utils::URLdecode(m[3]), password = utils::URLdecode(m[5]), host = m[6],
       port = if (nzchar(m[8])) as.integer(m[8]) else 5432L, dbname = m[9])
}

# The API applies migrations at start-up: wait for migration 0004.
wait_for_schema <- function(tries = 60) {
  for (i in seq_len(tries)) {
    ok <- tryCatch({
      con <- db_connect()
      on.exit(DBI::dbDisconnect(con), add = TRUE)
      isTRUE(DBI::dbGetQuery(con, "SELECT to_regclass('public.forecast_results') IS NOT NULL AS ok")$ok)
    }, error = function(e) FALSE)
    if (ok) return(invisible(TRUE))
    message("waiting for migration 0004 (forecast_results)... ", i)
    heartbeat()
    Sys.sleep(5)
  }
  stop("Migration 0004 not applied: start the api service first.")
}

write_result <- function(con, module, symbol, status, params, result) {
  DBI::dbExecute(con, "
      INSERT INTO forecast_results (module, symbol, status, params, result)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)",
    params = list(module, symbol, status,
                  as.character(jsonlite::toJSON(params, auto_unbox = TRUE)),
                  as.character(jsonlite::toJSON(result, auto_unbox = TRUE, digits = NA, na = "null"))))
}

write_forecast_log <- function(con, symbol, issued_on, rows) {
  DBI::dbWithTransaction(con, {
    for (i in seq_len(nrow(rows))) {
      r <- rows[i, ]
      DBI::dbExecute(con, "
          INSERT INTO forecast_log (model, symbol, issued_on, horizon, target_date, point, lo80, hi80, lo95, hi95)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          ON CONFLICT (model, symbol, issued_on, horizon) DO UPDATE SET
            target_date = EXCLUDED.target_date, point = EXCLUDED.point,
            lo80 = EXCLUDED.lo80, hi80 = EXCLUDED.hi80, lo95 = EXCLUDED.lo95, hi95 = EXCLUDED.hi95",
        params = list(r$model, symbol, issued_on, as.integer(r$horizon), r$target_date,
                      r$point, r$lo80, r$hi80, r$lo95, r$hi95))
    }
  })
}
