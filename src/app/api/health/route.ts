/**
 * GET /api/health
 * Health check endpoint to verify API configuration
 */
import { NextResponse } from 'next/server';

export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      polymarketApiKey: !!process.env.POLY_BUILDER_API_KEY && process.env.POLY_BUILDER_API_KEY !== 'your-api-key-here',
      builderWallet: !!process.env.BUILDER_WALLET_ADDRESS && process.env.BUILDER_WALLET_ADDRESS !== '0xYourBuilderWalletAddress',
      database: !!process.env.DATABASE_URL,
      walletConnect: !!process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
      polygonRpc: !!process.env.POLYGON_RPC_URL || !!process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
      polymarketApiAccess: false, // will be updated below
    },
    status: 'ok' as 'ok' | 'degraded',
  };

  // Test Polymarket API connection (without exposing keys)
  if (checks.checks.polymarketApiKey) {
    try {
      const res = await fetch('https://gamma-api.polymarket.com/markets?limit=1', {
        next: { revalidate: 60 },
      });
      checks.checks.polymarketApiAccess = res.ok;
    } catch {
      checks.checks.polymarketApiAccess = false;
    }
  }

  // Overall health
  const allOk = Object.values(checks.checks).every(v => v === true);
  checks.status = allOk ? 'ok' : 'degraded';

  return NextResponse.json(checks);
}
