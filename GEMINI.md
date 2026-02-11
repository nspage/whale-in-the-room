# 🐋 Whale-In-The-Room Context

This project is a real-time Base chain alerting system that tracks Whale & KOL behavior across DeFi and AI verticals. It identifies high-value wallet activity and surfaces actionable marketing signals.

## Project Overview

- **Purpose:** Automate discovery-to-signal pipeline: identify whales via SQL → poll transactions in real-time → fire enriched marketing signals when whales explore new protocols.
- **Chain:** Base (Mainnet)
- **Data Source:** [Allium API](https://allium.so) (Explorer SQL, Wallet, Price APIs).
- **Core Signal:** **Signal A (New Contract Interaction)** — Fired when a tracked whale interacts with a smart contract for the first time.
- **Social Identity:** Dynamic lookup of Farcaster profiles (username, followers) via Allium SQL.

## Tech Stack

- **Runtime:** Node.js (ESM) via `tsx`.
- **Language:** TypeScript (Strict mode, ES2022).
- **Backend:** Native Node.js `http` module (no framework).
- **Frontend:** Single-file HTML/CSS/JS dashboard (`public/index.html`).
- **Persistence:** JSON files (`data/signals.json`, `data/tracked-wallets.json`) and **Convex** for cloud-based storage.
- **Client:** Custom `AlliumClient` with a priority-based rate limiter (1 req/sec).

## Architecture & Pipeline

1.  **Discovery (Optional):** SQL queries executed via Allium Explorer API to find top whales per vertical.
2.  **Cloud Engine (Convex):** 
    - **Actions:** `pollWhaleActivity` fetches the latest transactions from Allium for all tracked wallets.
    - **Mutations:** `addSignal` saves new signals to the database with duplicate transaction hash checks.
    - **Crons:** Automatically runs the polling action every 2 minutes.
3.  **Local Engine (Backup):** 
    - **Warm-Up:** Startup phase that fetches historical transactions to populate `knownContracts`.
    - **Polling:** Local Node.js loop polling Allium every 60 seconds.
4.  **Dashboard:** Live dashboard (`public/index.html`) using the Convex Client to subscribe to the `signals` table for real-time updates.

## Key Files

- `convex/schema.ts`: Database schema definition with indexes for efficient querying.
- `convex/allium.ts`: Convex Action for polling Allium Wallet API.
- `convex/signals.ts`: Convex Mutations and Queries for signal management.
- `convex/crons.ts`: Scheduler for automated cloud polling.
- `src/main.ts`: Local orchestrator for the Node.js monitoring engine.
- `public/index.html`: Real-time dashboard with Convex subscription.

## Building and Running

| Command | Description |
| :--- | :--- |
| `npm install` | Install dependencies (TypeScript, tsx, dotenv, convex). |
| `npx convex dev` | Start Convex development environment. |
| `npx convex deploy` | Deploy backend, schema, and crons to production. |
| `npm start` | Start the local Node.js monitoring engine. |
| `npm run identify` | Refresh tracked wallets via Allium SQL. |

## Development Conventions

- **Convex First:** New signals and data features should be implemented as Convex functions.
- **Environment Variables:** `ALLIUM_API_KEY` and `ALLIUM_QUERY_ID` must be set in the Convex dashboard.
- **Social Identity:** Signals are enriched with Farcaster data (`fc_username`, `fc_followers`) using Allium's `farcaster_profiles` table.
- **Real-time UI:** Use `ConvexClient` in the frontend for live data subscriptions.
- **Duplicate Prevention:** Always check `transaction_hash` before inserting signals in `addSignal`.
