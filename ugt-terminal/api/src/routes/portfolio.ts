import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { query } from '../db/pool.js';
import { z } from 'zod';
import { parse } from 'csv-parse/sync';

const portfolioRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/portfolio/aggregated
  fastify.get('/aggregated', async (request, reply) => {
    const { isMock } = await import('../db/pool.js');
    if (isMock) {
      return [
        { symbol: 'BTC', total_quantity: '0.4285', avg_cost: '42500.00', currency: 'EUR', asset_class: 'crypto' },
        { symbol: 'ETH', total_quantity: '3.1200', avg_cost: '2100.50', currency: 'EUR', asset_class: 'crypto' },
        { symbol: 'SOL', total_quantity: '25.0000', avg_cost: '85.20', currency: 'EUR', asset_class: 'crypto' },
        { symbol: 'NVDA', total_quantity: '10.0000', avg_cost: '110.00', currency: 'USD', asset_class: 'equity' },
        { symbol: 'EUR', total_quantity: '1240.50', avg_cost: '1.00', currency: 'EUR', asset_class: 'cash' },
      ];
    }

    const { query } = await import('../db/pool.js');
    const res = await query(sql);
    return res.rows;
  });

  // GET /api/portfolio/by-broker/:broker_code
  fastify.get('/by-broker/:broker_code', async (request, reply) => {
    const { broker_code } = request.params as { broker_code: string };
    const sql = `
      SELECT h.*, b.label as broker_label
      FROM portfolio_holdings h
      JOIN broker_accounts b ON h.broker_account_id = b.id
      WHERE b.broker_code = $1
    `;
    const res = await query(sql, [broker_code.toUpperCase()]);
    return res.rows;
  });

  // POST /api/portfolio/import-csv
  fastify.post('/import-csv', async (request, reply) => {
    const data = await request.file();
    if (!data) return reply.status(400).send({ error: 'No file uploaded' });

    const parts = (request.body as any) || {};
    const brokerAccountId = Number(parts.broker_account_id);
    const brokerCode = parts.broker_code?.toUpperCase();

    if (!brokerAccountId) return reply.status(400).send({ error: 'broker_account_id required' });

    const buffer = await data.toBuffer();
    const csvContent = buffer.toString();
    
    // Parse using csv-parse
    const rawRecords = parse(csvContent, { columns: true, skip_empty_lines: true });
    
    const crypto = await import('crypto');
    let imported = 0;

    for (const row of rawRecords) {
        // Idempotency: Create hash of the raw row
        const rowHash = crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
        const externalId = `${brokerCode || 'CSV'}_${rowHash}`;

        // Normalization based on broker
        let symbol = row.Asset || row.ISIN || row.Name || row.symbol;
        let quantity = parseFloat(row.Amount || row.Quantity || row.quantity || '0');
        let avgCost = parseFloat(row.Rate || row.Price || row.avg_cost_basis || '0');
        let assetClass = (brokerCode === 'YOUNGPLATFORM') ? 'crypto' : 'equity';

        if (!symbol || isNaN(quantity)) continue;

        await query(`
            INSERT INTO portfolio_holdings 
                (broker_account_id, external_id, symbol, quantity, avg_cost_basis, currency, asset_class)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (broker_account_id, external_id) DO NOTHING
        `, [
            brokerAccountId,
            externalId,
            symbol,
            quantity,
            avgCost,
            row.Currency || 'EUR',
            assetClass
        ]);
        imported++;
    }

    return { status: 'OK', records_processed: rawRecords.length, imported_new: imported };
  });
};

export default portfolioRoutes;
