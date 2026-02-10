/**
 * Whale-In-The-Room: Signal Evaluator (MVP)
 * 
 * SIGNAL A ONLY: New Smart Contract Interaction
 * 
 * A marketing signal fires when a tracked whale wallet interacts
 * with a contract address it has NEVER interacted with before.
 * This is the "alpha" — it means a whale is exploring a new protocol.
 * 
 * Signal B (Large LP >$50k) is stripped from MVP to conserve API budget.
 * Each LP evaluation would require additional /prices/at-timestamp calls.
 */

import contracts from './config/contracts.json' assert { type: 'json' };

// ─── Types ───────────────────────────────────────────────────────────────────

export type Vertical = 'DeFi' | 'AI' | 'SocialFi';

export interface TrackedWallet {
    address: string;
    vertical: Vertical;
    label: string;
    knownContracts: Set<string>;
    lastSeenTxHash: string | null;
    volume_30d_usd?: number;
}

export interface MarketingSignal {
    id: string;
    type: 'NEW_CONTRACT';
    wallet: string;
    vertical: Vertical;
    transaction_hash: string;
    target_contract: string;
    timestamp: string;
    actionability_score: number;       // 1-5 fire scale
    is_first_mover: boolean;           // true if this is the first tracked wallet to hit this contract
    vertical_tag: string | null;       // inferred vertical
    common_neighbors: number;          // how many other tracked whales also interacted
    display_name: string | null;       // ENS/Farcaster name (simulated)
    persona: string | null;            // "High-Volume DeFi Trader" etc
    context: {
        wallet_label: string;
        contract_protocol?: string;
        tokens_involved?: string[];
        method_name?: string;
    };
}

export interface WalletTransaction {
    hash: string;
    from_address: string;
    to_address: string;
    value: string;
    block_timestamp: string;
    block_number: number;
    method_name?: string;
    token_transfers?: Array<{
        token_address: string;
        symbol: string;
        amount: number;
        usd_amount: number;
    }>;
}

// ─── Social Mapping (Simulated) ────────────────────────────────────────────────

const SOCIAL_MAP: Record<string, { name: string; persona: string }> = {
    "0x83d55acdc72027ed339d267eebaf9a41e47490d5": { name: "vitalik.eth", persona: "DeFi Architect & OG" },
    "0x3725bd4d175283108156c3f15f86e1c51266155d": { name: "jesse.base.eth", persona: "Base Ecosystem Lead" },
    "0x63242a4ea82847b20e506b63b0e2e2eff0cc6cb0": { name: "whale_alpha.fc", persona: "High-Freq Yield Farmer" },
    "0x3f0296bf652e19bca772ec3df08b32732f93014a": { name: "ai_visionary.eth", persona: "AI Agent Collector" },
    "0x9aec2cb83351bb03bab237985eff6464d2c58633": { name: "bot_master.eth", persona: "MEV & AI Integration Expert" },
    "0x7142956e69478524769fdf48b008ac9ce8fd74f2": { name: "neural_net.eth", persona: "DePIN & AI Infrastructure" }
};

// ─── Protocol Identifier ─────────────────────────────────────────────────────

const KNOWN_PROTOCOLS = new Map<string, string>();

// Build lookup from contracts.json
for (const [vName, config] of Object.entries(contracts.verticals)) {
    const verticalConfig = config as any;
    for (const [pName, project] of Object.entries(verticalConfig.projects)) {
        const p = project as any;
        if (p.router) KNOWN_PROTOCOLS.set(p.router.toLowerCase(), p.label);
        if (p.core) KNOWN_PROTOCOLS.set(p.core.toLowerCase(), p.label);
        if (p.token_address) KNOWN_PROTOCOLS.set(p.token_address.toLowerCase(), p.label);
        if (p.contracts) {
            for (const addr of Object.values(p.contracts)) {
                KNOWN_PROTOCOLS.set((addr as string).toLowerCase(), p.label);
            }
        }
    }
}

function identifyProtocol(address: string): string | undefined {
    return KNOWN_PROTOCOLS.get(address.toLowerCase());
}

// ─── Signal Evaluator ────────────────────────────────────────────────────────

export class SignalEvaluator {
    private signalLog: MarketingSignal[] = [];
    private signalCounter = 0;
    private globalSeenContracts = new Set<string>();
    private wallets: TrackedWallet[] = [];

    constructor(wallets: TrackedWallet[] = []) {
        this.wallets = wallets;
    }

    setWallets(wallets: TrackedWallet[]) {
        this.wallets = wallets;
    }

    /**
     * Evaluate new transactions for a tracked wallet.
     * Only fires on NEW contract interactions (Signal A).
     */
    evaluate(wallet: TrackedWallet, transactions: WalletTransaction[]): MarketingSignal[] {
        const signals: MarketingSignal[] = [];

        for (const tx of transactions) {
            // Skip if already processed
            if (wallet.lastSeenTxHash && tx.hash === wallet.lastSeenTxHash) break;
            if (!tx.to_address) continue;

            const toAddr = tx.to_address.toLowerCase();

            // Signal A: New contract interaction
            if (!wallet.knownContracts.has(toAddr)) {
                wallet.knownContracts.add(toAddr);

                // Enrichment Logic
                const isFirstMover = !this.globalSeenContracts.has(toAddr);
                this.globalSeenContracts.add(toAddr);

                const commonNeighbors = this.wallets.filter(w =>
                    w.address !== wallet.address && w.knownContracts.has(toAddr)
                ).length;

                const social = SOCIAL_MAP[wallet.address.toLowerCase()] || { name: null, persona: "Active Whale" };

                // Score based on 30d volume (simple ranking)
                const vol = wallet.volume_30d_usd || 0;
                let score = 1;
                if (vol > 5e9) score = 5;
                else if (vol > 1e9) score = 4;
                else if (vol > 5e8) score = 3;
                else if (vol > 1e8) score = 2;

                const signal: MarketingSignal = {
                    id: `sig-${++this.signalCounter}`,
                    type: 'NEW_CONTRACT',
                    wallet: wallet.address,
                    vertical: wallet.vertical,
                    transaction_hash: tx.hash,
                    target_contract: tx.to_address,
                    timestamp: tx.block_timestamp,
                    actionability_score: score,
                    is_first_mover: isFirstMover,
                    vertical_tag: identifyProtocol(tx.to_address) || wallet.vertical,
                    common_neighbors: commonNeighbors,
                    display_name: social.name,
                    persona: social.persona,
                    context: {
                        wallet_label: wallet.label,
                        contract_protocol: identifyProtocol(tx.to_address),
                        tokens_involved: tx.token_transfers?.map(t => t.symbol),
                        method_name: tx.method_name,
                    },
                };

                signals.push(signal);
                this.signalLog.push(signal);
                console.log(this.formatSignal(signal));
            }
        }

        // Update cursor
        if (transactions.length > 0) {
            wallet.lastSeenTxHash = transactions[0].hash;
        }

        return signals;
    }

    /**
     * Pre-warm: populate knownContracts from historical transactions.
     * Prevents false-positive signals on first poll cycle.
     */
    warmUp(wallet: TrackedWallet, transactions: WalletTransaction[]): number {
        let count = 0;
        for (const tx of transactions) {
            if (tx.to_address) {
                const toAddr = tx.to_address.toLowerCase();
                wallet.knownContracts.add(toAddr);
                this.globalSeenContracts.add(toAddr);
                count++;
            }
        }
        if (transactions.length > 0) {
            wallet.lastSeenTxHash = transactions[0].hash;
        }
        return count;
    }

    private formatSignal(signal: MarketingSignal): string {
        const protocol = signal.context.contract_protocol ? ` → ${signal.context.contract_protocol}` : '';
        const tokens = signal.context.tokens_involved?.filter(Boolean).join(', ') || '';
        const firstMover = signal.is_first_mover ? ' [⚡ FIRST MOVER]' : '';
        const fire = '🔥'.repeat(signal.actionability_score);
        const name = signal.display_name ? ` (${signal.display_name})` : '';

        return [
            ``,
            `🐋🆕 SIGNAL: ${signal.context.wallet_label}${name} hit new contract ${fire}${firstMover}`,
            `   Persona:   ${signal.persona}`,
            `   Contract:  ${signal.target_contract}${protocol} [${signal.vertical_tag}]`,
            `   Method:    ${signal.context.method_name || 'unknown'}`,
            `   Common:    ${signal.common_neighbors} other whales hold this`,
            `   Tokens:    ${tokens || 'N/A'}`,
            `   Tx:        ${signal.transaction_hash}`,
            `   Time:      ${signal.timestamp}`,
            `${'─'.repeat(60)}`,
        ].join('\n');
    }

    getSignalLog(): MarketingSignal[] {
        return [...this.signalLog];
    }

    getSignalCount(): number {
        return this.signalLog.length;
    }
}
