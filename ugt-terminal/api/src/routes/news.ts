import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import pool, { isMock, query } from '../db/pool.js';
import { DEFAULT_NEWS_WATCHLIST } from '../config/news-intelligence.js';
import {
  buildIntelligenceFeed,
  buildMockRawArticles,
  getSectionLabel,
  inferSourceClass,
  normalizeSource,
  type FeedbackPreferenceSignals,
  type RawNewsArticle,
} from '../services/news-intelligence.js';

type ArchiveItem = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  saved_at: string;
  source: string;
};

type FeedMode = 'mock' | 'live';

const mockFeedback = new Map<
  string,
  { rating: number; section_code: string | null; updated_at: string }
>();
const mockArchive = new Map<string, ArchiveItem>();
let mockWatchlist: string[] = [...DEFAULT_NEWS_WATCHLIST];

const rawQuerySchema = z.object({
  source_class: z.enum(['crypto_native', 'tradfi']).optional(),
  ticker: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
});

const intelligenceQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().min(10).max(250).default(120),
});

const watchlistBodySchema = z.object({
  tickers: z.array(z.string().min(1)).min(1).max(50),
});

const feedbackBodySchema = z.object({
  article_id: z.string().min(1),
  rating: z.union([z.literal(-1), z.literal(1), z.literal(2)]),
  section_code: z.string().min(1).optional(),
});

const archiveBodySchema = z.object({
  article_id: z.string().min(1),
});

function formatDay(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseTickers(rawValue: unknown) {
  if (Array.isArray(rawValue)) {
    return rawValue.map((item) => String(item));
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function buildArchiveSummary(body: string | null, title: string) {
  const sourceText = (body || title).replace(/\s+/g, ' ').trim();
  if (sourceText.length <= 92) return sourceText;
  return `${sourceText.slice(0, 91).trimEnd()}...`;
}

function buildMockArticles(day: string) {
  const articles = buildMockRawArticles(day);
  return articles.map((article) => {
    const feedback = mockFeedback.get(article.id);
    const archived = mockArchive.get(article.id);
    return {
      ...article,
      feedback_rating: feedback?.rating ?? article.feedback_rating,
      feedback_section_code: feedback?.section_code ?? article.feedback_section_code,
      feedback_updated_at: feedback?.updated_at ?? article.feedback_updated_at,
      archived: Boolean(archived),
      archived_at: archived?.saved_at ?? article.archived_at,
    };
  });
}

async function getWatchlist() {
  if (isMock) {
    return [...mockWatchlist];
  }

  const result = await query(
    `
      SELECT ticker
      FROM news_watchlist_tickers
      ORDER BY sort_order ASC, ticker ASC
    `,
  );

  if (result.rows.length === 0) {
    return [...DEFAULT_NEWS_WATCHLIST];
  }

  return result.rows.map((row: { ticker: string }) => String(row.ticker));
}

async function setWatchlist(tickers: string[]) {
  const normalized = Array.from(
    new Set(tickers.map(normalizeTicker).filter(Boolean)),
  );

  if (isMock) {
    mockWatchlist = normalized;
    return normalized;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM news_watchlist_tickers');
    for (const [index, ticker] of normalized.entries()) {
      await client.query(
        `
          INSERT INTO news_watchlist_tickers (ticker, sort_order)
          VALUES ($1, $2)
        `,
        [ticker, index],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return normalized;
}

async function getAvailableDays(limit: number) {
  if (isMock) {
    return Array.from({ length: Math.min(limit, 5) }).map((_, index) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() - index);
      return {
        day: formatDay(date),
        count: buildMockRawArticles(formatDay(date)).length,
      };
    });
  }

  const result = await query(
    `
      SELECT published_at::date::text AS day, COUNT(*)::int AS count
      FROM news_articles
      GROUP BY published_at::date
      ORDER BY published_at::date DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row: { day: string; count: number | string }) => ({
    day: String(row.day),
    count: Number(row.count),
  }));
}

async function resolveDay(preferredDay?: string) {
  if (preferredDay) return preferredDay;

  const days = await getAvailableDays(1);
  if (days.length > 0) {
    return days[0].day;
  }

  return formatDay(new Date());
}

function mapRowToArticle(row: Record<string, unknown>): RawNewsArticle {
  return {
    id: String(row.id),
    source_code: String(row.source_code),
    url: row.url ? String(row.url) : null,
    title: String(row.title),
    body: row.body ? String(row.body) : null,
    published_at: new Date(String(row.published_at)).toISOString(),
    language: row.language ? String(row.language) : 'en',
    tickers: parseTickers(row.tickers_json),
    sentiment_compound: Number(row.sentiment_compound || 0),
    feedback_rating:
      row.feedback_rating === null || row.feedback_rating === undefined
        ? null
        : Number(row.feedback_rating),
    feedback_section_code: row.feedback_section_code
      ? String(row.feedback_section_code)
      : null,
    feedback_updated_at: row.feedback_updated_at
      ? new Date(String(row.feedback_updated_at)).toISOString()
      : null,
    archived: Boolean(row.archived),
    archived_at: row.archived_at ? new Date(String(row.archived_at)).toISOString() : null,
  };
}

async function getArticlesForDay(day: string, limit: number) {
  if (isMock) {
    return buildMockArticles(day).slice(0, limit);
  }

  const result = await query(
    `
      SELECT
        na.id::text AS id,
        na.source_code,
        na.url,
        na.title,
        na.body,
        na.published_at,
        na.language,
        COALESCE(na.tickers_detected_json, '[]'::jsonb) AS tickers_json,
        COALESCE(sentiments.compound_avg, 0)::float AS sentiment_compound,
        feedback.rating AS feedback_rating,
        feedback.section_code AS feedback_section_code,
        feedback.updated_at AS feedback_updated_at,
        CASE WHEN archive.article_id IS NOT NULL THEN TRUE ELSE FALSE END AS archived,
        archive.saved_at AS archived_at
      FROM news_articles na
      LEFT JOIN (
        SELECT article_id, AVG(compound)::float AS compound_avg
        FROM sentiment_scores
        GROUP BY article_id
      ) sentiments ON sentiments.article_id = na.id
      LEFT JOIN news_article_feedback feedback ON feedback.article_id = na.id
      LEFT JOIN news_saved_archive archive ON archive.article_id = na.id
      WHERE na.published_at::date = $1::date
      ORDER BY na.published_at DESC
      LIMIT $2
    `,
    [day, limit],
  );

  return result.rows.map((row: Record<string, unknown>) => mapRowToArticle(row));
}

async function getFeedbackPreferenceSignals(): Promise<FeedbackPreferenceSignals> {
  if (isMock) {
    const source: Record<string, number> = {};
    const section: Record<string, number> = {};
    const ticker: Record<string, number> = {};

    for (const [id, feedback] of mockFeedback.entries()) {
      const article = buildMockArticles(formatDay(new Date())).find((item) => item.id === id);
      if (!article) continue;
      const normalizedSource = normalizeSource(article.source_code);
      source[normalizedSource] = (source[normalizedSource] || 0) + feedback.rating;
      if (feedback.section_code) {
        section[feedback.section_code] = (section[feedback.section_code] || 0) + feedback.rating;
      }
      for (const tickerCode of article.tickers) {
        ticker[tickerCode.toUpperCase()] = (ticker[tickerCode.toUpperCase()] || 0) + feedback.rating;
      }
    }

    return { source, section, ticker };
  }

  const [sourceRows, sectionRows, tickerRows] = await Promise.all([
    query(
      `
        SELECT na.source_code, AVG(feedback.rating)::float AS avg_rating
        FROM news_article_feedback feedback
        JOIN news_articles na ON na.id = feedback.article_id
        GROUP BY na.source_code
      `,
    ),
    query(
      `
        SELECT section_code, AVG(rating)::float AS avg_rating
        FROM news_article_feedback
        WHERE section_code IS NOT NULL
        GROUP BY section_code
      `,
    ),
    query(
      `
        SELECT UPPER(ticker.value) AS ticker, AVG(feedback.rating)::float AS avg_rating
        FROM news_article_feedback feedback
        JOIN news_articles na ON na.id = feedback.article_id
        JOIN LATERAL jsonb_array_elements_text(COALESCE(na.tickers_detected_json, '[]'::jsonb)) AS ticker(value) ON TRUE
        GROUP BY UPPER(ticker.value)
      `,
    ),
  ]);

  return {
    source: Object.fromEntries(
      sourceRows.rows.map((row: { source_code: string; avg_rating: number | string }) => [
        normalizeSource(String(row.source_code)),
        Number(row.avg_rating),
      ]),
    ),
    section: Object.fromEntries(
      sectionRows.rows.map((row: { section_code: string; avg_rating: number | string }) => [
        String(row.section_code),
        Number(row.avg_rating),
      ]),
    ),
    ticker: Object.fromEntries(
      tickerRows.rows.map((row: { ticker: string; avg_rating: number | string }) => [
        String(row.ticker),
        Number(row.avg_rating),
      ]),
    ),
  };
}

async function getArchive(limit: number) {
  if (isMock) {
    return Array.from(mockArchive.values())
      .sort((left, right) => right.saved_at.localeCompare(left.saved_at))
      .slice(0, limit);
  }

  const result = await query(
    `
      SELECT
        archive.article_id::text AS id,
        archive.title,
        archive.summary,
        archive.url,
        archive.saved_at,
        article.source_code AS source
      FROM news_saved_archive archive
      JOIN news_articles article ON article.id = archive.article_id
      ORDER BY archive.saved_at DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    title: String(row.title),
    summary: String(row.summary),
    url: row.url ? String(row.url) : null,
    saved_at: new Date(String(row.saved_at)).toISOString(),
    source: String(row.source),
  }));
}

async function persistFeedback(articleId: string, rating: number, sectionCode?: string) {
  if (isMock) {
    mockFeedback.set(articleId, {
      rating,
      section_code: sectionCode || null,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  await query(
    `
      INSERT INTO news_article_feedback (article_id, rating, section_code)
      VALUES ($1, $2, $3)
      ON CONFLICT (article_id) DO UPDATE SET
        rating = EXCLUDED.rating,
        section_code = EXCLUDED.section_code,
        updated_at = NOW()
    `,
    [articleId, rating, sectionCode || null],
  );
}

async function persistArchive(articleId: string) {
  if (isMock) {
    const article = buildMockArticles(formatDay(new Date())).find((item) => item.id === articleId);
    if (!article) throw new Error('Article not found');

    mockArchive.set(articleId, {
      id: article.id,
      title: article.title,
      summary: buildArchiveSummary(article.body, article.title),
      url: article.url,
      saved_at: new Date().toISOString(),
      source: article.source_code,
    });
    return;
  }

  await query(
    `
      INSERT INTO news_saved_archive (article_id, title, summary, url)
      SELECT
        na.id,
        na.title,
        LEFT(TRIM(COALESCE(NULLIF(na.body, ''), na.title)), 160),
        na.url
      FROM news_articles na
      WHERE na.id = $1::uuid
      ON CONFLICT (article_id) DO UPDATE SET
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        url = EXCLUDED.url,
        saved_at = NOW()
    `,
    [articleId],
  );
}

const newsRoutes: FastifyPluginAsync = async (_fastify: FastifyInstance) => {
  _fastify.get('/', async (request, reply) => {
    const parsed = rawQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const { source_class, ticker, limit } = parsed.data;
    const resolvedDay = await resolveDay();
    const articles = await getArticlesForDay(resolvedDay, Math.max(limit * 3, 80));

    const filtered = articles
      .filter((article: RawNewsArticle) => !source_class || inferSourceClass(article.source_code) === source_class)
      .filter(
        (article: RawNewsArticle) =>
          !ticker || article.tickers.map((item: string) => item.toUpperCase()).includes(ticker.toUpperCase()),
      )
      .slice(0, limit)
      .map((article: RawNewsArticle) => ({
        id: article.id,
        title: article.title,
        source: article.source_code,
        published_at: article.published_at,
        sentiment: JSON.stringify({ compound: article.sentiment_compound }),
        tickers: JSON.stringify(article.tickers),
        url: article.url,
        body: article.body,
      }));

    return filtered;
  });

  _fastify.get('/intelligence', async (request, reply) => {
    const parsed = intelligenceQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const day = await resolveDay(parsed.data.day);
    const [watchlist, availableDays, articles, archive, preferenceSignals] = await Promise.all([
      getWatchlist(),
      getAvailableDays(30),
      getArticlesForDay(day, parsed.data.limit),
      getArchive(50),
      getFeedbackPreferenceSignals(),
    ]);

    const intelligence = buildIntelligenceFeed(articles, watchlist, preferenceSignals);

    return {
      mode: (isMock ? 'mock' : 'live') as FeedMode,
      day,
      available_days: availableDays,
      watchlist,
      archive,
      sections: intelligence.sections,
      all_selected: intelligence.all_selected,
    };
  });

  _fastify.get('/watchlist', async () => {
    const watchlist = await getWatchlist();
    return { tickers: watchlist };
  });

  _fastify.post('/watchlist', async (request, reply) => {
    const parsed = watchlistBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    const tickers = await setWatchlist(parsed.data.tickers);
    return { tickers };
  });

  _fastify.get('/archive', async () => {
    return { items: await getArchive(100) };
  });

  _fastify.post('/archive', async (request, reply) => {
    const parsed = archiveBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    try {
      await persistArchive(parsed.data.article_id);
      return { ok: true, items: await getArchive(100) };
    } catch (error) {
      return reply.status(404).send({
        ok: false,
        error: error instanceof Error ? error.message : 'Article not found',
      });
    }
  });

  _fastify.post('/feedback', async (request, reply) => {
    const parsed = feedbackBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send(parsed.error);

    await persistFeedback(
      parsed.data.article_id,
      parsed.data.rating,
      parsed.data.section_code,
    );

    return {
      ok: true,
      rating: parsed.data.rating,
      section: parsed.data.section_code ? getSectionLabel(parsed.data.section_code) : null,
    };
  });
};

export default newsRoutes;
