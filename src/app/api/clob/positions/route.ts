/**
 * GET /api/clob/positions?address=0x...
 * Reads on-chain positions from SabiMarket contracts on Flow EVM.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, getAddress } from 'viem';
import { CONTRACTS, FACTORY_ABI, MARKET_ABI, flowTestnet } from '@/lib/contracts';

const client = createPublicClient({
  chain: flowTestnet,
  transport: http(),
});

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

  try {
    const userAddr = getAddress(address);

    const count = await client.readContract({
      address: CONTRACTS.FACTORY as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getMarketCount',
    }) as bigint;

    const markets = await client.readContract({
      address: CONTRACTS.FACTORY as `0x${string}`,
      abi: FACTORY_ABI,
      functionName: 'getMarkets',
      args: [0n, count],
    }) as `0x${string}`[];

    const enriched: any[] = [];

    // Process 8 markets at a time — keeps concurrent RPC calls under rate limit
    for (let i = 0; i < markets.length; i += 8) {
      const batch = markets.slice(i, i + 8);
      await Promise.all(
        batch.map(async (marketAddr) => {
          try {
            const [position, info, yesPrice] = await Promise.all([
              client.readContract({
                address: marketAddr,
                abi: MARKET_ABI,
                functionName: 'getUserPosition',
                args: [userAddr],
              }) as Promise<[bigint, bigint, boolean]>,
              client.readContract({
                address: marketAddr,
                abi: MARKET_ABI,
                functionName: 'getMarketInfo',
              }) as Promise<[string, string, string, bigint, bigint, bigint, bigint, boolean, number, bigint]>,
              client.readContract({
                address: marketAddr,
                abi: MARKET_ABI,
                functionName: 'getYesPrice',
              }) as Promise<bigint>,
            ]);

            const [yesShares, noShares] = position;
            if (yesShares === 0n && noShares === 0n) return;

            const question = info[0];
            const currentYesPrice = Number(yesPrice) / 1e6;
            const currentNoPrice = 1 - currentYesPrice;

            if (yesShares > 0n) {
              const shares = Number(yesShares) / 1e6;
              enriched.push({
                id: marketAddr + '-YES',
                marketTitle: question,
                outcome: 'YES',
                shares,
                avgPrice: currentYesPrice,
                currentPrice: currentYesPrice,
                totalCost: shares * currentYesPrice,
                currentValue: shares * currentYesPrice,
                pnl: 0,
                pnlPct: 0,
                tokenId: marketAddr,
              });
            }

            if (noShares > 0n) {
              const shares = Number(noShares) / 1e6;
              enriched.push({
                id: marketAddr + '-NO',
                marketTitle: question,
                outcome: 'NO',
                shares,
                avgPrice: currentNoPrice,
                currentPrice: currentNoPrice,
                totalCost: shares * currentNoPrice,
                currentValue: shares * currentNoPrice,
                pnl: 0,
                pnlPct: 0,
                tokenId: marketAddr,
              });
            }
          } catch {
            // skip markets that fail
          }
        })
      );
    }

    const totalValue = enriched.reduce((s: number, p: any) => s + p.currentValue, 0);
    const totalCost = enriched.reduce((s: number, p: any) => s + p.totalCost, 0);
    const totalPnl = totalValue - totalCost;
    const winRate = enriched.length > 0
      ? Math.round((enriched.filter((p: any) => p.pnl > 0).length / enriched.length) * 100)
      : 0;

    return NextResponse.json({
      positions: enriched,
      stats: { totalValue, totalCost, totalPnl, winRate, count: enriched.length },
    });
  } catch (err: any) {
    console.error('[Positions] Error:', err);
    return NextResponse.json({
      positions: [],
      stats: { totalValue: 0, totalCost: 0, totalPnl: 0, winRate: 0, count: 0 },
    });
  }
}
