import {
  COMMODITY_KEYWORDS,
  CRYPTO_KEYWORDS,
  EQUITY_KEYWORDS,
  HIGH_CREDIBILITY_SOURCES,
  KEYWORD_GROUPS,
  LANGUAGE_PASSTHROUGH,
  MACRO_KEYWORDS,
  NEWS_SECTION_CONFIG,
  URGENCY_KEYWORDS,
} from '../config/news-intelligence.js';

export type FeedbackPreferenceSignals = {
  source: Record<string, number>;
  section: Record<string, number>;
  ticker: Record<string, number>;
};

export type RawNewsArticle = {
  id: string;
  source_code: string;
  url: string | null;
  title: string;
  body: string | null;
  published_at: string;
  language: string | null;
  tickers: string[];
  sentiment_compound: number;
  feedback_rating: number | null;
  feedback_section_code: string | null;
  feedback_updated_at: string | null;
  archived: boolean;
  archived_at: string | null;
};

export type NewsArticleCard = {
  id: string;
  title: string;
  summary: string;
  compact_summary: string;
  source: string;
  url: string | null;
  published_at: string;
  language: string;
  tickers: string[];
  sentiment_compound: number;
  feedback_rating: number | null;
  feedback_section_code: string | null;
  archived: boolean;
  cluster_size: number;
  related_sources: Array<{
    id: string;
    source: string;
    title: string;
    url: string | null;
  }>;
  body_full: string | null;
  body_preview: string | null;
  body_mode: 'full' | 'excerpt' | 'link_only';
  section_scores: Record<string, number>;
  matched_keywords: string[];
};

export type NewsSectionFeed = {
  code: string;
  label: string;
  articles: NewsArticleCard[];
};

export type IntelligenceFeed = {
  sections: NewsSectionFeed[];
  all_selected: NewsArticleCard[];
};

type ClusterCandidate = {
  primary: RawNewsArticle;
  related: RawNewsArticle[];
};

const CRYPTO_SOURCES = new Set([
  'CRYPTOPANIC',
  'COINDESK',
  'COINTELEGRAPH',
  'THEBLOCK',
  'COINMARKETCAP',
  'UGT_ENGINE',
]);

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'from',
  'this',
  'into',
  'near',
  'after',
  'amid',
  'come',
  'comes',
  'about',
  'says',
  'say',
  'will',
  'have',
  'your',
  'into',
  'over',
  'under',
  'while',
  'una',
  'uno',
  'della',
  'delle',
  'dello',
  'degli',
  'dati',
  'news',
  'per',
  'con',
  'alla',
  'alle',
  'sulle',
  'sulla',
  'dopo',
  'dopo',
  'para',
  'sobre',
  'como',
  'desde',
  'delle',
]);

const SECTION_LABEL_MAP = Object.fromEntries(
  NEWS_SECTION_CONFIG.map((section) => [section.code, section.label]),
);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function normalizeSource(source: string) {
  return source.replace(/[^a-z0-9]/gi, '').toUpperCase();
}

export function inferSourceClass(source: string) {
  return CRYPTO_SOURCES.has(normalizeSource(source)) ? 'crypto_native' : 'tradfi';
}

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function countKeywordMatches(text: string, keywords: readonly string[]) {
  let total = 0;
  const matched: string[] = [];
  for (const keyword of keywords) {
    if (text.includes(keyword)) {
      total += 1;
      matched.push(keyword);
    }
  }
  return { total, matched };
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function looksLikeDateOrDeadline(text: string) {
  return /\b\d{1,2}[\/-]\d{1,2}([\/-]\d{2,4})?\b/.test(text) || /\bq[1-4]\b/i.test(text);
}

function sentenceExcerpt(text: string, maxLength: number) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= maxLength) return cleaned;

  const sentences = cleaned.split(/(?<=[.!?])\s+/);
  let excerpt = '';
  for (const sentence of sentences) {
    if ((excerpt + ' ' + sentence).trim().length > maxLength) break;
    excerpt = `${excerpt} ${sentence}`.trim();
  }

  if (excerpt.length >= Math.floor(maxLength * 0.55)) {
    return excerpt;
  }

  return `${cleaned.slice(0, maxLength - 1).trimEnd()}...`;
}

function buildSummary(body: string | null, title: string, language: string | null) {
  const safeLanguage = (language || 'en').slice(0, 2).toLowerCase();
  const sourceText = (body || '').trim();
  if (!sourceText) {
    return LANGUAGE_PASSTHROUGH.has(safeLanguage)
      ? 'Apri la scheda per leggere i dettagli disponibili e il link alla fonte originale.'
      : 'Articolo in lingua non supportata: apri la fonte originale per i dettagli completi.';
  }

  return sentenceExcerpt(sourceText, 165);
}

function buildCompactSummary(summary: string) {
  return sentenceExcerpt(summary, 92);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>) {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

function clusterArticles(articles: RawNewsArticle[]) {
  const consumed = new Set<string>();
  const tokenMap = new Map<string, Set<string>>();

  for (const article of articles) {
    tokenMap.set(article.id, new Set(tokenize(article.title)));
  }

  const clusters: ClusterCandidate[] = [];

  for (const article of articles) {
    if (consumed.has(article.id)) continue;

    const related: RawNewsArticle[] = [];
    const articleTokens = tokenMap.get(article.id) || new Set<string>();
    const articleTime = new Date(article.published_at).getTime();

    for (const candidate of articles) {
      if (candidate.id === article.id || consumed.has(candidate.id)) continue;
      const candidateTime = new Date(candidate.published_at).getTime();
      const hoursDiff = Math.abs(articleTime - candidateTime) / 36e5;
      if (hoursDiff > 18) continue;

      const candidateTokens = tokenMap.get(candidate.id) || new Set<string>();
      const similarity = jaccardSimilarity(articleTokens, candidateTokens);
      if (similarity >= 0.45) {
        related.push(candidate);
      }
    }

    const clusterItems = [article, ...related];
    clusterItems.forEach((item) => consumed.add(item.id));

    const sortedByPrimary = clusterItems
      .slice()
      .sort((left, right) => {
        const leftBody = (left.body || '').length;
        const rightBody = (right.body || '').length;
        if (rightBody !== leftBody) return rightBody - leftBody;
        if (right.sentiment_compound !== left.sentiment_compound) {
          return Math.abs(right.sentiment_compound) - Math.abs(left.sentiment_compound);
        }
        return new Date(right.published_at).getTime() - new Date(left.published_at).getTime();
      });

    clusters.push({
      primary: sortedByPrimary[0],
      related: sortedByPrimary.slice(1),
    });
  }

  return clusters;
}

function scoreArticleForSections(
  article: RawNewsArticle,
  context: {
    watchlist: string[];
    preferenceSignals: FeedbackPreferenceSignals;
    clusterSize: number;
  },
) {
  const watchlistUpper = context.watchlist.map((ticker) => ticker.toUpperCase());
  const articleText = `${article.title} ${(article.body || '').slice(0, 2500)}`.toLowerCase();
  const tickersUpper = article.tickers.map((ticker) => ticker.toUpperCase());
  const tickerOverlap = tickersUpper.filter((ticker) => watchlistUpper.includes(ticker));
  const macroMatches = countKeywordMatches(articleText, MACRO_KEYWORDS);
  const cryptoMatches = countKeywordMatches(articleText, CRYPTO_KEYWORDS);
  const commodityMatches = countKeywordMatches(articleText, COMMODITY_KEYWORDS);
  const equityMatches = countKeywordMatches(articleText, EQUITY_KEYWORDS);
  const urgencyMatches = countKeywordMatches(articleText, URGENCY_KEYWORDS);
  const keywordMatches = Object.entries(KEYWORD_GROUPS).flatMap(([group, keywords]) =>
    countKeywordMatches(articleText, keywords).matched.map(() => group),
  );
  const bodyLength = (article.body || '').length;
  const freshnessHours = Math.max(
    0,
    (Date.now() - new Date(article.published_at).getTime()) / 36e5,
  );
  const freshnessScore = clamp((48 - freshnessHours) / 48, 0, 1);
  const source = normalizeSource(article.source_code);
  const sourcePref = context.preferenceSignals.source[source] || 0;
  const directFeedback = article.feedback_rating || 0;
  const tickerPref = tickerOverlap.reduce(
    (total, ticker) => total + (context.preferenceSignals.ticker[ticker] || 0),
    0,
  );
  const credibilityScore = HIGH_CREDIBILITY_SOURCES.has(source) ? 0.8 : 0.35;
  const baseScore =
    freshnessScore * 1.4 +
    Math.min(bodyLength / 1400, 1) * 0.8 +
    Math.abs(article.sentiment_compound) * 1.2 +
    Math.max(context.clusterSize - 1, 0) * 0.75 +
    tickerOverlap.length * 1.25 +
    credibilityScore +
    sourcePref * 0.35 +
    directFeedback * 0.85 +
    tickerPref * 0.25;

  const scores: Record<string, number> = {};

  if (tickerOverlap.length > 0) {
    scores.impact_tickers =
      baseScore + tickerOverlap.length * 1.8 + (context.preferenceSignals.section.impact_tickers || 0);
  }

  if (
    macroMatches.total > 0 ||
    inferSourceClass(article.source_code) === 'tradfi' ||
    tickerOverlap.some((ticker) => ['NASDAQ', 'SPX', 'DXY', 'EURUSD', 'GOLD'].includes(ticker))
  ) {
    scores.macro_relevant =
      baseScore + macroMatches.total * 0.85 + (context.preferenceSignals.section.macro_relevant || 0);
  }

  if (cryptoMatches.total > 0 || inferSourceClass(article.source_code) === 'crypto_native') {
    scores.crypto_stablecoin =
      baseScore + cryptoMatches.total * 0.9 + (context.preferenceSignals.section.crypto_stablecoin || 0);
  }

  if (commodityMatches.total > 0 || tickersUpper.includes('GOLD')) {
    scores.commodities =
      baseScore + commodityMatches.total * 0.9 + (context.preferenceSignals.section.commodities || 0);
  }

  if (
    equityMatches.total > 0 ||
    tickersUpper.some((ticker) => ['NASDAQ', 'SPX'].includes(ticker))
  ) {
    scores.equities =
      baseScore + equityMatches.total * 0.9 + (context.preferenceSignals.section.equities || 0);
  }

  if (Math.abs(article.sentiment_compound) >= 0.38 || context.clusterSize > 1) {
    scores.extreme_sentiment =
      baseScore +
      Math.abs(article.sentiment_compound) * 2.1 +
      credibilityScore +
      Math.max(context.clusterSize - 1, 0) * 1.3 +
      (context.preferenceSignals.section.extreme_sentiment || 0);
  }

  if (urgencyMatches.total > 0 || looksLikeDateOrDeadline(articleText)) {
    scores.urgency =
      baseScore + urgencyMatches.total * 1.35 + (looksLikeDateOrDeadline(articleText) ? 0.9 : 0) +
      (context.preferenceSignals.section.urgency || 0);
  }

  if (keywordMatches.length > 0) {
    scores.keyword_specific =
      baseScore + unique(keywordMatches).length * 1.15 + (context.preferenceSignals.section.keyword_specific || 0);
  }

  return {
    scores,
    matchedKeywords: unique(keywordMatches),
  };
}

function buildArticleCard(
  cluster: ClusterCandidate,
  watchlist: string[],
  preferenceSignals: FeedbackPreferenceSignals,
) {
  const primary = cluster.primary;
  const summary = buildSummary(primary.body, primary.title, primary.language);
  const scoring = scoreArticleForSections(primary, {
    watchlist,
    preferenceSignals,
    clusterSize: cluster.related.length + 1,
  });
  const bodyMode: NewsArticleCard['body_mode'] = primary.body
    ? primary.body.length > 480
      ? 'full'
      : 'excerpt'
    : 'link_only';

  return {
    id: primary.id,
    title: primary.title,
    summary,
    compact_summary: buildCompactSummary(summary),
    source: primary.source_code,
    url: primary.url,
    published_at: primary.published_at,
    language: (primary.language || 'en').slice(0, 2).toLowerCase(),
    tickers: primary.tickers,
    sentiment_compound: primary.sentiment_compound,
    feedback_rating: primary.feedback_rating,
    feedback_section_code: primary.feedback_section_code,
    archived: primary.archived,
    cluster_size: cluster.related.length + 1,
    related_sources: cluster.related.map((article) => ({
      id: article.id,
      source: article.source_code,
      title: article.title,
      url: article.url,
    })),
    body_full: bodyMode === 'full' ? primary.body : null,
    body_preview: primary.body ? sentenceExcerpt(primary.body, 540) : null,
    body_mode: bodyMode,
    section_scores: scoring.scores,
    matched_keywords: scoring.matchedKeywords,
  };
}

function shouldHideArticle(article: NewsArticleCard) {
  if (article.archived) return true;
  if (article.feedback_rating !== -1) return false;
  return true;
}

export function buildIntelligenceFeed(
  articles: RawNewsArticle[],
  watchlist: string[],
  preferenceSignals: FeedbackPreferenceSignals,
): IntelligenceFeed {
  const clusters = clusterArticles(articles);
  const cards = clusters
    .map((cluster) => buildArticleCard(cluster, watchlist, preferenceSignals))
    .filter((card) => !shouldHideArticle(card));

  const sections = NEWS_SECTION_CONFIG.map((section) => {
    const ranked = cards
      .filter((card) => (card.section_scores[section.code] || 0) >= 2.6)
      .sort((left, right) => (right.section_scores[section.code] || 0) - (left.section_scores[section.code] || 0))
      .slice(0, 12);

    return {
      code: section.code,
      label: section.label,
      articles: ranked,
    };
  }).filter((section) => section.articles.length > 0);

  const allSelected = cards
    .filter((card) => Object.keys(card.section_scores).length > 0)
    .sort((left, right) => {
      const leftMax = Math.max(...Object.values(left.section_scores), -Infinity);
      const rightMax = Math.max(...Object.values(right.section_scores), -Infinity);
      return rightMax - leftMax;
    });

  return {
    sections,
    all_selected: allSelected,
  };
}

export function buildMockRawArticles(referenceDay: string): RawNewsArticle[] {
  const baseDate = new Date(`${referenceDay}T08:00:00.000Z`);
  const iso = (hoursOffset: number) => new Date(baseDate.getTime() + hoursOffset * 36e5).toISOString();

  return [
    {
      id: 'mock-1',
      source_code: 'COINDESK',
      url: 'https://www.coindesk.com/',
      title: 'Bitcoin ETF inflows accelerate as macro desks price in softer Fed stance',
      body:
        'Institutional allocators pushed another wave of spot Bitcoin ETF inflows after lower-than-expected inflation readings revived expectations for a softer Federal Reserve path. Desk commentary linked the move to broader risk appetite and renewed crypto beta demand.',
      published_at: iso(-1),
      language: 'en',
      tickers: ['BTC', 'NASDAQ'],
      sentiment_compound: 0.78,
      feedback_rating: null,
      feedback_section_code: null,
      feedback_updated_at: null,
      archived: false,
      archived_at: null,
    },
    {
      id: 'mock-2',
      source_code: 'REUTERS',
      url: 'https://www.reuters.com/business/',
      title: 'Italy weighs fresh tax guidance as ECB officials warn inflation remains sticky',
      body:
        'Fresh fiscal guidance in Italy and hawkish ECB commentary revived urgency across euro-denominated desks. The note highlights an upcoming compliance deadline for taxpayers while traders reassess rate-cut timing and euro sensitivity.',
      published_at: iso(-2),
      language: 'en',
      tickers: ['EURUSD', 'DXY'],
      sentiment_compound: -0.44,
      feedback_rating: null,
      feedback_section_code: null,
      feedback_updated_at: null,
      archived: false,
      archived_at: null,
    },
    {
      id: 'mock-3',
      source_code: 'THEBLOCK',
      url: 'https://www.theblock.co/',
      title: 'Stablecoin legal framework moves forward as issuers prepare for new listing rules',
      body:
        'Lawmakers advanced a new framework for stablecoin issuers, with market participants focusing on disclosure standards, reserve attestations and possible listing implications for crypto venues. Teams are treating the next publication window as a near-term operational deadline.',
      published_at: iso(-3),
      language: 'en',
      tickers: ['ETH', 'SOL'],
      sentiment_compound: 0.61,
      feedback_rating: null,
      feedback_section_code: null,
      feedback_updated_at: null,
      archived: false,
      archived_at: null,
    },
    {
      id: 'mock-4',
      source_code: 'BLOOMBERG',
      url: 'https://www.bloomberg.com/europe',
      title: 'Gold extends rally while equity futures slip ahead of key US inflation data',
      body:
        'Commodities desks reported renewed demand for gold as traders reduced equity exposure before the next inflation print. The move highlighted classic cross-asset risk-off positioning with DXY and Treasury yields also in focus.',
      published_at: iso(-4),
      language: 'en',
      tickers: ['GOLD', 'SPX'],
      sentiment_compound: 0.37,
      feedback_rating: null,
      feedback_section_code: null,
      feedback_updated_at: null,
      archived: false,
      archived_at: null,
    },
    {
      id: 'mock-5',
      source_code: 'CRYPTOPANIC',
      url: 'https://cryptopanic.com/',
      title: 'Solana story gains momentum after ETF speculation resurfaces across crypto desks',
      body:
        'Aggregated market chatter pointed to renewed ETF speculation around Solana. Primary reporting remains thin, but the narrative is circulating quickly among crypto-native desks and pushing option activity higher.',
      published_at: iso(-5),
      language: 'en',
      tickers: ['SOL'],
      sentiment_compound: 0.58,
      feedback_rating: null,
      feedback_section_code: null,
      feedback_updated_at: null,
      archived: false,
      archived_at: null,
    },
    {
      id: 'mock-6',
      source_code: 'REUTERS',
      url: 'https://www.reuters.com/business/',
      title: 'Bitcoin ETF inflows accelerate as macro desks price in softer Fed stance',
      body:
        'A second major wire confirmed the same ETF flow story, emphasizing cross-asset spillovers from cooling inflation expectations and the effect on crypto risk appetite.',
      published_at: iso(-0.75),
      language: 'en',
      tickers: ['BTC', 'NASDAQ'],
      sentiment_compound: 0.72,
      feedback_rating: null,
      feedback_section_code: null,
      feedback_updated_at: null,
      archived: false,
      archived_at: null,
    },
  ];
}

export function getSectionLabel(code: string) {
  return SECTION_LABEL_MAP[code] || code;
}
