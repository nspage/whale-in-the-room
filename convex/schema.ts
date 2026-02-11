import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  signals: defineTable({
    id: v.string(), // External ID (sig-1, sig-2, etc.)
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
    // Enrichment Data
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
  })
    .index("by_wallet", ["wallet"])
    .index("by_target_contract", ["target_contract"])
    .index("by_vertical", ["vertical"])
    .index("by_timestamp", ["timestamp"])
    .index("by_transaction_hash", ["transaction_hash"]),

  target_audiences: defineTable({
    target_contract: v.string(),
    wallet_address: v.string(),
    total_volume_usd: v.number(),
    timestamp: v.string(),
  }).index("by_target_contract", ["target_contract"]),

  cohorts: defineTable({
    address: v.string(),
    vertical: v.union(v.literal("DeFi"), v.literal("AI")),
    rank: v.number(),
    volume_7d_usd: v.number(),
    discovery_timestamp: v.string(),
    name: v.optional(v.string()),
    persona: v.optional(v.string()),
  }).index("by_address", ["address"])
    .index("by_vertical", ["vertical"]),
});
