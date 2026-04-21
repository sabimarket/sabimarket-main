/**
 * Fetch prediction markets from SabiMarketFactory on Stellar Testnet.
 * Uses Soroban RPC simulation for read-only calls.
 */

import { rpc, Contract, TransactionBuilder, BASE_FEE, xdr } from '@stellar/stellar-sdk';
import { STELLAR_CONTRACTS, STELLAR_NETWORK_PASSPHRASE } from './contracts';
import { getSorobanServer } from './client';
import { prisma } from '@/lib/prisma';
import type { Market } from '@/lib/polymarket/types';

// Burner read-only account for simulation (Stellar allows any valid address for sims)
const SIM_ACCOUNT = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';

/** Call a Soroban contract method as a read-only simulation */
async function callContract(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<xdr.ScVal> {
  const server = getSorobanServer();
  const contract = new Contract(contractId);

  const account = await server.getAccount(SIM_ACCOUNT);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`${method}: ${sim.error}`);
  }
  if (!sim.result) throw new Error(`No result for ${method}`);
  return sim.result.retval;
}

/** Decode an ScVal to a JS value recursively */
function decodeScVal(val: xdr.ScVal): unknown {
  switch (val.switch().name) {
    case 'scvString': return val.str().toString();
    case 'scvSymbol': return val.sym().toString();
    case 'scvBool': return val.b();
    case 'scvU32': return val.u32();
    case 'scvI32': return val.i32();
    case 'scvU64': return Number(val.u64().toBigInt());
    case 'scvI64': return Number(val.i64().toBigInt());
    case 'scvU128': return Number(val.u128().hi().toBigInt() * BigInt(2 ** 64) + val.u128().lo().toBigInt());
    case 'scvI128': return Number(val.i128().hi().toBigInt() * BigInt(2 ** 64) + val.i128().lo().toBigInt());
    case 'scvAddress': return val.address().accountId()?.ed25519()
      ? Buffer.from(val.address().accountId().ed25519() as unknown as ArrayBuffer).toString('hex')
      : val.address().contractId()
        ? Buffer.from(val.address().contractId() as unknown as ArrayBuffer).toString('hex')
        : '';
    case 'scvVec': return (val.vec() ?? []).map(decodeScVal);
    case 'scvMap': {
      const out: Record<string, unknown> = {};
      for (const entry of val.map() ?? []) {
        const key = decodeScVal(entry.key()) as string;
        out[key] = decodeScVal(entry.val());
      }
      return out;
    }
    case 'scvVoid': return null;
    default: return null;
  }
}

function assignCategory(category: string, question: string): string {
  const cat = category.toLowerCase();
  const q = question.toLowerCase();
  if (cat === 'crypto' || q.includes('bitcoin') || q.includes('crypto') || q.includes('stellar') || q.includes('xlm')) return 'Crypto';
  if (cat === 'politics' || q.includes('election') || q.includes('president') || q.includes('tinubu') || q.includes('trump')) return 'Politics';
  if (cat === 'sports' || q.includes('afcon') || q.includes('football') || q.includes('match')) return 'Sports';
  if (cat === 'economy' || q.includes('naira') || q.includes('inflation') || q.includes('gdp')) return 'Economy';
  if (cat === 'entertainment' || q.includes('music') || q.includes('movie') || q.includes('award')) return 'Entertainment';
  return 'Global';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseMarketRecord(record: Record<string, any>): Market {
  const meta = (record.meta ?? {}) as Record<string, unknown>;
  const question = (meta.question as string) ?? (record.question as string) ?? '';
  const title = (meta.title as string) ?? question;
  const category = (meta.category as string) ?? (record.category as string) ?? 'Global';
  const imageUri = (meta.image_uri as string) ?? '';
  const endTime = (meta.end_time as number) ?? (record.end_time as number) ?? 0;
  const totalYes = (record.total_yes as number) ?? 0;
  const totalNo = (record.total_no as number) ?? 0;
  const totalCollateral = (record.total_collateral as number) ?? 0;
  const outcome = (record.outcome as number) ?? 0;
  const createdAt = (record.created_at as number) ?? 0;
  const marketId = (record.market_id as string) ?? '';

  const SCALAR = 1_000_000;
  const yesPrice = totalYes + totalNo > 0 ? totalYes / (totalYes + totalNo) : 0.5;
  const noPrice = 1 - yesPrice;
  const volumeUsdc = totalCollateral / SCALAR;
  const isEnded = endTime > 0 && endTime * 1000 < Date.now();
  const resolved = outcome > 0;

  return {
    id: marketId,
    condition_id: marketId,
    question,
    description: (meta.description as string) ?? '',
    category,
    imageUri,
    image: imageUri,
    outcomes: ['Yes', 'No'],
    outcomePrices: [yesPrice.toFixed(4), noPrice.toFixed(4)],
    volume: Math.round(volumeUsdc).toString(),
    active: !resolved && !isEnded,
    closed: resolved || isEnded,
    resolved,
    outcome,
    endDate: endTime > 0 ? new Date(endTime * 1000).toISOString() : '',
    totalYesShares: (totalYes / SCALAR).toFixed(6),
    totalNoShares: (totalNo / SCALAR).toFixed(6),
    totalCollateral: volumeUsdc.toFixed(6),
    createdAt,
  };
}

/** Fetch all markets registered with SabiMarketFactory */
export async function fetchAfricanMarkets(): Promise<(Market & { uiCategory: string })[]> {
  // ── Primary: DB (MarketCuration) ─────────────────────────────────────────
  // The DB is seeded with all 31 markets and is always available.
  // On-chain state (prices, volumes) is enriched per-market when possible.
  try {
    const curated = await prisma.marketCuration.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' },
    });

    if (curated.length > 0) {
      const markets: (Market & { uiCategory: string })[] = curated.map((m) => {
        const uiCategory = assignCategory(m.category, m.title);
        return {
          id: m.conditionId,
          condition_id: m.conditionId,
          question: m.title,
          description: '',
          category: m.category,
          imageUri: '',
          image: '',
          outcomes: ['Yes', 'No'],
          // Default 50/50 until on-chain state is fetched
          outcomePrices: ['0.5000', '0.5000'],
          volume: '0',
          active: true,
          closed: false,
          resolved: false,
          outcome: 0,
          endDate: '',
          totalYesShares: '0.000000',
          totalNoShares: '0.000000',
          totalCollateral: '0.000000',
          createdAt: Math.floor(m.createdAt.getTime() / 1000),
          uiCategory,
        };
      });

      // Best-effort: enrich first 10 markets with live on-chain state
      // (don't await all — too slow; rest show default 50/50)
      try {
        const allVal = await callContract(STELLAR_CONTRACTS.FACTORY, 'get_all_markets');
        const raw = decodeScVal(allVal);
        if (Array.isArray(raw)) {
          const onChainMap = new Map<string, ReturnType<typeof parseMarketRecord>>();
          for (const item of raw) {
            try {
              const record = item as Record<string, unknown>;
              // Factory records have 'address' field as the market ID
              const addr = (record.address as string) ?? (record.market_id as string) ?? '';
              if (addr) {
                const parsed = parseMarketRecord({ ...record, market_id: addr });
                onChainMap.set(addr, parsed);
              }
            } catch { /* skip */ }
          }
          for (const m of markets) {
            const onChain = onChainMap.get(m.id);
            if (onChain) {
              m.outcomePrices = onChain.outcomePrices;
              m.volume = onChain.volume;
              m.active = onChain.active;
              m.closed = onChain.closed;
              m.resolved = onChain.resolved;
              m.endDate = onChain.endDate;
              m.totalYesShares = onChain.totalYesShares;
              m.totalNoShares = onChain.totalNoShares;
              m.totalCollateral = onChain.totalCollateral;
            }
          }
        }
      } catch {
        // On-chain enrichment failed — show DB data with default prices
      }

      return markets;
    }
  } catch (err) {
    console.error('[Stellar] DB fetch error:', err);
  }

  // ── Fallback: on-chain factory ────────────────────────────────────────────
  try {
    let countVal: xdr.ScVal;
    try {
      countVal = await callContract(STELLAR_CONTRACTS.FACTORY, 'market_count');
    } catch {
      return [];
    }

    const count = decodeScVal(countVal) as number;
    if (!count || count === 0) return [];

    const allVal = await callContract(STELLAR_CONTRACTS.FACTORY, 'get_all_markets');
    const raw = decodeScVal(allVal);
    if (!Array.isArray(raw)) return [];

    const markets: (Market & { uiCategory: string })[] = [];
    for (const item of raw) {
      try {
        const record = item as Record<string, unknown>;
        const addr = (record.address as string) ?? (record.market_id as string) ?? '';
        const market = parseMarketRecord({ ...record, market_id: addr });
        if (!market.id) continue;
        const uiCategory = assignCategory(market.category, market.question);
        markets.push({ ...market, uiCategory });
      } catch { /* skip */ }
    }
    return markets;
  } catch (err) {
    console.error('[Stellar] fetchAfricanMarkets error:', err);
    return [];
  }
}

/** Fetch a single user's position in a market */
export async function fetchUserPosition(
  marketId: string,
  userAddress: string,
): Promise<{ yes: number; no: number } | null> {
  try {
    const { xdr: xdrNs, Address } = await import('@stellar/stellar-sdk');
    const userScVal = xdrNs.ScVal.scvAddress(new Address(userAddress).toScAddress());
    const res = await callContract(marketId, 'get_position', [userScVal]);
    const decoded = decodeScVal(res) as Record<string, number>;
    const SCALAR = 1_000_000;
    return {
      yes: (decoded.yes ?? 0) / SCALAR,
      no: (decoded.no ?? 0) / SCALAR,
    };
  } catch {
    return null;
  }
}

/** Fetch USDC balance for an address */
export async function fetchUsdcBalance(address: string): Promise<number> {
  try {
    const { xdr: xdrNs, Address } = await import('@stellar/stellar-sdk');
    const addrScVal = xdrNs.ScVal.scvAddress(new Address(address).toScAddress());
    const res = await callContract(STELLAR_CONTRACTS.USDC, 'balance', [addrScVal]);
    const raw = decodeScVal(res) as number;
    return raw / 1_000_000;
  } catch {
    return 0;
  }
}

export { getSorobanServer };
