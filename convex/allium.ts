import { action, mutation, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";

// ─── SQL Templates ──────────────────────────────────────────────────────────

const DISCOVERY_SQL_AI = `
SELECT 
    to_address                          AS address,
    SUM(usd_amount)                     AS volume_7d,
    COUNT(*)                            AS tx_count
FROM base.assets.erc20_token_transfers
WHERE block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 DAY'
  AND LOWER(token_address) IN (
      '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b', -- VIRTUAL
      '0x54330d28ca3357f294334bdc454a032e7f353416', -- OLAS
      '0x028c686121f1d1872f7823e20092289f67605d0e'  -- LUNA
  )
GROUP BY 1
HAVING SUM(usd_amount) > 5000
ORDER BY 2 DESC
LIMIT 50
`;

const DISCOVERY_SQL_DEFI = `
SELECT
    sender_address                         AS address,
    SUM(usd_amount)                        AS volume_7d,
    COUNT(*)                               AS tx_count
FROM base.dex.trades
WHERE block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 DAY'
  AND protocol IN ('aerodrome', 'uniswap_v3')
GROUP BY 1
HAVING SUM(usd_amount) > 50000
ORDER BY 2 DESC
LIMIT 50
`;

export const refreshCohort = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.ALLIUM_API_KEY;
    const queryId = process.env.ALLIUM_QUERY_ID;
    if (!apiKey || !queryId) throw new Error("Missing Allium API Key/QueryID");

    const verticals = [
      { name: "AI", sql: DISCOVERY_SQL_AI },
      { name: "DeFi", sql: DISCOVERY_SQL_DEFI }
    ];

    const timestamp = new Date().toISOString();
    let totalAdded = 0;

    for (const v of verticals) {
      console.log(`Discovering Top 50 ${v.name} wallets...`);
      
      const runRes = await fetch("https://api.allium.so/api/v1/explorer/queries/" + queryId + "/run-async", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: { sql_query: v.sql } }),
      });

      if (!runRes.ok) continue;
      const { run_id: runId } = await runRes.json();

      // Poll for results (max 30s)
      let results = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const status = (await (await fetch("https://api.allium.so/api/v1/explorer/query-runs/" + runId + "/status", {
          headers: { "X-API-KEY": apiKey }
        })).text()).replace(/"/g, '');
        
        if (status === 'success') {
          results = (await (await fetch("https://api.allium.so/api/v1/explorer/query-runs/" + runId + "/results?f=json", {
            headers: { "X-API-KEY": apiKey }
          })).json()).data || [];
          break;
        }
      }

      if (results.length > 0) {
        await ctx.runMutation(api.allium.updateCohortTable, {
          vertical: v.name as "AI" | "DeFi",
          wallets: results.map((r: any, idx: number) => ({
            address: r.address,
            rank: idx + 1,
            volume_7d_usd: Number(r.volume_7d),
          })),
          timestamp
        });
        totalAdded += results.length;
      }
    }
    return { success: true, totalAdded };
  },
});

export const updateCohortTable = mutation({
  args: {
    vertical: v.union(v.literal("DeFi"), v.literal("AI")),
    wallets: v.array(v.object({
      address: v.string(),
      rank: v.number(),
      volume_7d_usd: v.number(),
    })),
    timestamp: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Clear existing for this vertical
    const existing = await ctx.db
      .query("cohorts")
      .withIndex("by_vertical", q => q.eq("vertical", args.vertical))
      .collect();
    for (const doc of existing) await ctx.db.delete(doc._id);

    // 2. Insert new
    for (const w of args.wallets) {
      await ctx.db.insert("cohorts", {
        ...w,
        vertical: args.vertical,
        discovery_timestamp: args.timestamp,
        persona: args.vertical + " Specialist #" + w.rank
      });
    }
  }
});

export const pollWhaleActivity = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.ALLIUM_API_KEY;
    const queryId = process.env.ALLIUM_QUERY_ID;
    if (!apiKey || !queryId) throw new Error("Missing Allium Key/QueryID");

    // 1. Fetch current cohort from DB
    const wallets = await ctx.runQuery(api.allium.getCohort);
    if (wallets.length === 0) {
        console.warn("No wallets in cohort. Run refreshCohort first.");
        return;
    }

    // 2. Batch Fetch Farcaster Identities
    const fcMap = new Map();
    try {
      const addresses = wallets.slice(0, 100).map(w => "'" + w.address.toLowerCase() + "'").join(',');
      const sql = "SELECT custody_address, verified_addresses, fname as username, display_name, follower_count FROM base.social.farcaster_profiles WHERE custody_address IN (" + addresses + ") OR verified_addresses LIKE ANY (ARRAY[" + wallets.slice(0,10).map(w => "'%" + w.address.toLowerCase() + "%'").join(',') + "])";

      const sqlRunRes = await fetch("https://api.allium.so/api/v1/explorer/queries/" + queryId + "/run-async", {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: { sql_query: sql } }),
      });

      if (sqlRunRes.ok) {
        const { run_id: runId } = await sqlRunRes.json();
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const status = (await (await fetch("https://api.allium.so/api/v1/explorer/query-runs/" + runId + "/status", { headers: { "X-API-KEY": apiKey } })).text()).replace(/"/g, '');
          if (status === 'success') {
            const results = (await (await fetch("https://api.allium.so/api/v1/explorer/query-runs/" + runId + "/results?f=json", { headers: { "X-API-KEY": apiKey } })).json()).data || [];
            results.forEach((row: any) => {
                wallets.forEach(w => {
                    const addr = w.address.toLowerCase();
                    if (row.custody_address?.toLowerCase() === addr || row.verified_addresses?.toLowerCase().includes(addr)) {
                        fcMap.set(addr, row);
                    }
                });
            });
            break;
          }
        }
      }
    } catch (e) { console.error("FC Batch Failed", e); }

    // 3. Batch Polling for Transactions (Split into batches of 20 - Allium Limit)
    try {
      const batchSize = 20;
      const batches = [];
      for (let i = 0; i < wallets.length; i += batchSize) {
        batches.push(wallets.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        console.log(`Polling batch of ${batch.length} wallets...`);
        const pollRes = await fetch("https://api.allium.so/api/v1/developer/wallet/transactions", {
          method: "POST",
          headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
          body: JSON.stringify(batch.map(w => ({ chain: "base", address: w.address }))),
        });

        if (!pollRes.ok) {
          console.error(`Batch poll failed: ${await pollRes.text()}`);
          continue;
        }

        const data = await pollRes.json();
        const transactions = data.items || [];
        console.log(`Received ${transactions.length} transactions for batch.`);
        
        // Group transactions by wallet
        const txByWallet = new Map();
        transactions.forEach((tx: any) => {
            const addr = tx.from_address.toLowerCase();
            if (!txByWallet.has(addr)) txByWallet.set(addr, []);
            txByWallet.get(addr).push(tx);
        });

        for (const wallet of batch) {
          const walletTx = txByWallet.get(wallet.address.toLowerCase()) || [];
          const fc_info = fcMap.get(wallet.address.toLowerCase()) || {};

          for (const tx of walletTx) {
            await ctx.runMutation(api.signals.addSignal, {
              id: "convex-" + tx.hash.slice(0, 10),
              type: "NEW_CONTRACT",
              wallet: wallet.address,
              vertical: wallet.vertical,
              transaction_hash: tx.hash,
              target_contract: tx.to_address || "0x0",
              timestamp: tx.block_timestamp,
              actionability_score: wallet.rank <= 10 ? 5 : 3,
              is_first_mover: false,
              vertical_tag: wallet.vertical,
              common_neighbors: 0,
              display_name: fc_info.display_name || null,
              persona: wallet.persona || null,
              fc_username: fc_info.username,
              fc_display_name: fc_info.display_name,
              fc_followers: fc_info.follower_count,
              context: {
                wallet_label: "Rank #" + wallet.rank + " " + wallet.vertical + " Whale",
                method_name: tx.method_name,
              },
            });
          }
        }
        // Small delay between batches to be safe
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) { console.error("Poll Failed", e); }
  },
});

export const getCohort = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("cohorts").collect();
  }
});

export const findLookalikeAudience = action({
  args: {
    targetContract: v.string(),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.ALLIUM_API_KEY;
    const queryId = process.env.ALLIUM_QUERY_ID;
    if (!apiKey || !queryId) {
      throw new Error("ALLIUM_API_KEY or ALLIUM_QUERY_ID environment variable is not set");
    }

    const sql = "WITH contract_interactors AS (SELECT DISTINCT from_address as wallet_address FROM base.raw.transactions WHERE LOWER(to_address) = LOWER('" + args.targetContract + "') AND block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 DAY'), wallet_volume AS (SELECT from_address as wallet_address, SUM(usd_amount) as total_volume_usd FROM base.assets.erc20_token_transfers WHERE block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 DAY' GROUP BY from_address) SELECT ci.wallet_address, wv.total_volume_usd FROM contract_interactors ci JOIN wallet_volume wv ON ci.wallet_address = wv.wallet_address WHERE wv.total_volume_usd > 10000 ORDER BY wv.total_volume_usd DESC LIMIT 50";

    console.log("Finding lookalike audience for contract: " + args.targetContract);

    const runResponse = await fetch("https://api.allium.so/api/v1/explorer/queries/" + queryId + "/run-async", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parameters: { sql_query: sql } }),
    });

    if (!runResponse.ok) {
      throw new Error("Failed to start Allium query: " + await runResponse.text());
    }

    const { run_id: runId } = await runResponse.json();

    // Poll for results
    let results = [];
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch("https://api.allium.so/api/v1/explorer/query-runs/" + runId + "/status", {
        headers: { "X-API-KEY": apiKey },
      });
      const status = (await statusRes.text()).replace(/"/g, "");

      if (status === "success") {
        const resultRes = await fetch("https://api.allium.so/api/v1/explorer/query-runs/" + runId + "/results?f=json", {
          headers: { "X-API-KEY": apiKey },
        });
        const resultData = await resultRes.json();
        results = resultData.data || [];
        break;
      }
      if (status === "failed") {
        throw new Error("Allium query failed");
      }
    }

    if (results.length > 0) {
      await ctx.runMutation(api.signals.saveTargetAudience, {
        target_contract: args.targetContract,
        wallets: results.map((r: any) => ({
          wallet_address: r.wallet_address,
          total_volume_usd: Number(r.total_volume_usd),
        })),
      });
      console.log("Saved " + results.length + " lookalike wallets for " + args.targetContract);
    }

    return results;
  },
});