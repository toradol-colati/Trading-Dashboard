import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';

// GET /api/forecast/report → printable HTML report of the latest results of every
// module: question, models, result, limits. Open it in the browser and print to PDF.

type Series = { name?: unknown; kind?: unknown; values?: unknown; lower?: unknown; upper?: unknown };
type Chart = { title?: unknown; x?: unknown; series?: unknown };
type Table = { title?: unknown; columns?: unknown; rows?: unknown };
type Result = { headline?: unknown; verdict?: unknown; summary?: unknown; charts?: unknown; tables?: unknown; notes?: unknown; error?: unknown };

const MODULES: { id: string; title: string; question: string; course: string }[] = [
  { id: 'M1_radar', title: 'M1 · Radar di stazionarietà ed efficienza', question: 'I prezzi hanno una radice unitaria o sono stazionari? Conviene un approccio mean-reversion o trend-following? I rendimenti sono white noise?', course: 'B3, S3' },
  { id: 'M2_decomp', title: 'M2 · Decomposizione, cicli e rotture strutturali', question: 'Quanta parte delle serie è trend, stagionalità e ciclo? Dove cambia il trend? Quale trasformazione stabilizza la varianza?', course: 'B1, B2, S5' },
  { id: 'M3_risk', title: 'M3 · Risk Engine', question: 'Quale modello prevede meglio fuori campione, e quali soglie di take profit e stop loss ne derivano?', course: 'S4, benchmark e cross-validation' },
  { id: 'M4_kalman', title: 'M4 · Kalman', question: 'Qual è il livello "vero" del prezzo al netto del rumore, in che fase del ciclo siamo e quanto è stabile il beta?', course: 'B1, S2' },
  { id: 'M5_scenari', title: 'M5 · Scenari, eventi e regimi', question: 'Sentiment e macro spiegano o anticipano i rendimenti? Come reagisce il mercato alle decisioni FED? In che regime siamo?', course: 'B2, S1, HMM' },
  { id: 'M6_scoreboard', title: 'M6 · Scoreboard', question: 'Come sono andate davvero le previsioni salvate ogni giorno?', course: 'S4, B3' },
  { id: 'M7_quant', title: 'M7 · Quant avanzato', question: 'Come evolve la volatilità? Esistono coppie cointegrate da sfruttare? Quali fattori comuni muovono gli asset?', course: 'GARCH, Johansen, OU, PCA' },
  { id: 'M8_tail', title: 'M8 · Rischio estremo ed esecuzione', question: 'Quanto è probabile un crollo congiunto? Gli eventi si raggruppano nel tempo?', course: 'Copule, Hawkes' },
];

const esc = (v: unknown) =>
  (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const COLORS = ['#1a7f37', '#1f5fbf', '#b26b00', '#b3207a', '#0f8a9c', '#c62828'];

function svgChart(c: Chart): string {
  const series = arr<Series>(c.series).filter((s) => s.kind !== 'band' && Array.isArray(s.values));
  const xs = arr<unknown>(c.x);
  if (!series.length || xs.length < 2) return '';
  const all = series.flatMap((s) => arr<number | null>(s.values).filter((v): v is number => typeof v === 'number' && Number.isFinite(v)));
  if (!all.length) return '';
  const min = Math.min(...all), max = Math.max(...all), W = 640, H = 160, pad = 4;
  const sx = (i: number) => pad + (i / (xs.length - 1)) * (W - 2 * pad);
  const sy = (v: number) => H - pad - ((v - min) / (max - min || 1)) * (H - 2 * pad);
  const paths = series.slice(0, 6).map((s, k) => {
    let d = '';
    arr<number | null>(s.values).forEach((v, i) => {
      if (typeof v !== 'number' || !Number.isFinite(v)) return;
      d += `${d && !d.endsWith('|') ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`;
    });
    return `<path d="${d}" fill="none" stroke="${COLORS[k % COLORS.length]}" stroke-width="1.3"/>`;
  }).join('');
  const legend = series.slice(0, 6).map((s, k) => `<span style="color:${COLORS[k % COLORS.length]}">■ ${esc(s.name)}</span>`).join(' ');
  return `<figure><figcaption>${esc(c.title)}</figcaption><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">${paths}</svg>
    <div class="axis"><span>${esc(xs[0])}</span><span>min ${min.toPrecision(4)} · max ${max.toPrecision(4)}</span><span>${esc(xs[xs.length - 1])}</span></div><div class="legend">${legend}</div></figure>`;
}

function htmlTable(t: Table): string {
  const cols = arr<unknown>(t.columns);
  const rows = arr<unknown[]>(t.rows).slice(0, 40);
  return `<table><caption>${esc(t.title)}</caption><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${arr<unknown>(r).map((v) => `<td>${esc(v) || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

// pg returns timestamptz as a Date: String(Date) would give 'Sun Nov 22 2026 ...'.
const stamp = (v: unknown) => {
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0, 16).replace('T', ' ');
};

function subjectBlock(symbol: string, status: string, computedAt: unknown, r: Result): string {
  if (status === 'error') {
    return `<section class="subject err"><h3>${esc(symbol)}</h3><p>Errore: ${esc(r.error)}</p></section>`;
  }
  const summary = arr<{ label?: unknown; value?: unknown; hint?: unknown }>(r.summary)
    .map((s) => `<div class="kpi"><div class="l">${esc(s.label)}</div><div class="v">${esc(s.value) || '—'}</div>${esc(s.hint) ? `<div class="h">${esc(s.hint)}</div>` : ''}</div>`).join('');
  return `<section class="subject"><h3>${esc(symbol)} ${esc(r.verdict) ? `<span class="tag">${esc(r.verdict)}</span>` : ''}</h3>
    <p class="headline">${esc(r.headline)}</p><div class="kpis">${summary}</div>
    ${arr<Chart>(r.charts).slice(0, 2).map(svgChart).join('')}
    ${arr<Table>(r.tables).map(htmlTable).join('')}
    ${arr<unknown>(r.notes).length ? `<ul class="notes">${arr<unknown>(r.notes).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <div class="meta">Calcolato ${esc(stamp(computedAt))} UTC</div></section>`;
}

const reportRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/report', async (_request, reply) => {
    const res = await query(
      `SELECT DISTINCT ON (module, symbol) module, symbol, status, computed_at, result
       FROM forecast_results ORDER BY module, symbol, computed_at DESC`,
    );
    const coverage = await query(
      `SELECT source, symbol, count(*)::int AS rows, min(day)::text AS first_day, max(day)::text AS last_day
       FROM market_daily GROUP BY 1, 2 ORDER BY 1, 2`,
    );
    const scored = await query(`SELECT count(*)::int AS n FROM forecast_log f JOIN market_daily m ON m.symbol = f.symbol AND m.day = f.target_date`);
    const rows = res.rows as { module: string; symbol: string; status: string; computed_at: string; result: Result }[];
    const generated = new Date().toISOString().slice(0, 16).replace('T', ' ');

    const sections = MODULES.map((m) => {
      const subjects = rows.filter((r) => r.module === m.id);
      const body = subjects.length
        ? subjects.map((s) => subjectBlock(s.symbol, s.status, s.computed_at, s.result || {})).join('')
        : '<p class="empty">Nessun risultato ancora: il motore non ha eseguito questo modulo.</p>';
      return `<article><h2>${esc(m.title)}</h2><p class="q"><b>Domanda.</b> ${esc(m.question)} <span class="course">Voci del corso: ${esc(m.course)}</span></p>${body}</article>`;
    }).join('');

    const cov = (coverage.rows as { source: string; symbol: string; rows: number; first_day: string; last_day: string }[])
      .map((c) => `<tr><td>${esc(c.source)}:${esc(c.symbol)}</td><td>${c.rows}</td><td>${esc(c.first_day)}</td><td>${esc(c.last_day)}</td></tr>`).join('');

    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>UGT · Report previsioni</title>
<style>
body{font:13px/1.45 -apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1c1c1c;max-width:960px;margin:24px auto;padding:0 16px;background:#fff}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;border-bottom:2px solid #1c1c1c;padding-bottom:4px;margin-top:36px}
h3{font-size:14px;margin:18px 0 4px}.tag{font-size:10px;border:1px solid #1f5fbf;color:#1f5fbf;padding:1px 6px;margin-left:6px;letter-spacing:.08em}
.q{background:#f4f4f2;padding:8px 10px}.course{color:#666;font-size:11px;margin-left:6px}.headline{font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px;margin:6px 0}
.kpi{border:1px solid #e2e2de;padding:6px}.kpi .l{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.05em}.kpi .v{font-weight:700}.kpi .h{font-size:10px;color:#888}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:11px}caption{text-align:left;font-weight:600;padding:4px 0}
th,td{border-bottom:1px solid #e6e6e2;padding:3px 6px;text-align:left;white-space:nowrap}th{color:#555}
figure{margin:8px 0}figcaption{font-size:11px;font-weight:600}.axis{display:flex;justify-content:space-between;font-size:10px;color:#888}.legend{font-size:10px}
.notes{color:#555;font-size:11px}.meta{color:#999;font-size:10px}.err{color:#c62828}.empty{color:#888}
.subject{page-break-inside:avoid}@media print{body{margin:0}a{color:inherit}}
</style></head><body>
<h1>UGT · Report dei modelli di previsione</h1>
<p>Generato ${esc(generated)} UTC. Per ogni modulo: la domanda, il risultato più recente per ogni asset o serie, le tabelle di stima e i limiti del metodo.
Previsioni verificate contro prezzi reali finora: <b>${(scored.rows[0] as { n: number }).n}</b>.</p>
<h2>Dati usati</h2><table><thead><tr><th>Serie</th><th>Giorni</th><th>Dal</th><th>Al</th></tr></thead><tbody>${cov || '<tr><td colspan="4">Nessuno storico ancora</td></tr>'}</tbody></table>
${sections}
<p class="meta">Motore: R con fable, feasts, tsibble, urca, strucchange, KFAS, depmixS4, copula; GARCH e Hawkes con verosimiglianze esplicite. Per salvarlo in PDF: Stampa → Salva come PDF.</p>
</body></html>`;
    reply.type('text/html; charset=utf-8');
    return html;
  });
};

export default reportRoutes;
