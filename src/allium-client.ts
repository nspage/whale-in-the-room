/**
 * Whale-In-The-Room: Allium API Client
 * 
 * Core HTTP client respecting the 1 req/sec rate limit with
 * priority-based queueing for all Allium API calls.
 */

import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AlliumCredentials {
    apiKey: string;
    queryId: string;
}

interface QueueItem<T = any> {
    id: string;
    apiCall: () => Promise<T>;
    priority: number;
    resolve: (value: T) => void;
    reject: (reason: any) => void;
    retries: number;
}

export interface WalletBalance {
    chain: string;
    address: string;
    tokens: Array<{
        token_address: string;
        symbol: string;
        name: string;
        balance: number;
        usd_value: number;
    }>;
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

export interface ExplorerRunResult {
    run_id: string;
}

export interface ExplorerStatus {
    status: 'created' | 'queued' | 'running' | 'success' | 'failed';
    error?: string;
}

// ─── Priority Levels ─────────────────────────────────────────────────────────

export enum Priority {
    LOW = 1,       // Balance snapshots
    MEDIUM = 2,    // Transaction polls
    HIGH = 3,      // Price lookups for triggered signals
    CRITICAL = 4,  // SQL query results
}

// ─── Rate Limiter ────────────────────────────────────────────────────────────

export class AlliumRateLimiter {
    private queue: QueueItem[] = [];
    private lastCallTimestamp: number = 0;
    private readonly MIN_INTERVAL_MS = 1100; // 1.1s safety margin
    private readonly MAX_RETRIES = 3;
    private processing = false;
    private stats = { total: 0, success: 0, rateLimited: 0, errors: 0 };

    getStats() { return { ...this.stats, queueLength: this.queue.length }; }

    async enqueue<T>(apiCall: () => Promise<T>, priority: Priority = Priority.MEDIUM, label?: string): Promise<T> {
        return new Promise((resolve, reject) => {
            const id = label || `call-${++this.stats.total}`;
            this.queue.push({ id, apiCall, priority, resolve, reject, retries: 0 });
            this.queue.sort((a, b) => b.priority - a.priority);
            if (!this.processing) this.processNext();
        });
    }

    private async processNext(): Promise<void> {
        if (this.queue.length === 0) {
            this.processing = false;
            return;
        }

        this.processing = true;
        const elapsed = Date.now() - this.lastCallTimestamp;

        if (elapsed < this.MIN_INTERVAL_MS) {
            const waitMs = this.MIN_INTERVAL_MS - elapsed;
            await this.sleep(waitMs);
        }

        const item = this.queue.shift()!;
        this.lastCallTimestamp = Date.now();

        try {
            const result = await item.apiCall();
            this.stats.success++;
            item.resolve(result);
        } catch (error: any) {
            if (error?.status === 429 && item.retries < this.MAX_RETRIES) {
                // Rate limited — re-enqueue with backoff
                this.stats.rateLimited++;
                item.retries++;
                const backoffMs = Math.pow(2, item.retries) * 1000;
                console.warn(`⚠️  [${item.id}] Rate limited. Retry ${item.retries}/${this.MAX_RETRIES} in ${backoffMs}ms`);
                await this.sleep(backoffMs);
                this.queue.push(item);
                this.queue.sort((a, b) => b.priority - a.priority);
            } else {
                this.stats.errors++;
                item.reject(error);
            }
        }

        // Continue processing
        this.processNext();
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ─── Allium Client ───────────────────────────────────────────────────────────

export class AlliumClient {
    private readonly baseUrl = 'https://api.allium.so';
    private readonly apiKey: string;
    private readonly queryId: string;
    private readonly rateLimiter: AlliumRateLimiter;

    constructor(credentials?: AlliumCredentials) {
        const creds = credentials || this.loadCredentials();
        this.apiKey = creds.apiKey;
        this.queryId = creds.queryId;
        this.rateLimiter = new AlliumRateLimiter();
    }

    private loadCredentials(): AlliumCredentials {
        const credPath = path.join(homedir(), '.allium', 'credentials');
        if (!fs.existsSync(credPath)) {
            throw new Error(
                `Allium credentials not found at ${credPath}.\n` +
                `Register: curl -X POST https://api.allium.so/api/v1/register -H "Content-Type: application/json" -d '{"name":"...","email":"..."}'`
            );
        }
        const content = fs.readFileSync(credPath, 'utf-8');
        const apiKey = content.match(/API_KEY=(.+)/)?.[1]?.trim();
        const queryId = content.match(/QUERY_ID=(.+)/)?.[1]?.trim();
        if (!apiKey || !queryId) throw new Error('Invalid credentials file format. Expected API_KEY=... and QUERY_ID=...');
        return { apiKey, queryId };
    }

    private async request<T>(method: string, endpoint: string, body?: any, priority?: Priority, label?: string): Promise<T> {
        return this.rateLimiter.enqueue<T>(async () => {
            const url = `${this.baseUrl}${endpoint}`;
            const headers: Record<string, string> = {
                'X-API-KEY': this.apiKey,
                'Content-Type': 'application/json',
            };

            const options: RequestInit = { method, headers };
            if (body) options.body = JSON.stringify(body);

            const response = await fetch(url, options);

            if (!response.ok) {
                const error: any = new Error(`Allium API ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.body = await response.text().catch(() => '');
                throw error;
            }

            return response.json() as T;
        }, priority, label);
    }

    // ─── Wallet Endpoints ──────────────────────────────────────────────────────
    // NOTE: Wallet endpoints return {items: [...], cursor: "..."} not flat arrays

    async getWalletTransactions(chain: string, address: string): Promise<WalletTransaction[]> {
        const response = await this.request<any>(
            'POST',
            '/api/v1/developer/wallet/transactions',
            [{ chain, address }],
            Priority.MEDIUM,
            `tx:${address.slice(0, 8)}`
        );
        // Unwrap {items: [...]} envelope
        if (response && typeof response === 'object' && 'items' in response) {
            return response.items || [];
        }
        return Array.isArray(response) ? response : [];
    }

    async getWalletBalances(chain: string, address: string): Promise<WalletBalance[]> {
        const response = await this.request<any>(
            'POST',
            '/api/v1/developer/wallet/balances',
            [{ chain, address }],
            Priority.LOW,
            `bal:${address.slice(0, 8)}`
        );
        // Unwrap {items: [...]} envelope
        if (response && typeof response === 'object' && 'items' in response) {
            return response.items || [];
        }
        return Array.isArray(response) ? response : [];
    }

    // ─── Price Endpoints ───────────────────────────────────────────────────────

    async getPrice(chain: string, tokenAddress: string): Promise<any> {
        return this.request(
            'POST',
            '/api/v1/developer/prices',
            [{ chain, token_address: tokenAddress }],
            Priority.HIGH,
            `price:${tokenAddress.slice(0, 8)}`
        );
    }

    async getPriceAtTimestamp(chain: string, tokenAddress: string, timestamp: number): Promise<any> {
        return this.request(
            'POST',
            '/api/v1/developer/prices/at-timestamp',
            { chain, token_address: tokenAddress, timestamp },
            Priority.HIGH,
            `price-at:${tokenAddress.slice(0, 8)}`
        );
    }

    // ─── Explorer SQL ──────────────────────────────────────────────────────────

    async runSQL(sql: string): Promise<any[]> {
        // Start async query
        const run = await this.request<ExplorerRunResult>(
            'POST',
            `/api/v1/explorer/queries/${this.queryId}/run-async`,
            { parameters: { sql_query: sql } },
            Priority.CRITICAL,
            'sql:start'
        );

        const runId = run.run_id;
        console.log(`   📋 Query started: ${runId}`);

        // Poll for completion
        // NOTE: Status endpoint returns a raw string ("running", "success", "failed")
        // not a JSON object like {status: "..."}
        let statusStr: string = '';
        let attempts = 0;
        const maxAttempts = 30;

        do {
            await new Promise(r => setTimeout(r, 3000)); // 3s intervals
            statusStr = await this.request<string>(
                'GET',
                `/api/v1/explorer/query-runs/${runId}/status`,
                undefined,
                Priority.CRITICAL,
                `sql:poll:${attempts}`
            );
            // The API returns a raw JSON string like "running" — strip quotes if needed
            if (typeof statusStr === 'string') {
                statusStr = statusStr.replace(/"/g, '');
            }
            attempts++;
            if (attempts % 3 === 0) console.log(`   ⏳ Still running... (${attempts * 3}s)`);
        } while (['created', 'queued', 'running'].includes(statusStr) && attempts < maxAttempts);

        if (statusStr !== 'success') {
            throw new Error(`SQL query failed: status="${statusStr}" after ${attempts * 3}s`);
        }

        console.log(`   ✅ Query completed in ~${attempts * 3}s`);

        // Fetch results — API returns {data: [...], sql: "...", meta: {...}}
        const response = await this.request<{ data: any[]; sql: string; meta: any }>(
            'GET',
            `/api/v1/explorer/query-runs/${runId}/results?f=json`,
            undefined,
            Priority.CRITICAL,
            'sql:results'
        );

        // Extract data array from wrapper
        if (response && typeof response === 'object' && 'data' in response) {
            return response.data;
        }
        // Fallback: if response is already an array
        if (Array.isArray(response)) {
            return response;
        }
        return [];
    }

    getStats() {
        return this.rateLimiter.getStats();
    }
}
