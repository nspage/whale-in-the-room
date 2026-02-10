import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

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
    vertical: v.union(v.literal("DeFi"), v.literal("AI"), v.literal("SocialFi")),
    transaction_hash: v.string(),
    target_contract: v.string(),
    timestamp: v.string(),
    actionability_score: v.number(),
    is_first_mover: v.boolean(),
    vertical_tag: v.union(v.string(), v.null()),
    common_neighbors: v.number(),
    display_name: v.union(v.string(), v.null()),
    persona: v.union(v.string(), v.null()),
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
    // Check for duplicate transaction_hash
    const existing = await ctx.db
      .query("signals")
      .withIndex("by_transaction_hash", (q) => q.eq("transaction_hash", args.transaction_hash))
      .first();

    if (existing) {
      // Note: We could update the record with social info if it was missing before,
      // but per requirements we skip duplicate hashes.
      return;
    }

    await ctx.db.insert("signals", args);
  },
});
