# 🐋 Whale-In-The-Room: Custom Insight Engine

A modular, real-time blockchain alerting system for tracking Whale & KOL behavior on Base. This engine identifies high-value wallets via SQL, polls their activity in real-time via the Allium Wallet API, and surfaces actionable marketing signals to a live Convex dashboard.

**[Live Demo](https://allium-test-sigma.vercel.app/)** (If deployed) | **Made with [Allium](https://allium.so) & [Convex](https://convex.dev)**

---

## 🚀 Overview
Whale-In-The-Room automates the discovery-to-signal pipeline. It targets the "smart money" by detecting **Signal A: First-Time Interactions**. When a tracked whale interacts with a contract they've never touched before, the engine fires a signal enriched with social identity (Farcaster), net worth, and protocol context.

## 🛠 Tech Stack
- **Data Source:** [Allium API](https://allium.so) (Explorer SQL, Wallet Transactions, Prices).
- **Backend/DB:** [Convex](https://convex.dev) (Cloud Actions, Mutations, and Crons).
- **Runtime:** Node.js with `tsx` for local identification jobs.
- **Frontend:** Single-file HTML/CSS/JS dashboard using the Convex Client for real-time subscriptions.

---

## 🎯 How to Customize for Your Own Project

This repository is a template. You can easily retarget it to monitor different verticals (e.g., Gaming, RWAs, Memecoins) or specific protocols.

### 1. Configure Your Target Protocols
Update `src/config/contracts.json` to define the "known world" for your engine. This allows the system to label transactions (e.g., "Whale swapped on Aerodrome").

```json
{
  "verticals": {
    "MyVertical": {
      "projects": {
        "my_project": {
          "label": "Project Name",
          "token_address": "0x...",
          "description": "Custom project description"
        }
      }
    }
  }
}
```

### 2. Customize Whale Discovery
Whales are identified via SQL queries in `src/sql-templates.ts`. Modify these to target your specific niche:
- **DeFi:** High DEX volume or LP positioning.
- **Gaming:** High NFT transaction counts or specific game-contract interactions.
- **AI/Memes:** Accumulation of specific token sets (e.g., VIRTUAL, AIXBT).

### 3. Deploy the Cloud Engine
The real-time polling runs on Convex.
- Deploy the schema and functions: `npx convex deploy`
- Set your `ALLIUM_API_KEY` in the Convex Dashboard environment variables.
- The system will automatically start polling every 2 minutes via `convex/crons.ts`.

---

## 🏁 Getting Started

### Prerequisites
- Node.js ≥ 18
- An Allium API Key ([Get one here](https://allium.so))
- A Convex project ([Setup here](https://convex.dev))

### Installation
```bash
npm install
```

### 1. Identify Your Cohort
Run the identification job to find the whales you want to track based on your SQL templates:
```bash
npm run identify
```
This populates `data/tracked-wallets.json`, which is then synced to your Convex database.

### 2. Start Polling
You can run the engine locally for testing:
```bash
npm start
```
Or deploy for 24/7 cloud monitoring:
```bash
npx convex deploy
```

### 3. Launch Dashboard
Open `public/index.html` in your browser. It uses the `ConvexClient` to listen for new signals as they are inserted into your cloud database.

---

## 📊 Key Features to Explore
- **Signal A (New Contract):** Fires when a whale explores a new protocol.
- **Find Similar Wallets:** Uses real-time Allium SQL to find 50 "lookalike" wallets interacting with a specific contract.
- **Farcaster Enrichment:** Automatically maps wallet addresses to Farcaster profiles (usernames, followers).
- **Actionability Scoring:** Fires are calculated based on whale volume and protocol growth.

---

## 📜 License
This project is licensed under the ISC License.

*Built with 🐋 for the Base ecosystem.*
