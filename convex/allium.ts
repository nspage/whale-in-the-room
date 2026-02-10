import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

const TRACKED_WALLETS = [
  { 
    address: "0x83d55acdc72027ed339d267eebaf9a41e47490d5", 
    vertical: "DeFi", 
    label: "DeFi Whale #1",
    name: "vitalik.eth",
    persona: "DeFi Architect & OG"
  },
  { 
    address: "0x3725bd4d175283108156c3f15f86e1c51266155d", 
    vertical: "DeFi", 
    label: "DeFi Whale #2",
    name: "jesse.base.eth",
    persona: "Base Ecosystem Lead"
  },
  { 
    address: "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0", 
    vertical: "DeFi", 
    label: "DeFi Whale #3",
    name: "whale_alpha.fc",
    persona: "High-Freq Yield Farmer"
  },
  { 
    address: "0x3f0296bf652e19bca772ec3df08b32732f93014a", 
    vertical: "AI", 
    label: "AI Whale #1",
    name: "ai_visionary.eth",
    persona: "AI Agent Collector"
  },
  { 
    address: "0x9aec2cb83351bb03bab237985eff6464d2c58633", 
    vertical: "AI", 
    label: "AI Whale #2",
    name: "bot_master.eth",
    persona: "MEV & AI Integration Expert"
  },
  { 
    address: "0x7142956e69478524769fdf48b008ac9ce8fd74f2", 
    vertical: "AI", 
    label: "AI Whale #3",
    name: "neural_net.eth",
    persona: "DePIN & AI Infrastructure"
  },
] as const;

export const pollWhaleActivity = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.ALLIUM_API_KEY;
    const queryId = process.env.ALLIUM_QUERY_ID;
    if (!apiKey || !queryId) {
      throw new Error("ALLIUM_API_KEY or ALLIUM_QUERY_ID environment variable is not set");
    }

    // 1. Batch Fetch Farcaster Identities for all tracked wallets
    const fcMap = new Map<string, { username?: string; display_name?: string; follower_count?: number }>();
    try {
      const addresses = TRACKED_WALLETS.map(w => `'${w.address.toLowerCase()}'`).join(',');
      const sql = `
        SELECT 
          custody_address,
          verified_addresses,
          fname as username, 
          display_name, 
          follower_count 
        FROM base.social.farcaster_profiles 
        WHERE custody_address IN (${addresses})
           OR verified_addresses LIKE ANY (ARRAY[${TRACKED_WALLETS.map(w => `'%${w.address.toLowerCase()}%'`).join(',')}])
      `;

      const sqlRunRes = await fetch(\`https://api.allium.so/api/v1/explorer/queries/\${queryId}/run-async\`, {
        method: "POST",
        headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ parameters: { sql_query: sql } }),
      });

      if (sqlRunRes.ok) {
        const run = await sqlRunRes.json();
        const runId = run.run_id;

        for (let i = 0; i < 10; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const statusRes = await fetch(\`https://api.allium.so/api/v1/explorer/query-runs/\${runId}/status\`, {
            headers: { "X-API-KEY": apiKey }
          });
          const status = (await statusRes.text()).replace(/"/g, '');
          
          if (status === 'success') {
            const resultRes = await fetch(\`https://api.allium.so/api/v1/explorer/query-runs/\${runId}/results?f=json\`, {
              headers: { "X-API-KEY": apiKey }
            });
            const resultData = await resultRes.json();
            if (resultData.data) {
              for (const row of resultData.data) {
                // Map back to our wallets (handle both custody and verified)
                for (const wallet of TRACKED_WALLETS) {
                  const addr = wallet.address.toLowerCase();
                  if (row.custody_address?.toLowerCase() === addr || row.verified_addresses?.toLowerCase().includes(addr)) {
                    fcMap.set(addr, row);
                  }
                }
              }
            }
            break;
          }
          if (status === 'failed') break;
        }
      }
    } catch (e) {
      console.error("Batch Farcaster lookup failed:", e);
    }

    for (const wallet of TRACKED_WALLETS) {
      console.log(\`Polling activities for \${wallet.name} (\${wallet.label})...\`);

      try {
        const response = await fetch("https://api.allium.so/api/v1/developer/wallet/transactions", {
          method: "POST",
          headers: {
            "X-API-KEY": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([{
            chain: "base",
            address: wallet.address,
          }]),
        });

        if (!response.ok) continue;

        const data = await response.json();
        const transactions = data.items || [];
        const fc_info = fcMap.get(wallet.address.toLowerCase()) || {};

        for (const tx of transactions) {
          // 2. Add Signal
          await ctx.runMutation(api.signals.addSignal, {
            id: \`convex-\${tx.hash.slice(0, 10)}\`,
            type: "NEW_CONTRACT",
            wallet: wallet.address,
            vertical: wallet.vertical as "DeFi" | "AI" | "SocialFi",
            transaction_hash: tx.hash,
            target_contract: tx.to_address || "0x0000000000000000000000000000000000000000",
            timestamp: tx.block_timestamp,
            actionability_score: 3,
            is_first_mover: false,
            vertical_tag: wallet.vertical,
            common_neighbors: 0,
            display_name: wallet.name,
            persona: wallet.persona,
            // Farcaster Data
            fc_username: fc_info.username,
            fc_display_name: fc_info.display_name,
            fc_followers: fc_info.follower_count,
            context: {
              wallet_label: wallet.label,
              method_name: tx.method_name,
            },
          });
        }
      } catch (error) {
        console.error(\`Error polling \${wallet.address}:\`, error);
      }
    }
  },
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

    const sql = `
      WITH contract_interactors AS (
          SELECT DISTINCT from_address as wallet_address
          FROM base.raw.transactions
          WHERE LOWER(to_address) = LOWER('${args.targetContract}')
            AND block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '7 DAY'
      ),
      wallet_volume AS (
          SELECT 
              from_address as wallet_address,
              SUM(usd_amount) as total_volume_usd
          FROM base.assets.erc20_token_transfers
          WHERE block_timestamp >= CURRENT_TIMESTAMP - INTERVAL '30 DAY'
          GROUP BY from_address
      )
      SELECT 
          ci.wallet_address,
          wv.total_volume_usd
      FROM contract_interactors ci
      JOIN wallet_volume wv ON ci.wallet_address = wv.wallet_address
      WHERE wv.total_volume_usd > 10000
      ORDER BY wv.total_volume_usd DESC
      LIMIT 50
    `;

    console.log(`Finding lookalike audience for contract: ${args.targetContract}`);

    const runResponse = await fetch(`https://api.allium.so/api/v1/explorer/queries/${queryId}/run-async`, {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ parameters: { sql_query: sql } }),
    });

    if (!runResponse.ok) {
      throw new Error(`Failed to start Allium query: ${await runResponse.text()}`);
    }

    const { run_id: runId } = await runResponse.json();

    // Poll for results
    let results = [];
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const statusRes = await fetch(`https://api.allium.so/api/v1/explorer/query-runs/${runId}/status`, {
        headers: { "X-API-KEY": apiKey },
      });
      const status = (await statusRes.text()).replace(/"/g, "");

      if (status === "success") {
        const resultRes = await fetch(`https://api.allium.so/api/v1/explorer/query-runs/${runId}/results?f=json`, {
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
      console.log(`Saved ${results.length} lookalike wallets for ${args.targetContract}`);
    }

    return results;
  },
});