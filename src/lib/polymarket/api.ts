import { Market } from './types';
import { createPublicClient, http, formatUnits } from 'viem';
import { flowTestnet, CONTRACTS, FACTORY_ABI, MARKET_ABI } from '@/lib/contracts';

const RPC_URL = 'https://testnet.evm.nodes.onflow.org';

const client = createPublicClient({
  chain: flowTestnet,
  transport: http(RPC_URL, { retryCount: 4, retryDelay: 600 }),
});

function assignCategory(category: string, question: string): string {
  const cat = category.toLowerCase();
  const q = question.toLowerCase();

  if (cat === 'crypto' || q.includes('bitcoin') || q.includes('btc') || q.includes('eth') || q.includes('solana') || q.includes('crypto')) return 'Crypto';
  if (cat === 'politics' || q.includes('election') || q.includes('president') || q.includes('tinubu') || q.includes('trump')) return 'Politics';
  if (cat === 'sports' || q.includes('afcon') || q.includes('football') || q.includes('sports') || q.includes('match')) return 'Sports';
  if (cat === 'economy' || q.includes('naira') || q.includes('inflation') || q.includes('economy') || q.includes('gdp')) return 'Economy';
  if (cat === 'entertainment' || q.includes('music') || q.includes('movie') || q.includes('award')) return 'Entertainment';

  return 'Global';
}

function parseMarket(
  address: `0x${string}`,
  info: readonly [string, string, string, bigint, bigint, bigint, bigint, boolean, number, bigint],
  yesPrice: bigint,
  noPrice: bigint,
): Market {
  const [question, category, imageUri, endTime, totalYes, totalNo, totalCollateral, resolved, outcome, createdAt] = info;
  const yesPriceFmt = (Number(yesPrice) / 1_000_000).toFixed(4);
  const noPriceFmt = (Number(noPrice) / 1_000_000).toFixed(4);
  const volumeUsdc = Number(formatUnits(totalCollateral, 6));
  const isEnded = Number(endTime) * 1000 < Date.now();

  return {
    id: address,
    condition_id: address,
    question,
    description: '',
    category,
    imageUri,
    image: imageUri,
    outcomes: ['Yes', 'No'],
    outcomePrices: [yesPriceFmt, noPriceFmt],
    volume: Math.round(volumeUsdc).toString(),
    active: !resolved && !isEnded,
    closed: resolved || isEnded,
    resolved,
    outcome,
    endDate: new Date(Number(endTime) * 1000).toISOString(),
    totalYesShares: formatUnits(totalYes, 6),
    totalNoShares: formatUnits(totalNo, 6),
    totalCollateral: formatUnits(totalCollateral, 6),
    createdAt: Number(createdAt),
  };
}

/**
 * Process items in sequential batches to avoid hitting RPC rate limits.
 * Flow EVM Testnet allows ~40 req/s; each market needs 3 calls, so batches
 * of 8 markets = 24 concurrent calls, safely under the limit.
 */
async function batchMap<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Read a single market's data from its on-chain contract.
 */
async function readMarket(address: `0x${string}`): Promise<Market | null> {
  try {
    const [info, yesPrice, noPrice] = await Promise.all([
      client.readContract({ address, abi: MARKET_ABI, functionName: 'getMarketInfo' }),
      client.readContract({ address, abi: MARKET_ABI, functionName: 'getYesPrice' }),
      client.readContract({ address, abi: MARKET_ABI, functionName: 'getNoPrice' }),
    ]);
    return parseMarket(
      address,
      info as readonly [string, string, string, bigint, bigint, bigint, bigint, boolean, number, bigint],
      yesPrice as bigint,
      noPrice as bigint,
    );
  } catch (err) {
    console.error(`Failed to read market ${address}:`, err);
    return null;
  }
}

/**
 * Fetch all markets from the SabiMarketFactory on Flow EVM Testnet.
 * Uses sequential batches of 8 to avoid exceeding the 40 req/s rate limit.
 */
export async function fetchAfricanMarkets(): Promise<(Market & { uiCategory: string })[]> {
  try {
    const count = await client.readContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getMarketCount',
    });

    const total = Number(count);
    if (total === 0) return [];

    const allAddresses = await client.readContract({
      address: CONTRACTS.FACTORY,
      abi: FACTORY_ABI,
      functionName: 'getMarkets',
      args: [BigInt(0), BigInt(total)],
    }) as readonly `0x${string}`[];

    // Process 8 markets at a time — 8 × 3 calls = 24 concurrent, safely under 40/s
    const markets = await batchMap([...allAddresses], 8, (addr) => readMarket(addr));

    return markets
      .filter((m): m is Market => m !== null)
      .sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume))
      .map(m => ({ ...m, uiCategory: assignCategory(m.category, m.question) }));
  } catch (error) {
    console.error('Error fetching on-chain markets:', error);
    return [];
  }
}

/**
 * Get a single market by its contract address.
 */
export async function getMarket(address: string): Promise<Market | null> {
  return readMarket(address as `0x${string}`);
}

