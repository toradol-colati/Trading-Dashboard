import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { query } from '../db/pool.js';

// FORECAST_LAB (M0): what data has been collected, what the collectors did,
// and what the R forecast engine produced. Read-only.
// DATE columns are returned as text: a JS Date would shift them by the server's time zone.

const resultsQuery = z.object({
  module: z.string().min(1).max(64).default('M0_smoke'),
  symbol: z.string().min(1).max(32).optional(),
});

const dailyQuery = z.object({
  symbol: z.string().min(1).max(32),
  source: z.string().min(1).max(32).default('binance'),
  days: z.coerce.number().int().min(1).max(20000).default(365),
});

const forecastRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/forecast/status
  fastify.get('/status', async () => {
    const [daily, macro, bars, sentiment, jobs, results] = await Promise.all([
      query(`SELECT source, symbol, count(*)::int AS rows, min(day)::text AS first_day, max(day)::text AS last_day
             FROM market_daily GROUP BY source, symbol ORDER BY source, symbol`),
      query(`SELECT source, series_id, count(*)::int AS rows, min(obs_date)::text AS first_day, max(obs_date)::text AS last_day
             FROM macro_history GROUP BY source, series_id ORDER BY source, series_id`),
      query(`SELECT venue, symbol, count(*)::int AS bars_24h, max(bucket) AS last_bar
             FROM price_bars_1m WHERE bucket > now() - interval '24 hours'
             GROUP BY venue, symbol ORDER BY venue, symbol`),
      query(`SELECT count(*)::int AS hours, max(hour) AS last_hour FROM sentiment_hourly`),
      query(`SELECT DISTINCT ON (job) job, status, rows_written, detail, finished_at
             FROM data_job_runs ORDER BY job, finished_at DESC`),
      query(`SELECT DISTINCT ON (module, symbol) module, symbol, status, computed_at
             FROM forecast_results ORDER BY module, symbol, computed_at DESC`),
    ]);
    return {
      timestamp: new Date().toISOString(),
      market_daily: daily.rows,
      macro_history: macro.rows,
      live_bars: bars.rows,
      sentiment_hourly: sentiment.rows[0],
      jobs: jobs.rows,
      forecasts: results.rows,
    };
  });

  // GET /api/forecast/latest → one line per module and subject: headline, verdict, summary.
  // Used by the Decision page to show what the models say without opening FORECAST_LAB.
  fastify.get('/latest', async () => {
    const res = await query(
      `SELECT DISTINCT ON (module, symbol) module, symbol, status, computed_at,
              result->>'headline' AS headline, result->>'verdict' AS verdict,
              result->'summary' AS summary, result->>'error' AS error
       FROM forecast_results
       WHERE module <> 'M0_smoke'
       ORDER BY module, symbol, computed_at DESC`,
    );
    return res.rows;
  });

  // GET /api/forecast/results?module=M0_smoke&symbol=BTCUSDT  → latest result per symbol
  fastify.get('/results', async (request, reply) => {
    const parsed = resultsQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { module, symbol } = parsed.data;
    const res = await query(
      `SELECT DISTINCT ON (symbol) id, module, symbol, computed_at, status, params, result
       FROM forecast_results
       WHERE module = $1 AND ($2::text IS NULL OR symbol = $2)
       ORDER BY symbol, computed_at DESC`,
      [module, symbol ?? null],
    );
    return res.rows;
  });

  // GET /api/forecast/daily?symbol=BTCUSDT&source=binance&days=365
  fastify.get('/daily', async (request, reply) => {
    const parsed = dailyQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { symbol, source, days } = parsed.data;
    const res = await query(
      `SELECT day::text AS day, open, high, low, close, volume FROM (
         SELECT * FROM market_daily WHERE source = $1 AND symbol = $2 ORDER BY day DESC LIMIT $3
       ) t ORDER BY day`,
      [source, symbol, days],
    );
    return res.rows;
  });
};

export default forecastRoutes;
