import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

const TRACKED_WALLETS = [
  { address: "0x83d55acdc72027ed339d267eebaf9a41e47490d5", vertical: "DeFi", label: "DeFi Whale #1" },
  { address: "0x3725bd4d175283108156c3f15f86e1c51266155d", vertical: "DeFi", label: "DeFi Whale #2" },
  { address: "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0", vertical: "DeFi", label: "DeFi Whale #3" },
  { address: "0x3f0296bf652e19bca772ec3df08b32732f93014a", vertical: "AI", label: "AI Whale #1" },
  { address: "0x9aec2cb83351bb03bab237985eff6464d2c58633", vertical: "AI", label: "AI Whale #2" },
  { address: "0x7142956e69478524769fdf48b008ac9ce8fd74f2", vertical: "AI", label: "AI Whale #3" },
] as const;

export const pollWhaleActivity = action({
  args: {},
  handler: async (ctx) => {
    const apiKey = process.env.ALLIUM_API_KEY;
    const queryId = process.env.ALLIUM_QUERY_ID;
    if (!apiKey || !queryId) {
      throw new Error("ALLIUM_API_KEY or ALLIUM_QUERY_ID environment variable is not set");
    }

    for (const wallet of TRACKED_WALLETS) {
      console.log(`Polling activities for ${wallet.label}...`);

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

        for (const tx of transactions) {
          // 1. Fetch Farcaster Identity via SQL
          let fc_info: { username?: string; display_name?: string; follower_count?: number } = {};
          
          try {
            const sql = `
              SELECT 
                fname as username, 
                display_name, 
                follower_count 
              FROM base.social.farcaster_profiles 
              WHERE custody_address = '${wallet.address.toLowerCase()}' 
                 OR verified_addresses LIKE '%${wallet.address.toLowerCase()}%'
              LIMIT 1
            `;

            const sqlRunRes = await fetch(`https://api.allium.so/api/v1/explorer/queries/${queryId}/run-async`, {
              method: "POST",
              headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
              body: JSON.stringify({ parameters: { sql_query: sql } }),
            });

            if (sqlRunRes.ok) {
              const run = await sqlRunRes.json();
              const runId = run.run_id;

              // Simple poll for results (max 5 attempts for speed in cron)
              for (let i = 0; i < 5; i++) {
                await new Promise(r => setTimeout(r, 2000));
                const statusRes = await fetch(`https://api.allium.so/api/v1/explorer/query-runs/${runId}/status`, {
                  headers: { "X-API-KEY": apiKey }
                });
                const status = (await statusRes.text()).replace(/"/g, '');
                
                if (status === 'success') {
                  const resultRes = await fetch(`https://api.allium.so/api/v1/explorer/query-runs/${runId}/results?f=json`, {
                    headers: { "X-API-KEY": apiKey }
                  });
                  const resultData = await resultRes.json();
                  if (resultData.data && resultData.data.length > 0) {
                    fc_info = resultData.data[0];
                  }
                  break;
                }
                if (status === 'failed') break;
              }
            }
          } catch (e) {
            console.error("Farcaster lookup failed:", e);
          }

          // 2. Add Signal
          await ctx.runMutation(api.signals.addSignal, {
            id: `convex-${tx.hash.slice(0, 10)}`,
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
            display_name: null,
            persona: null,
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
        console.error(`Error polling ${wallet.address}:`, error);
      }
    }
  },
});