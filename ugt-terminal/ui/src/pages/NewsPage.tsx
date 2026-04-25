import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { format } from 'date-fns';
import {
  Archive,
  BookmarkPlus,
  CalendarDays,
  Expand,
  ExternalLink,
  Filter,
  Link2,
  LoaderCircle,
  MinusCircle,
  PencilLine,
  PlusCircle,
  RefreshCcw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import { SentimentBadge, TerminalCard } from '../components/Shared';
import { useStream } from '../hooks/useStream';

type NewsArticleCard = {
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

type NewsSectionFeed = {
  code: string;
  label: string;
  articles: NewsArticleCard[];
};

type NewsArchiveItem = {
  id: string;
  title: string;
  summary: string;
  url: string | null;
  saved_at: string;
  source: string;
};

type IntelligenceResponse = {
  mode: 'mock' | 'live';
  day: string;
  available_days: Array<{ day: string; count: number }>;
  watchlist: string[];
  archive: NewsArchiveItem[];
  sections: NewsSectionFeed[];
  all_selected: NewsArticleCard[];
};

type ViewMode = 'sectioned' | 'all';

type NewsPageProps = {
  isWidget?: boolean;
  onRequestExpand?: (articleId?: string) => void;
  initialArticleId?: string | null;
};

const clampStyle = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical' as const,
  overflow: 'hidden',
};

const fallbackData = (): IntelligenceResponse => ({
  mode: 'mock',
  day: new Date().toISOString().slice(0, 10),
  available_days: [{ day: new Date().toISOString().slice(0, 10), count: 5 }],
  watchlist: ['BTC', 'ETH', 'SOL', 'SUI', 'NASDAQ', 'SPX', 'DXY', 'EURUSD', 'GOLD'],
  archive: [],
  sections: [
    {
      code: 'impact_tickers',
      label: 'Impatto sui ticker',
      articles: [
        {
          id: 'fallback-1',
          title: 'Bitcoin ETF inflows accelerate as macro desks price in softer Fed stance',
          summary:
            'Institutional desks increased BTC exposure after softer inflation expectations improved macro risk appetite and boosted crypto beta demand.',
          compact_summary: 'BTC exposure up as softer inflation expectations lift crypto beta demand.',
          source: 'COINDESK',
          url: 'https://www.coindesk.com/',
          published_at: new Date().toISOString(),
          language: 'en',
          tickers: ['BTC', 'NASDAQ'],
          sentiment_compound: 0.74,
          feedback_rating: null,
          feedback_section_code: null,
          archived: false,
          cluster_size: 2,
          related_sources: [
            {
              id: 'fallback-2',
              source: 'REUTERS',
              title: 'Bitcoin ETF inflows accelerate as macro desks price in softer Fed stance',
              url: 'https://www.reuters.com/',
            },
          ],
          body_full:
            'Institutional allocators pushed another wave of spot Bitcoin ETF inflows after lower-than-expected inflation readings revived expectations for a softer Federal Reserve path. Desk commentary linked the move to broader risk appetite and renewed crypto beta demand.',
          body_preview:
            'Institutional allocators pushed another wave of spot Bitcoin ETF inflows after lower-than-expected inflation readings revived expectations for a softer Federal Reserve path.',
          body_mode: 'full',
          section_scores: { impact_tickers: 5.9, macro_relevant: 4.7, extreme_sentiment: 5.1 },
          matched_keywords: ['etf', 'fed', 'inflation'],
        },
      ],
    },
  ],
  all_selected: [],
});

function lineClamp(lines: number) {
  return {
    ...clampStyle,
    WebkitLineClamp: lines,
  };
}

function formatDayLabel(day: string) {
  try {
    return format(new Date(`${day}T00:00:00`), 'dd MMM yyyy');
  } catch {
    return day;
  }
}

function formatArticleDate(value: string) {
  try {
    return format(new Date(value), 'dd MMM yyyy');
  } catch {
    return value;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function SectionDivider({ label, count }: { label: string; count: number }) {
  return (
    <div className="mb-4 mt-7 flex items-center gap-3">
      <div className="rounded-full border border-[#2e3645] bg-[#0e131b] px-3 py-1 text-[10px] uppercase tracking-[0.24em] text-[#edf2ff]">
        {label}
      </div>
      <div className="text-[10px] uppercase tracking-[0.2em] text-[#727c93]">{count} selezionate</div>
      <div className="h-px flex-1 bg-gradient-to-r from-[#5273ff] via-[#22314d] to-transparent" />
    </div>
  );
}

function WidgetStory({
  article,
  onOpen,
}: {
  article: NewsArticleCard;
  onOpen: (articleId?: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article.id)}
      className="rounded-2xl border border-[#222a38] bg-[#0b1018] px-4 py-3 text-left transition-colors hover:border-[#5a75ff] hover:bg-[#101726]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] uppercase tracking-[0.22em] text-[#8fb0ff]">{article.source}</span>
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#69738a]">
          {formatArticleDate(article.published_at)}
        </span>
      </div>
      <h3 className="mt-2 text-[14px] font-semibold leading-5 text-[#eef3ff]" style={lineClamp(2)}>
        {article.title}
      </h3>
      <p className="mt-2 text-[12px] leading-5 text-[#9ba6bf]" style={lineClamp(2)}>
        {article.compact_summary}
      </p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {article.tickers.slice(0, 3).map((ticker) => (
            <span
              key={ticker}
              className="rounded-full border border-[#2a415e] bg-[#0d1626] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#8fcbff]"
            >
              #{ticker}
            </span>
          ))}
        </div>
        {article.cluster_size > 1 && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-[#93dfa9]">
            +{article.cluster_size - 1} fonti
          </span>
        )}
      </div>
    </button>
  );
}

function NewsCard({
  article,
  mode,
  active,
  onOpen,
}: {
  article: NewsArticleCard;
  mode: 'mock' | 'live';
  active: boolean;
  onOpen: (article: NewsArticleCard) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article)}
      className={clsx(
        'group rounded-2xl border p-4 text-left transition-all duration-200',
        'bg-[linear-gradient(180deg,rgba(18,22,32,0.98),rgba(11,13,20,0.98))]',
        active
          ? 'border-[#8ea6ff] shadow-[0_0_0_1px_rgba(142,166,255,0.3),0_18px_48px_rgba(6,12,28,0.52)]'
          : 'border-[#242d3a] hover:border-[#5470ff] hover:bg-[linear-gradient(180deg,rgba(21,27,40,0.98),rgba(12,16,24,0.98))]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[#31406a] bg-[#142036] px-2 py-1 text-[10px] uppercase tracking-[0.22em] text-[#d8e2ff]">
            {article.source}
          </span>
          {article.cluster_size > 1 && (
            <span className="rounded-full border border-[#285740] bg-[#162b22] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#9ce9c0]">
              altre {article.cluster_size - 1} fonti
            </span>
          )}
        </div>
        <span className="text-[10px] uppercase tracking-[0.18em] text-[#737d93]">
          {formatArticleDate(article.published_at)}
        </span>
      </div>

      <h3 className="mt-4 text-[15px] font-semibold leading-6 text-[#f3f7ff]" style={lineClamp(3)}>
        {article.title}
      </h3>
      <p className="mt-3 text-[13px] leading-6 text-[#9da8bf]" style={lineClamp(2)}>
        {article.summary}
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {article.tickers.slice(0, 4).map((ticker) => (
            <span
              key={ticker}
              className="rounded-full border border-[#24384d] bg-[#0e1624] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#84c7ff]"
            >
              #{ticker}
            </span>
          ))}
        </div>
        {mode === 'live' ? (
          <SentimentBadge score={article.sentiment_compound} />
        ) : (
          <span className="rounded-full border border-[#4c4231] bg-[#231d13] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#f0d28d]">
            Demo feed
          </span>
        )}
      </div>
    </button>
  );
}

function ArchiveStrip({ items }: { items: NewsArchiveItem[] }) {
  if (items.length === 0) return null;

  return (
    <div className="mt-8">
      <SectionDivider label="Storico News Importanti" count={items.length} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-[#272d36] bg-[#0d1117] px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase tracking-[0.2em] text-[#91a9ff]">{item.source}</span>
              <span className="text-[10px] text-[#707888]">{formatArticleDate(item.saved_at)}</span>
            </div>
            <h4 className="mt-2 text-[13px] font-semibold text-[#eef2ff]" style={lineClamp(2)}>
              {item.title}
            </h4>
            <p className="mt-2 text-[12px] leading-5 text-[#8a93a8]" style={lineClamp(2)}>
              {item.summary}
            </p>
            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-[#7ecbff] hover:text-white"
              >
                <ExternalLink size={12} />
                Apri fonte
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function WidgetShell({
  loading,
  refreshing,
  error,
  sections,
  allSelected,
  onRefresh,
  onOpen,
}: {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  sections: NewsSectionFeed[];
  allSelected: NewsArticleCard[];
  onRefresh: () => void;
  onOpen: (articleId?: string) => void;
}) {
  const previewArticles = allSelected.slice(0, 4);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#283447] bg-[#0d1117] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[#94a4c2]">
          <LoaderCircle size={13} className="animate-spin text-[#7f9cff]" />
          Caricamento news
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[#080b11] p-3">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(90,115,255,0.16),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(18,173,112,0.12),transparent_30%)]" />
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#90a0bf]">
              <Sparkles size={11} className="text-[#86a8ff]" />
              News Intelligence
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full border border-[#2d3a57] bg-[#101829] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#dbe5ff]">
                {allSelected.length} selezionate
              </span>
              {sections.slice(0, 3).map((section) => (
                <span
                  key={section.code}
                  className="rounded-full border border-[#263348] bg-[#0d131d] px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-[#7fc7ff]"
                >
                  {section.label}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-[#2d3341] bg-[#0f141d] p-2 text-[#95a0b8] hover:border-[#5e74ff] hover:text-white"
            >
              {refreshing ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
            </button>
            <button
              type="button"
              onClick={() => onOpen()}
              className="inline-flex items-center gap-2 rounded-full border border-[#3c4f82] bg-[#101a31] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#ecf1ff] hover:border-[#6f86ff]"
            >
              <Expand size={13} />
              Apri
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-[#574728] bg-[#231d11] px-3 py-2 text-[11px] text-[#f2d38d]">
            {error}
          </div>
        )}

        <div className="mt-4 min-h-0 flex-1 overflow-y-auto space-y-3 pr-1">
          {previewArticles.length === 0 ? (
            <TerminalCard title="Feed Vuoto">
              <div className="text-[12px] text-[#9ba5bc]">Nessuna notizia disponibile per il giorno selezionato.</div>
            </TerminalCard>
          ) : (
            previewArticles.map((article) => (
              <WidgetStory key={article.id} article={article} onOpen={onOpen} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function NewsDrawer({
  article,
  mode,
  mutatingArticleId,
  onClose,
  onFeedback,
  onArchive,
}: {
  article: NewsArticleCard;
  mode: 'mock' | 'live';
  mutatingArticleId: string | null;
  onClose: () => void;
  onFeedback: (articleId: string, rating: -1 | 1 | 2, sectionCode?: string) => void;
  onArchive: (articleId: string) => void;
}) {
  return (
    <aside
      className={clsx(
        'absolute inset-y-0 right-0 w-full border-l border-[#1f2530] bg-[linear-gradient(180deg,#0b0f16,#090c12)] shadow-[-28px_0_64px_rgba(0,0,0,0.38)]',
        'xl:w-[24rem]',
      )}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-[#1c2432] px-5 py-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-[#90a0bf]">Dettaglio articolo</div>
            <h3 className="mt-2 text-[18px] font-semibold leading-6 text-[#f3f7ff]">{article.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#2b3240] p-2 text-[#93a0b8] hover:border-[#6074ff] hover:text-white"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#304069] bg-[#101a2d] px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#d6e0ff]">
              {article.source}
            </span>
            <span className="rounded-full border border-[#2c333f] bg-[#111723] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#92a0ba]">
              {formatArticleDate(article.published_at)}
            </span>
            {mode === 'live' ? (
              <SentimentBadge score={article.sentiment_compound} />
            ) : (
              <span className="rounded-full border border-[#4c4231] bg-[#231d13] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#f0d28d]">
                Mock feed
              </span>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {article.tickers.map((ticker) => (
              <span
                key={ticker}
                className="rounded-full border border-[#284362] bg-[#0f1726] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#7fc7ff]"
              >
                #{ticker}
              </span>
            ))}
            {article.matched_keywords.map((keyword) => (
              <span
                key={keyword}
                className="rounded-full border border-[#3f364f] bg-[#1a1524] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#d2b7ff]"
              >
                {keyword}
              </span>
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-[#212836] bg-[#0d1117] p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-[#8792a9]">Azioni rapide</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={mutatingArticleId === article.id}
                onClick={() => onFeedback(article.id, -1, article.feedback_section_code || Object.keys(article.section_scores)[0])}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#50353b] bg-[#211418] px-3 py-2 text-[12px] font-medium text-[#ffb3bf] hover:border-[#d85a72] disabled:opacity-60"
              >
                <MinusCircle size={14} />
                -1
              </button>
              <button
                type="button"
                disabled={mutatingArticleId === article.id}
                onClick={() => onFeedback(article.id, 1, article.feedback_section_code || Object.keys(article.section_scores)[0])}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#3b4f60] bg-[#111b25] px-3 py-2 text-[12px] font-medium text-[#badcff] hover:border-[#6caef1] disabled:opacity-60"
              >
                <PlusCircle size={14} />
                +1
              </button>
              <button
                type="button"
                disabled={mutatingArticleId === article.id}
                onClick={() => onFeedback(article.id, 2, article.feedback_section_code || Object.keys(article.section_scores)[0])}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#4d4c24] bg-[#231f10] px-3 py-2 text-[12px] font-medium text-[#ffe790] hover:border-[#f0c84a] disabled:opacity-60"
              >
                <Star size={14} />
                +2
              </button>
              <button
                type="button"
                disabled={mutatingArticleId === article.id || article.archived}
                onClick={() => onArchive(article.id)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#355041] bg-[#12201a] px-3 py-2 text-[12px] font-medium text-[#b7f3cf] hover:border-[#58c58a] disabled:opacity-60"
              >
                <Archive size={14} />
                {article.archived ? 'Salvata' : 'Storico'}
              </button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[#212836] bg-[#0d1117] p-4">
            <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-[#8792a9]">Testo disponibile</div>
            {article.body_mode === 'full' && article.body_full ? (
              <div className="space-y-4 text-[13px] leading-6 text-[#d7deee]">
                {article.body_full.split(/\n+/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
            ) : article.body_preview ? (
              <div className="space-y-3">
                <p className="text-[13px] leading-6 text-[#d7deee]">{article.body_preview}</p>
                <div className="rounded-xl border border-[#3d3a2e] bg-[#221d11] px-3 py-2 text-[12px] text-[#f2daa0]">
                  Testo completo non disponibile o non consentito: qui viene mostrato il miglior estratto recuperabile.
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-[#3d3a2e] bg-[#221d11] px-3 py-2 text-[12px] text-[#f2daa0]">
                Nessun body completo disponibile: usa il link originale per leggere l'articolo sul sito della fonte.
              </div>
            )}

            {article.url && (
              <a
                href={article.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.18em] text-[#8dc8ff] hover:text-white"
              >
                <ExternalLink size={13} />
                Link originale
              </a>
            )}
          </div>

          {article.related_sources.length > 0 && (
            <div className="mt-5 rounded-2xl border border-[#212836] bg-[#0d1117] p-4">
              <div className="mb-3 text-[10px] uppercase tracking-[0.22em] text-[#8792a9]">
                Coperto anche da altre fonti
              </div>
              <div className="space-y-3">
                {article.related_sources.map((related) => (
                  <div key={related.id} className="rounded-xl border border-[#252d39] bg-[#0a0f16] px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.18em] text-[#8da0c3]">{related.source}</div>
                        <div className="mt-1 text-[12px] leading-5 text-[#dbe3f6]">{related.title}</div>
                      </div>
                      {related.url && (
                        <a
                          href={related.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.18em] text-[#7ecbff] hover:text-white"
                        >
                          <Link2 size={12} />
                          Fonte
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

export const NewsPage = ({
  isWidget,
  onRequestExpand,
  initialArticleId,
}: NewsPageProps) => {
  const [feed, setFeed] = useState<IntelligenceResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [selectedArticle, setSelectedArticle] = useState<NewsArticleCard | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('sectioned');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingTickerList, setSavingTickerList] = useState(false);
  const [mutatingArticleId, setMutatingArticleId] = useState<string | null>(null);
  const [watchlistDraft, setWatchlistDraft] = useState('');
  const [showTickerEditor, setShowTickerEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useStream(['news']);

  const loadFeed = async (day?: string, silent = false) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await fetchJson<IntelligenceResponse>(`/api/news/intelligence${day ? `?day=${day}` : ''}`);
      setFeed(response);
      setSelectedDay(response.day);
      setSelectedArticle((prev) => {
        if (!prev) return null;
        const allArticles = [
          ...response.all_selected,
          ...response.sections.flatMap((section) => section.articles),
        ];
        return allArticles.find((article) => article.id === prev.id) || null;
      });
      setError(null);
    } catch (loadError) {
      console.error('Failed to load news intelligence:', loadError);
      const fallback = fallbackData();
      setFeed(fallback);
      setSelectedDay(fallback.day);
      setError('Feed in fallback locale: API non raggiungibile o ancora in boot.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadFeed();
  }, []);

  useEffect(() => {
    if (data.news?.data) {
      void loadFeed(selectedDay || undefined, true);
    }
  }, [data.news]);

  useEffect(() => {
    if (feed) {
      setWatchlistDraft(feed.watchlist.join(', '));
    }
  }, [feed]);

  const visibleSections = useMemo(() => {
    if (!feed) return [];
    return feed.sections.filter((section) => section.articles.length > 0);
  }, [feed]);

  const allSelected = feed?.all_selected || [];

  const flattenedArticles = useMemo(
    () => [
      ...allSelected,
      ...visibleSections.flatMap((section) => section.articles),
    ],
    [allSelected, visibleSections],
  );

  useEffect(() => {
    if (!initialArticleId || flattenedArticles.length === 0) return;
    const found = flattenedArticles.find((article) => article.id === initialArticleId);
    if (found) {
      setSelectedArticle(found);
    }
  }, [initialArticleId, flattenedArticles]);

  useEffect(() => {
    if (selectedArticle || flattenedArticles.length === 0) return;
    setSelectedArticle(flattenedArticles[0]);
  }, [flattenedArticles, selectedArticle]);

  const submitFeedback = async (articleId: string, rating: -1 | 1 | 2, sectionCode?: string) => {
    setMutatingArticleId(articleId);
    try {
      await fetchJson('/api/news/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          article_id: articleId,
          rating,
          section_code: sectionCode,
        }),
      });
      await loadFeed(selectedDay || undefined, true);
    } finally {
      setMutatingArticleId(null);
    }
  };

  const saveToArchive = async (articleId: string) => {
    setMutatingArticleId(articleId);
    try {
      await fetchJson('/api/news/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: articleId }),
      });
      await loadFeed(selectedDay || undefined, true);
    } finally {
      setMutatingArticleId(null);
    }
  };

  const saveWatchlist = async () => {
    const tickers = watchlistDraft
      .split(',')
      .map((ticker) => ticker.trim().toUpperCase())
      .filter(Boolean);

    if (tickers.length === 0) return;

    setSavingTickerList(true);
    try {
      await fetchJson('/api/news/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      await loadFeed(selectedDay || undefined, true);
    } finally {
      setSavingTickerList(false);
    }
  };

  const renderCards = (articles: NewsArticleCard[]) => (
    <div className={clsx('grid gap-4', isWidget ? 'grid-cols-1' : 'md:grid-cols-2 2xl:grid-cols-3')}>
      {articles.map((article) => (
        <NewsCard
          key={article.id}
          article={article}
          mode={feed?.mode || 'mock'}
          active={selectedArticle?.id === article.id}
          onOpen={setSelectedArticle}
        />
      ))}
    </div>
  );

  if (isWidget) {
    return (
      <WidgetShell
        loading={loading}
        refreshing={refreshing}
        error={error}
        sections={visibleSections}
        allSelected={allSelected}
        onRefresh={() => void loadFeed(selectedDay || undefined, true)}
        onOpen={(articleId) => onRequestExpand?.(articleId)}
      />
    );
  }

  return (
    <div className="relative h-full overflow-hidden bg-[#080b11] p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(111,140,255,0.18),transparent_32%),radial-gradient(circle_at_top_right,rgba(20,180,120,0.14),transparent_28%)]" />
      <div className="relative flex h-full flex-col gap-4">
        <div className="rounded-2xl border border-[#1d2430] bg-[rgba(8,10,14,0.94)] px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-[#8ea0bf]">
              <Sparkles size={12} className="text-[#86a8ff]" />
              News Intelligence
            </div>

            <label className="flex items-center gap-2 rounded-full border border-[#263040] bg-[#0d121a] px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#8fa0bf]">
              <CalendarDays size={11} />
              <span>Giorno</span>
              <select
                value={selectedDay}
                onChange={(event) => {
                  const day = event.target.value;
                  setSelectedDay(day);
                  void loadFeed(day);
                }}
                className="bg-transparent text-[12px] text-[#f4f7ff] outline-none"
              >
                {(feed?.available_days || []).map((item) => (
                  <option key={item.day} value={item.day} className="bg-[#0d1117]">
                    {formatDayLabel(item.day)} ({item.count})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-center gap-2 rounded-full border border-[#263040] bg-[#0d121a] p-1">
              <button
                type="button"
                onClick={() => setViewMode('sectioned')}
                className={clsx(
                  'rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]',
                  viewMode === 'sectioned' ? 'bg-[#5874ff] text-white' : 'text-[#9aa4bc] hover:text-white',
                )}
              >
                Per sezioni
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={clsx(
                  'rounded-full px-3 py-2 text-[11px] uppercase tracking-[0.18em]',
                  viewMode === 'all' ? 'bg-[#5874ff] text-white' : 'text-[#9aa4bc] hover:text-white',
                )}
              >
                Tutte
              </button>
            </div>

            <div className="flex min-w-[18rem] flex-1 items-center gap-2 rounded-full border border-[#263040] bg-[#0d121a] px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-[#8ea0bf]">
              <Sparkles size={11} />
              <span className="text-[#71819f]">Watchlist</span>
              <div className="flex flex-wrap gap-2">
                {(feed?.watchlist || []).slice(0, 9).map((ticker) => (
                  <span
                    key={ticker}
                    className="rounded-full border border-[#294164] bg-[#0f1726] px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-[#89c9ff]"
                  >
                    {ticker}
                  </span>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowTickerEditor((current) => !current)}
                className="ml-auto inline-flex items-center gap-2 rounded-full border border-[#30415f] bg-[#101726] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-[#dce5ff] hover:border-[#5e74ff]"
              >
                <PencilLine size={11} />
                {showTickerEditor ? 'Chiudi' : 'Modifica'}
              </button>
            </div>

            <button
              type="button"
              onClick={() => void loadFeed(selectedDay || undefined, true)}
              className="inline-flex items-center gap-2 rounded-full border border-[#2d3341] bg-[#0f141d] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#d9e1f5] hover:border-[#5e74ff] hover:text-white"
            >
              {refreshing ? <LoaderCircle size={13} className="animate-spin" /> : <RefreshCcw size={13} />}
              Refresh
            </button>

            <span className="rounded-full border border-[#273247] bg-[#0f1624] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#dbe5ff]">
              {allSelected.length} selezionate
            </span>
            <span className="rounded-full border border-[#273247] bg-[#0f1624] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#dbe5ff]">
              {feed?.archive.length || 0} nello storico
            </span>
            {feed?.mode === 'mock' && (
              <span className="rounded-full border border-[#5d4a26] bg-[#251f12] px-3 py-2 text-[11px] uppercase tracking-[0.18em] text-[#f1d085]">
                Mock mode
              </span>
            )}
          </div>

          {showTickerEditor && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl border border-[#212936] bg-[#0d1117] px-3 py-3">
              <input
                value={watchlistDraft}
                onChange={(event) => setWatchlistDraft(event.target.value)}
                placeholder="BTC, ETH, SOL, SUI, NASDAQ, SPX, DXY, EURUSD, GOLD"
                className="flex-1 rounded-xl border border-[#263146] bg-[#0b0f16] px-3 py-2 text-[13px] text-[#edf2ff] outline-none focus:border-[#5e74ff]"
              />
              <button
                type="button"
                onClick={() => void saveWatchlist()}
                disabled={savingTickerList}
                className="inline-flex items-center gap-2 rounded-xl border border-[#36507f] bg-[#13203a] px-3 py-2 text-[12px] font-medium text-[#dfe8ff] hover:border-[#5e74ff] disabled:opacity-60"
              >
                {savingTickerList ? <LoaderCircle size={13} className="animate-spin" /> : <BookmarkPlus size={13} />}
                Salva
              </button>
            </div>
          )}

          {error && (
            <div className="mt-3 rounded-xl border border-[#56472a] bg-[#241f14] px-3 py-2 text-[12px] text-[#f4d28c]">
              {error}
            </div>
          )}
        </div>

        <div className="relative min-h-0 flex-1 overflow-hidden">
          <div className={clsx('h-full overflow-y-auto pr-1', selectedArticle ? 'xl:pr-[26rem]' : '')}>
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <div className="inline-flex items-center gap-3 rounded-full border border-[#273247] bg-[#0d1117] px-4 py-3 text-[12px] uppercase tracking-[0.24em] text-[#93a2c2]">
                  <LoaderCircle size={14} className="animate-spin text-[#7f9cff]" />
                  Analisi news in corso
                </div>
              </div>
            ) : viewMode === 'all' ? (
              <>
                <SectionDivider label="Tutte le selezionate" count={allSelected.length} />
                {allSelected.length > 0 ? (
                  renderCards(allSelected)
                ) : (
                  <TerminalCard title="Nessuna selezione">
                    <div className="text-[13px] text-[#9ba5bc]">
                      Nessuna notizia ha superato la soglia minima per il giorno selezionato.
                    </div>
                  </TerminalCard>
                )}
              </>
            ) : (
              <>
                {visibleSections.map((section) => (
                  <div key={section.code}>
                    <SectionDivider label={section.label} count={section.articles.length} />
                    {renderCards(section.articles)}
                  </div>
                ))}
                {visibleSections.length === 0 && (
                  <TerminalCard title="Nessuna Sezione Attiva">
                    <div className="text-[13px] text-[#9ba5bc]">
                      Il giorno selezionato non contiene ancora abbastanza segnale per popolare il feed editoriale.
                    </div>
                  </TerminalCard>
                )}
              </>
            )}

            <ArchiveStrip items={feed?.archive || []} />
          </div>

          {selectedArticle && (
            <NewsDrawer
              article={selectedArticle}
              mode={feed?.mode || 'mock'}
              mutatingArticleId={mutatingArticleId}
              onClose={() => setSelectedArticle(null)}
              onFeedback={(articleId, rating, sectionCode) => void submitFeedback(articleId, rating, sectionCode)}
              onArchive={(articleId) => void saveToArchive(articleId)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
