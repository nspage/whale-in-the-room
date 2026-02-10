/**
 * Whale-In-The-Room: Polling Engine (MVP)
 * 
 * Continuous monitoring with pre-warm step.
 * 
 * Startup:
 *   1. Fetch last N transactions per wallet to populate knownContracts (warm-up)
 *   2. Start polling loop
 * 
 * Runtime:
 *   - Transaction poll every 60s (6 wallets = 6 API calls/min)
 *   - All calls flow through the rate limiter (1.1s spacing)
 *   - Total budget: ~6 calls/min — well under 60/min capacity
 * 
 * Signal B (LP) stripped → no balance or price polls needed.
 */

import { AlliumClient } from './allium-client.js';
import { SignalEvaluator, TrackedWallet, MarketingSignal, WalletTransaction } from './signal-evaluator.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const TX_POLL_INTERVAL_MS = 60_000; // 60 seconds
const CHAIN = 'base';

// ─── Polling Engine ──────────────────────────────────────────────────────────

export class PollingEngine {
    private client: AlliumClient;
    private evaluator: SignalEvaluator;
    private wallets: TrackedWallet[] = [];
    private txTimer: ReturnType<typeof setInterval> | null = null;
    private running = false;
    private pollCount = 0;
    private onSignal?: (signal: MarketingSignal) => void;

    constructor(client: AlliumClient, onSignal?: (signal: MarketingSignal) => void) {
        this.client = client;
        this.evaluator = new SignalEvaluator();
        this.onSignal = onSignal;
    }

    setWallets(wallets: TrackedWallet[]) {
        this.wallets = wallets;
        this.evaluator.setWallets(wallets);
    }

    /**
     * Pre-warm: fetch historical transactions to populate knownContracts.
     * This prevents every first transaction from being a false-positive signal.
     */
    async warmUp(): Promise<void> {
        console.log(`\n🔥 Pre-warming known contracts for ${this.wallets.length} wallets...`);

        for (const wallet of this.wallets) {
            try {
                const transactions = await this.client.getWalletTransactions(CHAIN, wallet.address);

                if (transactions && Array.isArray(transactions)) {
                    const count = this.evaluator.warmUp(wallet, transactions);
                    console.log(`   ✅ ${wallet.label}: ${count} known contracts loaded`);
                } else {
                    console.log(`   ⚠️  ${wallet.label}: no transaction history`);
                }
            } catch (error: any) {
                console.error(`   ❌ ${wallet.label}: warm-up failed — ${error.message}`);
            }
        }

        const totalKnown = this.wallets.reduce((s, w) => s + w.knownContracts.size, 0);
        console.log(`\n   📊 Total known contracts cached: ${totalKnown}`);
        console.log(`   🛡️  False-positive protection: ACTIVE\n`);
    }

    /**
     * Start the polling loop. Must call warmUp() first.
     */
    start() {
        if (this.running) return;
        this.running = true;

        console.log(`🚀 Polling engine started`);
        console.log(`   Wallets:  ${this.wallets.length}`);
        console.log(`   Interval: ${TX_POLL_INTERVAL_MS / 1000}s`);
        console.log(`   Budget:   ~${this.wallets.length} calls/min (limit: 60/min)\n`);

        // First poll after a short delay
        setTimeout(() => this.pollCycle(), 5000);
        this.txTimer = setInterval(() => this.pollCycle(), TX_POLL_INTERVAL_MS);
    }

    stop() {
        this.running = false;
        if (this.txTimer) clearInterval(this.txTimer);
        console.log('\n⏹️  Polling engine stopped');
        console.log(`   Cycles completed: ${this.pollCount}`);
        console.log(`   Signals detected: ${this.evaluator.getSignalCount()}`);
        console.log(`   API stats: ${JSON.stringify(this.client.getStats())}`);
    }

    private async pollCycle() {
        this.pollCount++;
        const ts = new Date().toISOString().slice(11, 19);
        console.log(`⏱️  [${ts}] Poll cycle #${this.pollCount}`);

        for (const wallet of this.wallets) {
            if (!this.running) break;

            try {
                const transactions: WalletTransaction[] = await this.client.getWalletTransactions(CHAIN, wallet.address);

                if (!transactions || !Array.isArray(transactions) || transactions.length === 0) continue;

                const signals = this.evaluator.evaluate(wallet, transactions);
                for (const signal of signals) {
                    this.onSignal?.(signal);
                }
            } catch (error: any) {
                if (error?.status !== 429) {
                    console.error(`   ❌ ${wallet.label}: ${error.message}`);
                }
                // 429s are handled by the rate limiter with retry
            }
        }
    }

    getSignalLog() {
        return this.evaluator.getSignalLog();
    }

    getStatus() {
        return {
            running: this.running,
            pollCount: this.pollCount,
            signalCount: this.evaluator.getSignalCount(),
            wallets: this.wallets.map(w => ({
                label: w.label,
                vertical: w.vertical,
                address: w.address,
                knownContracts: w.knownContracts.size,
            })),
            apiStats: this.client.getStats(),
        };
    }
}
