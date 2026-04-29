# 🐋 Whale-In-The-Room: GEMINI.md

This file provides foundational context and technical mandates for AI agents working on the **Whale-In-The-Room** project.

## 🚀 Project Overview
**Whale-In-The-Room** is a real-time blockchain insight engine specialized for the **Base** network. It tracks "smart money" (Whales & KOLs) in the DeFi and AI verticals, identifying when they interact with new protocols to surface early marketing and investment alpha.

### Core Technologies
- **Data Source:** Allium API (Explorer SQL, Wallet Transactions, Prices, Social Identity).
- **Backend/Database:** [Convex](https://convex.dev) (Cloud Actions, Mutations, and Crons).
- **Social Identity:** Farcaster (via Allium social SQL tables).
- **Frontend:** Real-time dashboard (`public/index.html`) using the Convex Client.
- **Language:** TypeScript (ESM, strict mode).

---

## 🏗 System Architecture & Workflows

### 1. Whale Discovery (`Cohort` Management)
The system maintains two cohorts: **AI** and **DeFi**.
- **Discovery:** `convex/allium.ts:refreshCohort` runs async SQL on Allium Explorer to find the top 50 high-volume wallets per vertical.
- **Storage:** These are stored in the `cohorts` table with rank and 7-day volume.

### 2. Real-Time Polling Engine
- **Scheduler:** `convex/crons.ts` triggers `pollWhaleActivity` every **2 minutes**.
- **Identity Enrichment:** The engine lookups Farcaster profiles and wallet net worth (balances) for all cohort members during each poll.
- **Signal Detection:** Detects `NEW_CONTRACT` interactions by comparing recent transactions against known protocol signatures or identifying first-time calls to any contract.
- **Signal Enrichment:** Signals are enriched with:
  - **Actionability Score:** 1-5 🔥 scale based on whale rank and net worth.
  - **Social Proof:** Farcaster handle, followers, and KOL badges.
  - **Context:** Method names, token flows, and protocol labels (via `src/config/contracts.json`).

### 3. Data Flow
`Allium API (External)` -> `Convex Actions (Fetch)` -> `Convex Mutations (Store)` -> `Convex Queries (Dashboard Subscription)`

---

## 🛠 Building and Running

### Prerequisites
- Node.js ≥ 18
- `ALLIUM_API_KEY` and `ALLIUM_QUERY_ID` set in Convex Environment Variables.

### Key Commands
| Command | Purpose |
|---------|---------|
| `npm install` | Install dependencies. |
| `npx convex dev` | Start Convex development mode (local sync + cloud functions). |
| `npx convex deploy` | Deploy backend logic and crons to production. |
| `npm run validate` | Verify Allium API support for the Base chain. |
| `npm run identify` | Local script to run whale identification SQL templates. |
| `npm start` | Run the full local pipeline (Optional backup to Convex). |

---

## 📜 Development Conventions

### 🔒 Security & API Integrity
- **Rate Limiting:** Allium has a **1 request/second** limit. Always use batching (max 20 wallets per request) and include a minimum **1.1s delay** between API calls in Convex Actions.
- **Environment Variables:** Never hardcode API keys. Use `process.env.ALLIUM_API_KEY`.

### 🛠 Technical Standards
- **Explicit Types:** Use strict TypeScript. Define Zod-like validators using Convex `v` in `schema.ts`.
- **Action vs. Mutation:** Use **Actions** for external API calls (fetch) and **Mutations** for database writes. Actions MUST NOT write to the DB directly; they must call mutations.
- **Base Chain Focus:** All queries and API calls are currently hardcoded for the `base` chain.

### 🧪 Verification Protocol
- **Reproduction:** Before fixing a polling bug, verify the Allium response format (it often returns `{items: [...]}` rather than flat arrays).
- **Build Pre-Flight:** Always run `npx convex dev --once` to verify schema and function compilation before deploying.

---

## 📂 Key File Map
- `convex/schema.ts`: Database definitions (Signals, Cohorts, Audiences).
- `convex/allium.ts`: Main logic for fetching data from Allium API.
- `convex/signals.ts`: DB mutations and queries for signal handling.
- `src/sql-templates.ts`: Raw SQL used for whale discovery.
- `src/config/contracts.json`: Registry of known protocol addresses and vertical mapping.
- `public/index.html`: The live dashboard (Subscribes to `signals` query).
