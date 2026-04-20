import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Internal endpoint: list expired, unresolved markets
 * Called by the market-expiry BullMQ worker
 * Protected by x-cron-secret header
 *
 * Markets are tracked via the MarketCuration table (conditionId = Soroban market address).
 * We cross-reference against Order activity to find active markets we know about.
 * The worker will then check on-chain state for each.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Return all active curated markets — the worker checks Soroban for expiry state
    const markets = await prisma.marketCuration.findMany({
      where: { isActive: true },
      select: {
        conditionId: true,
        title: true,
        category: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ markets, count: markets.length });
  } catch (err) {
    console.error("[markets/expired] DB error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
