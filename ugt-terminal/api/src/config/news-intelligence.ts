export const DEFAULT_NEWS_WATCHLIST = [
  'BTC',
  'ETH',
  'SOL',
  'SUI',
  'NASDAQ',
  'SPX',
  'DXY',
  'EURUSD',
  'GOLD',
] as const;

export const NEWS_SECTION_CONFIG = [
  { code: 'impact_tickers', label: 'Impatto sui ticker' },
  { code: 'macro_relevant', label: 'Macro rilevanti' },
  { code: 'crypto_stablecoin', label: 'Crypto & Stablecoin' },
  { code: 'commodities', label: 'Materie prime' },
  { code: 'equities', label: 'Azioni' },
  { code: 'extreme_sentiment', label: 'Sentiment estremo + autorevolezza' },
  { code: 'urgency', label: 'Urgenza/novita temporale' },
  { code: 'keyword_specific', label: 'Keyword specifiche' },
] as const;

export const NEWS_SECTION_ORDER = NEWS_SECTION_CONFIG.map((section) => section.code);

export const LANGUAGE_PASSTHROUGH = new Set(['it', 'en', 'es']);

export const KEYWORD_GROUPS = {
  etf: ['etf', 'etp'],
  sec: ['sec', 'securities and exchange commission'],
  fed: ['fed', 'federal reserve', 'fomc'],
  bce: ['bce', 'ecb', 'banca centrale europea', 'european central bank'],
  inflation: ['inflation', 'inflazione', 'cpi'],
  tariffs: ['tariff', 'tariffs', 'dazi'],
  recession: ['recession', 'recessione'],
  taxes: ['tax', 'taxes', 'tassa', 'tasse', 'fiscale', 'fiscal'],
  legal_framework: ['mica', 'legal framework', 'regulation', 'regolamentazione', 'framework'],
  listing: ['listing', 'listed', 'delisting', 'delisted', 'quotazione'],
  stablecoin: ['stablecoin', 'usdt', 'usdc', 'dai', 'eurc', 'rlusd'],
} as const;

export const URGENCY_KEYWORDS = [
  'today',
  'tomorrow',
  'this week',
  'deadline',
  'effective',
  'effective immediately',
  'takes effect',
  'enter in force',
  'entra in vigore',
  'scade',
  'urgent',
  'immediately',
  'entro',
  'before',
  'aprile',
  'maggio',
  'giugno',
  'luglio',
  'agosto',
  'settembre',
  'ottobre',
  'novembre',
  'dicembre',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  '2026',
  '2027',
];

export const CRYPTO_KEYWORDS = [
  'bitcoin',
  'btc',
  'ethereum',
  'eth',
  'solana',
  'sol',
  'sui',
  'crypto',
  'stablecoin',
  'defi',
  'token',
  'on-chain',
  'onchain',
];

export const COMMODITY_KEYWORDS = [
  'gold',
  'silver',
  'oil',
  'brent',
  'crude',
  'commodity',
  'commodities',
  'natural gas',
];

export const EQUITY_KEYWORDS = [
  'stock',
  'stocks',
  'equity',
  'equities',
  'nasdaq',
  's&p',
  'spx',
  'earnings',
  'guidance',
  'shares',
  'dow',
];

export const MACRO_KEYWORDS = [
  'inflation',
  'inflazione',
  'rates',
  'rate cut',
  'interest rate',
  'interest rates',
  'yield',
  'recession',
  'gdp',
  'employment',
  'payroll',
  'tariff',
  'tax',
  'fed',
  'ecb',
  'bce',
  'central bank',
  'fiscal',
  'treasury',
  'bond',
  'dxy',
  'eurusd',
];

export const HIGH_CREDIBILITY_SOURCES = new Set([
  'REUTERS',
  'BLOOMBERG',
  'FINANCIALTIMES',
  'FT',
  'THEBLOCK',
  'COINDESK',
  'ILSOLE24ORE',
]);

