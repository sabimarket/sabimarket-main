/**
 * GET /api/health
 * Health check endpoint for Railway and uptime monitors
 */
import { NextResponse } from 'next/server';

export async function GET() {
  let redisPing = false;
  if (process.env.REDIS_URL) {
    try {
      const IORedis = (await import('ioredis')).default;
      const redis = new IORedis(process.env.REDIS_URL, { lazyConnect: true, connectTimeout: 2000, enableOfflineQueue: false });
      await redis.connect();
      await redis.ping();
      redisPing = true;
      redis.disconnect();
    } catch {
      redisPing = false;
    }
  }

  const checks = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    checks: {
      database: !!process.env.DATABASE_URL,
      stellarRpc: !!process.env.NEXT_PUBLIC_STELLAR_RPC,
      stellarFactory: !!process.env.NEXT_PUBLIC_STELLAR_FACTORY,
      oracleContract: !!process.env.NEXT_PUBLIC_STELLAR_ORACLE,
      groqKey: !!process.env.GROQ_API_KEY,
      redis: redisPing,
    },
    status: 'ok' as 'ok' | 'degraded',
  };

  const critical = checks.checks.database;
  checks.status = critical ? 'ok' : 'degraded';

  return NextResponse.json(checks, { status: critical ? 200 : 503 });
}
