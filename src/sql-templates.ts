/**
 * Whale-In-The-Room: SQL Templates for Whale Identification
 * 
 * Three curated SQL queries targeting the top 3 highest-intent wallets
 * per vertical on Base chain. Table names confirmed via Allium schema search.
 * 
 * Confirmed tables:
 *   - base.dex.trades (columns: SENDER_ADDRESS, USD_AMOUNT, PROTOCOL, BLOCK_TIMESTAMP, etc.)
 *   - base.assets.erc20_token_transfers (columns: FROM_ADDRESS, TO_ADDRESS, TOKEN_ADDRESS, USD_AMOUNT, etc.)
 *   - base.raw.transactions (columns: FROM_ADDRESS, TO_ADDRESS, HASH, BLOCK_TIMESTAMP, INPUT, etc.)
 */

// ─── DeFi Whale SQL ──────────────────────────────────────────────────────────
// Finds the top 3 wallets by total DEX trading volume on Aerodrome & Uniswap V3
// in the last 30 days. Filters out dust trades (<$10k).

export const DEFI_WHALE_SQL = `
SELECT
    sender_address                         AS wallet_address,
    COUNT(DISTINCT transaction_hash)       AS tx_count,
    SUM(usd_amount)                        AS total_volume_usd,
    COUNT(DISTINCT liquidity_pool_address)  AS unique_pools,
    ARRAY_AGG(DISTINCT protocol)           AS protocols_used,
    MAX(block_timestamp)                   AS last_active
FROM base.dex.trades
WHERE block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 DAY'
  AND usd_amount > 10000
  AND protocol IN ('aerodrome', 'uniswap_v3')
GROUP BY sender_address
HAVING SUM(usd_amount) > 500000
ORDER BY total_volume_usd DESC
LIMIT 3
`;

// ─── AI Whale SQL ────────────────────────────────────────────────────────────
// Finds the top 3 wallets accumulating AI-vertical tokens (VIRTUAL, OLAS)
// by total USD inflow in the last 30 days.
//
// Token addresses confirmed via /developer/tokens/search:
//   VIRTUAL: 0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b
//   OLAS:    0x54330d28ca3357f294334bdc454a032e7f353416

export const AI_WHALE_SQL = `
WITH ai_token_inflows AS (
    SELECT
        to_address                          AS wallet_address,
        token_address,
        token_symbol,
        SUM(amount)                         AS total_received,
        SUM(usd_amount)                     AS total_received_usd,
        COUNT(*)                            AS transfer_count,
        MAX(block_timestamp)                AS last_inflow
    FROM base.assets.erc20_token_transfers
    WHERE block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 DAY'
      AND LOWER(token_address) IN (
          '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',  -- VIRTUAL
          '0x54330d28ca3357f294334bdc454a032e7f353416'   -- OLAS
      )
      AND usd_amount > 0
    GROUP BY to_address, token_address, token_symbol
)
SELECT
    wallet_address,
    ARRAY_AGG(DISTINCT token_symbol)   AS ai_tokens_held,
    SUM(total_received_usd)            AS total_usd_accumulated,
    SUM(transfer_count)                AS total_transfers,
    COUNT(DISTINCT token_address)      AS token_diversity,
    MAX(last_inflow)                   AS last_active
FROM ai_token_inflows
GROUP BY wallet_address
HAVING SUM(total_received_usd) > 100000
ORDER BY total_usd_accumulated DESC
LIMIT 3
`;

// ─── SQL Map ─────────────────────────────────────────────────────────────────

export type Vertical = 'DeFi' | 'AI';

export const SQL_TEMPLATES: Record<Vertical, { sql: string; description: string }> = {
    DeFi: {
        sql: DEFI_WHALE_SQL,
        description: 'Top 3 LP/trading whales on Aerodrome & Uniswap V3 (>$500k 30d volume)',
    },
    AI: {
        sql: AI_WHALE_SQL,
        description: 'Top 3 AI token accumulators — VIRTUAL & OLAS (>$100k 30d inflow)',
    }
};
