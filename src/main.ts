/**
 * 🐋 Whale-In-The-Room: Main Orchestrator (MVP)
 * 
 * Simplified pipeline:
 *   1. Load hardcoded wallets from data/tracked-wallets.json
 *   2. Pre-warm knownContracts (fetch historical txns)
 *   3. Start polling loop (Signal A: New Contract only)
 *   4. Serve live dashboard on localhost:3000
 * 
 * Usage:
 *   npx tsx src/main.ts
 * 
 * Powered by Allium
 */

import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import { AlliumClient } from './allium-client.js';
import { PollingEngine } from './polling-engine.js';
import { TrackedWallet, MarketingSignal } from './signal-evaluator.js';

// ─── Paths ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WALLETS_PATH = path.join(__dirname, '..', 'data', 'tracked-wallets.json');
const SIGNALS_PATH = path.join(__dirname, '..', 'data', 'signals.json');
const WATCHLIST_PATH = path.join(__dirname, '..', 'data', 'watchlist.json');
const DASHBOARD_PATH = path.join(__dirname, '..', 'public', 'index.html');

// ─── State ───────────────────────────────────────────────────────────────────

const signals: MarketingSignal[] = [];
const watchlist: string[] = [];
let engine: PollingEngine;

// ─── Banner ──────────────────────────────────────────────────────────────────

function printBanner() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   🐋  W H A L E - I N - T H E - R O O M                     ║
║                                                              ║
║   Real-Time Base Chain Alerting System                       ║
║   Verticals: DeFi · AI                                       ║
║   Signal: New Smart Contract Interactions                    ║
║                                                              ║
║   Powered by Allium                                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);
}

// ─── Load Wallets ────────────────────────────────────────────────────────────

function loadWallets(): TrackedWallet[] {
    if (!fs.existsSync(WALLETS_PATH)) {
        throw new Error(`Wallets file not found: ${WALLETS_PATH}\nRun the identification SQL queries first.`);
    }

    const raw = JSON.parse(fs.readFileSync(WALLETS_PATH, 'utf-8'));
    return raw.map((w: any) => ({
        address: w.address.toLowerCase(),
        vertical: w.vertical,
        label: w.label,
        knownContracts: new Set<string>(),
        lastSeenTxHash: null,
        volume_30d_usd: w.volume_30d_usd,
    }));
}

// ─── Load Watchlist ──────────────────────────────────────────────────────────

function loadWatchlist() {
    if (fs.existsSync(WATCHLIST_PATH)) {
        const raw = JSON.parse(fs.readFileSync(WATCHLIST_PATH, 'utf-8'));
        watchlist.push(...raw);
    }
}

// ─── Signal Handler ──────────────────────────────────────────────────────────

function handleSignal(signal: MarketingSignal) {
    signals.push(signal);

    // Persist to disk
    const dir = path.dirname(SIGNALS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SIGNALS_PATH, JSON.stringify(signals, null, 2));
}

// ─── Dashboard Server ────────────────────────────────────────────────────────

function startDashboard(port: number) {
    const server = http.createServer((req, res) => {
        // CORS Headers
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Content-Type': 'application/json'
        };

        if (req.method === 'OPTIONS') {
            res.writeHead(204, headers);
            res.end();
            return;
        }

        // API: live signals
        if (req.url === '/api/signals') {
            res.writeHead(200, headers);
            res.end(JSON.stringify(signals));
            return;
        }

        // API: engine status
        if (req.url === '/api/status') {
            res.writeHead(200, headers);
            res.end(JSON.stringify(engine?.getStatus() || {}));
            return;
        }

        // API: watchlist (GET & POST)
        if (req.url === '/api/watchlist') {
            if (req.method === 'GET') {
                res.writeHead(200, headers);
                res.end(JSON.stringify(watchlist));
                return;
            }
            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', () => {
                    try {
                        const { address, action } = JSON.parse(body);
                        const addr = address.toLowerCase();
                        if (action === 'add' && !watchlist.includes(addr)) {
                            watchlist.push(addr);
                        } else if (action === 'remove') {
                            const idx = watchlist.indexOf(addr);
                            if (idx > -1) watchlist.splice(idx, 1);
                        }
                        fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
                        res.writeHead(200, headers);
                        res.end(JSON.stringify({ success: true, watchlist }));
                    } catch {
                        res.writeHead(400, headers);
                        res.end(JSON.stringify({ error: 'Invalid payload' }));
                    }
                });
                return;
            }
        }

        // Serve dashboard HTML
        if (req.url === '/' || req.url === '/index.html') {
            if (fs.existsSync(DASHBOARD_PATH)) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(fs.readFileSync(DASHBOARD_PATH, 'utf-8'));
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end('<html><body><h1>Dashboard loading...</h1><script>setTimeout(()=>location.reload(),2000)</script></body></html>');
            }
            return;
        }

        res.writeHead(404);
        res.end('Not found');
    });

    server.listen(port, () => {
        console.log(`\n📺 Dashboard live at http://localhost:${port}`);
        console.log(`   API endpoints:`);
        console.log(`     GET /api/signals    — enriched signal feed`);
        console.log(`     GET /api/status     — engine status`);
        console.log(`     GET /api/watchlist  — protocol watchlist\n`);
    });
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    printBanner();

    // 1. Load data
    const wallets = loadWallets();
    loadWatchlist();

    console.log(`📌 Loaded ${wallets.length} tracked wallets:`);
    for (const w of wallets) {
        const vol = w.volume_30d_usd ? ` ($${(w.volume_30d_usd / 1e6).toFixed(0)}M 30d vol)` : '';
        console.log(`   [${w.vertical}] ${w.label}: ${w.address.slice(0, 14)}...${vol}`);
    }

    // 2. Initialize client and engine
    const client = new AlliumClient();
    engine = new PollingEngine(client, handleSignal);
    engine.setWallets(wallets);

    // 3. Start dashboard
    startDashboard(3000);

    // 4. Pre-warm known contracts
    await engine.warmUp();

    // 5. Start polling
    engine.start();

    // Graceful shutdown
    const shutdown = () => {
        console.log('\n\n🛑 Shutting down...');
        engine.stop();

        if (signals.length > 0) {
            console.log(`\n📊 Session: ${signals.length} signal(s)`);
            for (const s of signals) {
                console.log(`   🐋 ${s.context.wallet_label} → ${s.target_contract.slice(0, 18)}...`);
            }
        }

        console.log('\nPowered by Allium 🔗\n');
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((err) => {
    console.error('\n💥 Fatal:', err.message);
    process.exit(1);
});
