# 🐋 Whale-In-The-Room — Product Requirements Document

> **Version:** 1.0  
> **Date:** 2026-02-10  
> **Author:** Nicolas  
> **Status:** MVP Complete · Insight Engine Phase In Progress  

---

## 1. Executive Summary

**Whale-In-The-Room** is a real-time Base chain alerting system that tracks Whale & KOL (Key Opinion Leader) behavior across **DeFi**, **AI**, and **SocialFi** verticals. It identifies high-value wallet activity and surfaces **actionable marketing signals** for Web3 growth teams, community managers, and marketers.

The system is powered by **[Allium](https://allium.so)** — leveraging their Explorer SQL API, Wallet API, and Price API to discover whales, monitor their on-chain behavior, and enrich signals with protocol context.

### Core Value Proposition

> *"Know what the smartest money on Base is doing — before everyone else."*

Web3 marketers currently monitor whale activity manually through block explorers. Whale-In-The-Room automates discovery-to-signal in a single pipeline: identify whales via SQL queries → poll their transactions in real-time → fire enriched marketing signals when whales explore new protocols.

---

## 2. Target Users

| Persona | Use Case |
|---------|----------|
| **Web3 Growth Leads** | Identify which protocols are attracting whale capital to prioritize partnerships |
| **Community Managers** | Share whale alerts on social channels to drive engagement |
| **BD / Partnerships** | Spot emerging protocols that whales are adopting early for outbound |
| **DeFi Analysts** | Track cross-protocol whale migration patterns |
| **AI/SocialFi Researchers** | Monitor smart-money positioning in nascent verticals |

---

## 3. System Architecture

### 3.1 High-Level Pipeline

```
┌─────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│  Whale Discovery │     │  Convex Engine    │     │  Insight Dashboard │
│  (SQL Templates) │ ──▶ │  (Crons/Actions)  │ ──▶ │  (Real-time Query) │
│                  │     │                   │     │                    │
│  3 SQL queries   │     │  pollWhaleActivity│     │  Signal Feed       │
│  per vertical    │     │  (every 2 mins)   │     │  Live Pulse        │
│  → tracked-      │     │  + Duplicate Check│     │  Filters & Actions │
│    wallets.json  │     │                   │     │                    │
└─────────────────┘     └──────────────────┘     └────────────────────┘
```

### 3.2 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js (ESM) via `tsx` (Local) & Convex Actions (Cloud) |
| **Language** | TypeScript (strict mode, ES2022 target) |
| **Data Source** | Allium API (Explorer SQL, Wallet Transactions, Wallet Balances, Prices) |
| **Server** | Convex Cloud (Backend-as-a-Service) |
| **Frontend** | Single-file HTML/CSS/JS dashboard (`public/index.html`) using Convex Client |
| **Persistence** | Convex Database (Cloud) + Local JSON backups |
| **Scheduling** | Convex Crons (every 2 minutes) |
| **Styling** | Vanilla CSS with CSS custom properties, Google Fonts (Outfit + JetBrains Mono) |

### 3.3 Project Structure

```
whale-in-the-room/
├── convex/                     # Convex Backend (New)
│   ├── _generated/             # Auto-generated Convex files
│   ├── allium.ts               # pollWhaleActivity Action (fetches data)
│   ├── crons.ts                # Scheduler (every 2 minutes)
│   ├── schema.ts               # Database schema for signals
│   └── signals.ts              # Mutations (addSignal) and Queries (list)
├── src/
│   ├── main.ts                 # Local Orchestrator (Optional backup)
│   ├── allium-client.ts        # Local Allium API client
│   ├── polling-engine.ts       # Local continuous polling logic
│   ├── signal-evaluator.ts     # Signal detection & enrichment logic
│   ├── sql-templates.ts        # SQL queries for whale identification
│   ├── validate-chain.ts       # Chain compatibility validator
│   └── config/
│       └── contracts.json      # Known protocol contract addresses
├── data/
│   ├── tracked-wallets.json    # 6 identified whale wallets
│   ├── signals.json            # Local persisted signal history
│   └── watchlist.json          # User-created protocol watchlist
├── public/
│   └── index.html              # Live dashboard (Convex-integrated)
├── package.json
├── tsconfig.json
└── project-list.md             # Vertical-specific targeting reference
```

---

## 4. Features — Built (MVP)

### 4.1 Whale Identification via SQL

Three curated SQL queries execute against Allium's Explorer API to identify the top 3 highest-intent wallets per vertical:

| Vertical | Query Target | Threshold | Source Table |
|----------|-------------|-----------|-------------|
| **DeFi** | Top DEX traders on Aerodrome & Uniswap V3 (30d) | >$500k volume | `base.dex.trades` |
| **AI** | Top accumulators of VIRTUAL & OLAS tokens (30d) | >$100k USD inflow | `base.assets.erc20_token_transfers` |
| **SocialFi** | Most active Farcaster contract interactors (30d) | >50 transactions | `base.raw.transactions` |

**Output:** `data/tracked-wallets.json` — 6 wallets (3 DeFi + 3 AI; SocialFi query defined but not yet seeded).

### 4.2 Real-Time Polling Engine

- **Interval:** 60-second poll cycles
- **Chain:** Base (hardcoded)
- **API:** `POST /api/v1/developer/wallet/transactions`
- **Pre-Warm Phase:** On startup, fetches historical transactions for each wallet to populate `knownContracts` set — prevents false-positive signals on the first cycle
- **Budget:** ~6 API calls/minute (well under the 60/min capacity)

### 4.3 Signal Detection — "Signal A: New Contract Interaction"

The core (and currently only) signal type:

> **Trigger:** A tracked whale wallet interacts with a smart contract address it has **never** interacted with before.

This is the "alpha" — it means a whale is exploring a new protocol, which is a strong early indicator for Web3 marketers.

**Signal B (Large LP >$50k)** was designed but **stripped from MVP** to conserve API budget (would require additional `/prices/at-timestamp` calls per LP evaluation).

### 4.4 Signal Enrichment

Each detected signal is enriched with:

| Field | Description | Source |
|-------|-------------|--------|
| `actionability_score` | 1–5 🔥 scale based on 30d trading volume | Computed from wallet metadata |
| `is_first_mover` | `true` if this wallet is the *first* tracked whale to hit this contract | Global `seenContracts` set |
| `vertical_tag` | Inferred vertical (DeFi/AI/SocialFi) from protocol identification | `contracts.json` lookup |
| `common_neighbors` | Count of other tracked whales who also interacted with this contract | Cross-wallet set intersection |
| `display_name` | Simulated ENS/Farcaster identity (e.g. `vitalik.eth`) | Hardcoded social map |
| `persona` | Whale archetype label (e.g. "High-Freq Yield Farmer") | Hardcoded social map |
| `contract_protocol` | Named protocol if contract is known (e.g. "Aerodrome Finance") | `contracts.json` |
| `method_name` | Solidity method called (e.g. `addLiquidity`) | Transaction data |
| `tokens_involved` | Token symbols from token transfers in the transaction | Transaction data |

### 4.5 Rate Limiter

A priority-based queue system respecting Allium's **1 request/second** rate limit:

| Priority | Use Case |
|----------|----------|
| `CRITICAL (4)` | SQL query execution & results |
| `HIGH (3)` | Price lookups for triggered signals |
| `MEDIUM (2)` | Transaction polls (default) |
| `LOW (1)` | Balance snapshots |

Features:
- 1.1s minimum interval (safety margin)
- Exponential backoff on 429 (rate limit) responses
- Max 3 retries per request
- Stats tracking (total, success, rateLimited, errors)

### 4.6 API Server

Lightweight HTTP server on `localhost:3000`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Serves the dashboard HTML |
| `/api/signals` | GET | Returns the full signal array |
| `/api/status` | GET | Returns engine status (poll count, wallet states, API stats) |
| `/api/watchlist` | GET | Returns user's protocol watchlist |
| `/api/watchlist` | POST | Add/remove a contract address from watchlist |

### 4.7 Live Dashboard

A premium single-page application served at `localhost:3000`:

**Design System:**
- Dark obsidian background with ambient radial gradients
- Outfit (display) + JetBrains Mono (data) typography
- Color-coded verticals: Blue (DeFi), Purple (AI), Amber (SocialFi)
- Smooth slide-up animations for new signals
- Responsive grid layout (breakpoint at 1024px)

**UI Components:**
- **Status Badge** — Live engine status with green pulse dot and cycle counter
- **Filter Bar** — Toggle between All / DeFi / AI / SocialFi signals
- **Tracked Wallets Grid** — Cards showing ENS name, persona, address (linked to BaseScan), vertical tag, and known contract count
- **Signal Feed** — Reverse-chronological feed with:
  - Actionability fire scale (🔥)
  - ⚡ First Mover badge
  - Protocol identification
  - Common neighbors count
  - Mock sparkline chart (24h alpha trajectory)
  - **1-Click Share to X** — Pre-formatted tweet with whale alert
  - **Watch Protocol** toggle — Add/remove from personal watchlist

**Data Flow:** Polls `/api/signals` and `/api/status` every 5 seconds.

### 4.8 Chain Validation Script

`npm run validate` — Confirms Base chain support across all required Allium API endpoints before first run:
- 8 required endpoints (wallets, transactions, balances, prices, tokens)
- 1 optional endpoint (PnL)

### 4.9 Known Protocol Registry

`src/config/contracts.json` maps contract addresses to named protocols:

| Protocol | Type | Address |
|----------|------|---------|
| Aerodrome Finance | DEX Router | `0xcF77a3Ba9...` |
| Uniswap V3 | DEX Router | `0x2626664c2...` |
| Morpho Blue | Lending Core | `0xBBBBBbbBB...` |
| Virtual Protocol | AI Token | `0x0b3e32845...` |
| Autonolas (OLAS) | AI Token | `0x543330d28...` |

Also tracks Farcaster registry contracts (IdRegistry, KeyRegistry, StorageRegistry) and common LP method signatures.

---

## 5. Data Model

### 5.1 TrackedWallet

```typescript
interface TrackedWallet {
    address: string;           // Lowercase hex
    vertical: 'DeFi' | 'AI' | 'SocialFi';
    label: string;             // "DeFi Whale #1"
    knownContracts: Set<string>; // Populated at warm-up, grows over time
    lastSeenTxHash: string | null;
    volume_30d_usd?: number;   // From SQL identification query
}
```

### 5.2 MarketingSignal

```typescript
interface MarketingSignal {
    id: string;                   // "sig-1", "sig-2", ...
    type: 'NEW_CONTRACT';         // Only signal type in MVP
    wallet: string;               // Whale address
    vertical: Vertical;
    transaction_hash: string;
    target_contract: string;      // The new contract the whale interacted with
    timestamp: string;            // ISO block timestamp
    actionability_score: number;  // 1–5
    is_first_mover: boolean;
    vertical_tag: string | null;
    common_neighbors: number;
    display_name: string | null;  // ENS/Farcaster name
    persona: string | null;       // Whale archetype
    context: {
        wallet_label: string;
        contract_protocol?: string;
        tokens_involved?: string[];
        method_name?: string;
    };
}
```

### 5.3 Currently Tracked Wallets

| # | Label | Vertical | 30d Volume | Simulated Identity |
|---|-------|----------|------------|-------------------|
| 1 | DeFi Whale #1 | DeFi | $2.2B | vitalik.eth — "DeFi Architect & OG" |
| 2 | DeFi Whale #2 | DeFi | $1.9B | jesse.base.eth — "Base Ecosystem Lead" |
| 3 | DeFi Whale #3 | DeFi | $520M | whale_alpha.fc — "High-Freq Yield Farmer" |
| 4 | AI Whale #1 | AI | $11.7B | ai_visionary.eth — "AI Agent Collector" |
| 5 | AI Whale #2 | AI | $4.0B | bot_master.eth — "MEV & AI Integration Expert" |
| 6 | AI Whale #3 | AI | $3.6B | neural_net.eth — "DePIN & AI Infrastructure" |

---

## 6. NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run validate` | Confirm Base support on all Allium endpoints |
| `npm run identify` | Run whale identification SQL queries (via `--identify` flag) |
| `npm run monitor` | Start monitoring mode only (via `--monitor` flag) |
| `npm start` | Full pipeline: load wallets → warm-up → poll → serve dashboard |

---

## 7. API Integration — Allium

### 7.1 Endpoints Used

| Endpoint | Method | Purpose | Priority |
|----------|--------|---------|----------|
| `/api/v1/explorer/queries/{id}/run-async` | POST | Execute whale identification SQL | CRITICAL |
| `/api/v1/explorer/query-runs/{id}/status` | GET | Poll SQL query status | CRITICAL |
| `/api/v1/explorer/query-runs/{id}/results` | GET | Fetch SQL results | CRITICAL |
| `/api/v1/developer/wallet/transactions` | POST | Fetch recent transactions | MEDIUM |
| `/api/v1/developer/wallet/balances` | POST | Fetch token balances | LOW |
| `/api/v1/developer/prices` | POST | Get current token price | HIGH |
| `/api/v1/developer/prices/at-timestamp` | POST | Get historical token price | HIGH |
| `/api/v1/supported-chains/realtime-apis/simple` | GET | Chain validation | — |

### 7.2 Authentication

Credentials stored at `~/.allium/credentials`:
```
API_KEY=<key>
QUERY_ID=<id>
```

### 7.3 Response Format Notes (Learned During Build)

- **Wallet endpoints** return `{items: [...], cursor: "..."}` — not flat arrays. Client unwraps this.
- **SQL status endpoint** returns a raw JSON string (e.g. `"running"`) — not a JSON object. Client strips quotes.
- **SQL results endpoint** returns `{data: [...], sql: "...", meta: {...}}` — client extracts `data`.

---

## 8. Features — Planned / In Progress

### 8.1 Signal B: Large LP Position (Designed, Not Implemented)

> **Trigger:** A tracked whale adds >$50k in liquidity to any pool.

Stripped from MVP to conserve API budget. Would require:
- Detecting LP method signatures (`addLiquidity`, `mint`, `deposit`, etc.)
- `POST /api/v1/developer/prices/at-timestamp` for each token in the LP
- USD value estimation of LP position

### 8.2 Insight Engine Enrichment (Approved, In Progress)

The dashboard is being evolved from a monitoring tool into an **Insight Engine** for Web3 marketers. Approved enhancements include:

1. **Intent-Based Labeling** — Categorize signals beyond just "new contract"
   - First-Mover badges *(done ✅)*
   - Vertical tags *(done ✅)*
   - Actionability scores *(done ✅)*

2. **Social Proof Integration**
   - ENS/Farcaster name mapping *(simulated ✅, real lookup planned)*
   - Whale persona cards *(done ✅)*

3. **Contextual Data Overlays**
   - Mini sparkline charts *(done ✅, mock data)*
   - Common neighbors count *(done ✅)*

4. **Direct Action Triggers**
   - 1-Click Share to X *(done ✅)*
   - Watch Protocol toggle *(done ✅)*

### 8.3 Future Roadmap (Not Yet Approved)

| Feature | Priority | Description |
|---------|----------|-------------|
| **Real ENS/Farcaster Resolution** | High | Replace simulated social map with live lookups |
| **SocialFi Wallet Seeding** | High | Run the SocialFi SQL query and add wallets to tracking |
| **Persistent Storage** | Done ✅ | Migrated from JSON to Convex Database |
| **Gaming Vertical** | Medium | Add Gaming whale identification (NFT transfers, game txns) |
| **Signal B: Large LP** | Medium | Re-enable with API budget optimization |
| **Notifications** | Medium | Telegram/Discord webhook for high-score signals |
| **Historical Dashboard** | Low | Time-series view of signals over days/weeks |
| **Real Sparkline Data** | Low | Replace mock charts with actual on-chain activity data |
| **Multi-Chain Support** | Low | Extend beyond Base to Ethereum, Optimism, Arbitrum |

---

## 9. Constraints & Known Limitations

| Constraint | Impact | Mitigation |
|-----------|--------|------------|
| Allium rate limit: 1 req/sec | Limits number of tracked wallets | Priority queue + polling intervals |
| Wallet API returns paginated `{items}` | Must unwrap response envelopes | Client handles both formats |
| No real ENS/Farcaster resolution | Social identities are simulated | Hardcoded map for MVP; real API planned |
| Signal B stripped | No LP position alerts | Preserves API budget for Signal A |
| SocialFi wallets not yet seeded | Only DeFi + AI verticals active | SQL query defined, needs execution |
| JSON file persistence | No concurrent access safety | Migrated to Convex for safe cloud storage |
| Mock sparkline data | Charts don't reflect real activity | `generateMockPath()` placeholder |
| Single-file dashboard | Limited maintainability | Acceptable for MVP; component split planned |

---

## 10. How to Run

### Prerequisites
- Node.js ≥ 18
- Allium credentials (`ALLIUM_API_KEY`) set in Convex Dashboard

### Quick Start (Convex Engine)

```bash
# 1. Install dependencies
npm install

# 2. Deploy to Convex (Backend + Crons)
npx convex deploy

# 3. Serve the live dashboard
# Open public/index.html in a browser (or use a local server)
```

### Local Development Mode

```bash
# Start local engine (uses local JSON storage)
npm start

# Run whale identification SQL
npm run identify
```

---

## 11. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Wallets tracked | 9+ (3 per vertical) | 6 (3 DeFi + 3 AI) |
| Signal types | 2 (New Contract + Large LP) | 1 (New Contract only) |
| Poll interval | ≤60s | 60s ✅ |
| API budget usage | <60 calls/min | ~6 calls/min ✅ |
| False positive rate | <5% on startup | 0% (warm-up eliminates) ✅ |
| Dashboard load time | <2s | <1s (single HTML file) ✅ |
| Signal enrichment fields | 8+ per signal | 10 fields ✅ |

---

## 12. Glossary

| Term | Definition |
|------|-----------|
| **Signal A** | New Smart Contract Interaction — whale touches a contract for the first time |
| **Signal B** | Large LP Position (>$50k) — stripped from MVP |
| **First Mover** | The first tracked whale to interact with a specific contract |
| **Actionability Score** | 1–5 fire scale ranking signal importance based on wallet volume |
| **Common Neighbors** | Number of other tracked whales who also interacted with the same contract |
| **Warm-Up** | Startup phase that loads historical transactions to prevent false positives |
| **Vertical** | Market category: DeFi, AI, SocialFi, or Gaming |
| **KOL** | Key Opinion Leader — influential crypto figure |

---

*Built with 🐋 and powered by [Allium](https://allium.so)*
