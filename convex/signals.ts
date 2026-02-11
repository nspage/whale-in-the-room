import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("signals").order("desc").take(100);
  },
});

export const addSignal = mutation({
  args: {
    id: v.string(),
    type: v.literal("NEW_CONTRACT"),
    wallet: v.string(),
            vertical: v.union(v.literal("DeFi"), v.literal("AI")),    transaction_hash: v.string(),
    target_contract: v.string(),
    timestamp: v.string(),
    actionability_score: v.number(),
    is_first_mover: v.boolean(),
    vertical_tag: v.union(v.string(), v.null()),
    common_neighbors: v.number(),
    display_name: v.union(v.string(), v.null()),
    persona: v.union(v.string(), v.null()),
    wallet_net_worth: v.optional(v.number()),
    token_flow: v.optional(v.string()),
    contract_growth_rate: v.optional(v.number()),
    // Farcaster Social Identity
    fc_username: v.optional(v.string()),
    fc_display_name: v.optional(v.string()),
    fc_followers: v.optional(v.number()),
    context: v.object({
      wallet_label: v.string(),
      contract_protocol: v.optional(v.string()),
      tokens_involved: v.optional(v.array(v.string())),
      method_name: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // 1. Skip if we've already processed this specific transaction
    const existingTx = await ctx.db
      .query("signals")
      .withIndex("by_transaction_hash", (q) => q.eq("transaction_hash", args.transaction_hash))
      .first();

    if (existingTx) return;

    // 2. Signal A Logic: Is this a NEW contract for this wallet?
    const seenBefore = await ctx.db
      .query("signals")
      .withIndex("by_wallet", (q) => q.eq("wallet", args.wallet))
      .filter((q) => q.eq(q.field("target_contract"), args.target_contract))
      .first();

    // If we've seen this wallet hit this contract before, it's not a "New Contract" signal
    if (seenBefore) return;

    // 3. Enrichment: Calculate Common Neighbors (other whales who hit this)
    const neighbors = await ctx.db
      .query("signals")
      .withIndex("by_target_contract", (q) => q.eq("target_contract", args.target_contract))
      .collect();
    
    const uniqueWallets = new Set(neighbors.map(n => n.wallet));
    uniqueWallets.delete(args.wallet);
    args.common_neighbors = uniqueWallets.size;

    // 4. Enrichment: Check if First Mover (first one in our cohort to hit it)
    args.is_first_mover = neighbors.length === 0;

    const signalId = await ctx.db.insert("signals", args);

    // 5. Trigger Async Enrichment: Growth Rate
    await ctx.scheduler.runAfter(0, api.allium.fetchGrowthRate, {
        targetContract: args.target_contract,
        signalId: signalId
    });

    // 6. Trigger Telegram Notification (only for high-value ranks)
    if (args.actionability_score >= 4) {
        await ctx.scheduler.runAfter(0, api.notifications.sendTelegramAlert, {
          whaleName: args.display_name || args.context.wallet_label,
          protocol: args.context.method_name || "New Protocol",
          dashboardUrl: "https://whale-in-the-room.pages.dev/", 
        });
    }

    // 7. Trigger Audience Expansion (Lookalike SQL)
    await ctx.scheduler.runAfter(0, api.allium.findLookalikeAudience, {
      targetContract: args.target_contract,
    });
  },
});

export const saveTargetAudience = mutation({
  args: {
    target_contract: v.string(),
    wallets: v.array(
      v.object({
        wallet_address: v.string(),
        total_volume_usd: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const timestamp = new Date().toISOString();
    for (const wallet of args.wallets) {
      // Avoid duplicates for the same contract
      const existing = await ctx.db
        .query("target_audiences")
        .withIndex("by_target_contract", (q) => q.eq("target_contract", args.target_contract))
        .filter((q) => q.eq(q.field("wallet_address"), wallet.wallet_address))
        .first();

      if (!existing) {
        await ctx.db.insert("target_audiences", {
          target_contract: args.target_contract,
          wallet_address: wallet.wallet_address,
          total_volume_usd: wallet.total_volume_usd,
          timestamp,
        });
      }
    }
  },
});

export const listTargetAudience = query({
  args: { target_contract: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("target_audiences")
      .withIndex("by_target_contract", (q) => q.eq("target_contract", args.target_contract))
      .order("desc")
      .take(50);
  },
});