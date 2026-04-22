/**
 * GET /api/markets/positions?address=G...
 * Returns the user's on-record positions (filled orders) from the DB.
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address || address.length < 10) {
    return NextResponse.json({ error: 'Missing address' }, { status: 400 });
  }

  try {
    // Find user by wallet address
    const user = await prisma.user.findUnique({ where: { walletAddress: address } });
    if (!user) {
      return NextResponse.json({ positions: [], stats: null });
    }

    const orders = await prisma.order.findMany({
      where: { userId: user.id, status: 'filled' },
      orderBy: { filledAt: 'desc' },
    });

    // Aggregate per market + outcome
    const map = new Map<string, {
      id: string; marketTitle: string; outcome: string;
      shares: number; totalCost: number; count: number;
    }>();

    for (const o of orders) {
      const key = `${o.marketId}:${o.outcome}`;
      const existing = map.get(key);
      const shares = o.amount / o.price; // cost / price_per_share = shares
      if (existing) {
        existing.shares += shares;
        existing.totalCost += o.amount;
        existing.count += 1;
      } else {
        map.set(key, {
          id: key,
          marketTitle: o.marketTitle ?? o.marketId,
          outcome: o.outcome,
          shares,
          totalCost: o.amount,
          count: 1,
        });
      }
    }

    const positions = Array.from(map.values()).map(p => {
      const avgPrice = p.totalCost / p.shares;
      // Use default 0.5 as current price (no live on-chain fetch here)
      const currentPrice = 0.5;
      const currentValue = p.shares * currentPrice;
      const pnl = currentValue - p.totalCost;
      const pnlPct = p.totalCost > 0 ? (pnl / p.totalCost) * 100 : 0;
      return {
        id: p.id,
        marketTitle: p.marketTitle,
        outcome: p.outcome,
        shares: p.shares,
        avgPrice,
        currentPrice,
        totalCost: p.totalCost,
        currentValue,
        pnl,
        pnlPct,
        tokenId: p.id,
      };
    });

    const totalValue = positions.reduce((s, p) => s + p.currentValue, 0);
    const totalCost  = positions.reduce((s, p) => s + p.totalCost, 0);
    const totalPnl   = totalValue - totalCost;
    const wins       = positions.filter(p => p.pnl > 0).length;
    const winRate    = positions.length > 0 ? Math.round((wins / positions.length) * 100) : 0;

    return NextResponse.json({
      positions,
      stats: { totalValue, totalCost, totalPnl, winRate, count: positions.length },
    });
  } catch (err) {
    console.error('GET /api/markets/positions error:', err);
    return NextResponse.json({ error: 'Failed to fetch positions' }, { status: 500 });
  }
}
