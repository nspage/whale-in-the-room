/**
 * 🐋 Whale-In-The-Room: Chain Validation Script
 * 
 * Validates that Base chain is supported on all required Allium endpoints.
 * Run this first to confirm API compatibility.
 * 
 * Usage: npx tsx src/validate-chain.ts
 */

const REQUIRED_ENDPOINTS = [
    '/api/v1/developer/wallet/balances',
    '/api/v1/developer/wallet/transactions',
    '/api/v1/developer/wallet/balances/history',
    '/api/v1/developer/prices',
    '/api/v1/developer/prices/history',
    '/api/v1/developer/prices/at-timestamp',
    '/api/v1/developer/tokens',
    '/api/v1/developer/tokens/search',
];

const OPTIONAL_ENDPOINTS = [
    '/api/v1/developer/wallet/pnl',
];

async function main() {
    console.log('🔗 Validating Base chain support on Allium endpoints...\n');

    const response = await fetch('https://api.allium.so/api/v1/supported-chains/realtime-apis/simple');
    if (!response.ok) {
        throw new Error(`Failed to fetch supported chains: ${response.status}`);
    }

    const data = await response.json() as Record<string, string[]>;
    let allPassed = true;

    console.log('Required Endpoints:');
    for (const ep of REQUIRED_ENDPOINTS) {
        const chains = data[ep] || [];
        const supported = chains.includes('base');
        const icon = supported ? '✅' : '❌';
        console.log(`  ${icon} ${ep}`);
        if (!supported) allPassed = false;
    }

    console.log('\nOptional Endpoints:');
    for (const ep of OPTIONAL_ENDPOINTS) {
        const chains = data[ep] || [];
        const supported = chains.includes('base');
        const icon = supported ? '✅' : '⚠️ ';
        console.log(`  ${icon} ${ep}${!supported ? ' (Base not supported — will derive from other endpoints)' : ''}`);
    }

    console.log(`\n${allPassed ? '✅ All required endpoints support Base!' : '❌ Some required endpoints do NOT support Base.'}`);
    console.log('\nPowered by Allium 🔗');

    process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
    console.error('💥 Validation failed:', err.message);
    process.exit(1);
});
