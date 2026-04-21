/**
 * Market Expiry Worker
 * Runs hourly — scans all markets, identifies those past their end_time,
 * and enqueues an oracle-finalize job for each unresolved expired market.
 *
 * Uses a Redis SET to track already-enqueued markets (dedup across runs).
 */

import IORedis from 'ioredis';
import { Queue } from 'bullmq';
import type { OracleFinalizeJob } from '@/lib/queue';

const PROCESSED_KEY = 'market-expiry:processed'; // Redis SET of already-queued market IDs

async function fetchExpiredMarkets(): Promise<Array<{ marketId: string; address: string }>> {
  // Query the factory via Soroban RPC for all registered markets
  // In production this comes from the on-chain factory get_all_markets() view call
  // For now we also read from the local DB for markets we tracked during creation
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/markets/expired`, {
      headers: { 'x-cron-secret': process.env.CRON_SECRET ?? '' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    // API returns { conditionId, title, category, createdAt } — conditionId IS the market address
    return (data.markets ?? []).map((m: { conditionId: string }) => ({
      marketId: m.conditionId,
      address: m.conditionId,
    }));
  } catch (err) {
    console.error('[market-expiry] failed to fetch expired markets:', err);
    return [];
  }
}

export async function runMarketExpiry(
  redis: IORedis,
  oracleFinalizeQueue: Queue<OracleFinalizeJob>,
): Promise<void> {
  console.log('[market-expiry] scanning for expired markets...');

  const expired = await fetchExpiredMarkets();
  if (expired.length === 0) {
    console.log('[market-expiry] no expired markets found');
    return;
  }

  let enqueued = 0;
  for (const market of expired) {
    // Dedup — skip if already queued
    const alreadyQueued = await redis.sismember(PROCESSED_KEY, market.marketId);
    if (alreadyQueued) continue;

    await oracleFinalizeQueue.add(
      `finalize:${market.marketId}`,
      { marketId: market.marketId, proposalAddress: market.address },
      { jobId: `finalize:${market.marketId}` }, // idempotent job ID
    );

    await redis.sadd(PROCESSED_KEY, market.marketId);
    enqueued++;
  }

  console.log(`[market-expiry] enqueued ${enqueued} markets for oracle finalization`);
}
