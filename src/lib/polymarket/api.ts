import { Market } from './types';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';

// Raw response type from Polymarket API (before parsing)
type RawMarketResponse = Record<string, unknown>;

const AFRICAN_KEYWORDS = [
    // Countries
    'africa', 'african', 'algeria', 'angola', 'benin', 'botswana', 'burkina faso', 'burundi', 
    'cabo verde', 'cape verde', 'cameroon', 'central african republic', 'chad', 'comoros', 
    'congo', "cote d'ivoire", 'ivory coast', 'djibouti', 'egypt', 'equatorial guinea', 
    'eritrea', 'eswatini', 'swaziland', 'ethiopia', 'gabon', 'gambia', 'ghana', 'guinea', 
    'guinea-bissau', 'kenya', 'lesotho', 'liberia', 'libya', 'madagascar', 'malawi', 'mali', 
    'mauritania', 'mauritius', 'morocco', 'mozambique', 'namibia', 'niger', 'nigeria', 
    'rwanda', 'sao tome and principe', 'senegal', 'seychelles', 'sierra leone', 'somalia', 
    'south africa', 'south sudan', 'sudan', 'tanzania', 'togo', 'tunisia', 'uganda', 'zambia', 
    'zimbabwe', 'nigerian', 'kenyan', 'ghanaian', 'ethiopian', 'south african', 'egyptian',
    
    // Major cities
    'lagos', 'abuja', 'nairobi', 'johannesburg', 'pretoria', 'cape town', 'durban', 'cairo', 
    'addis ababa', 'kigali', 'dar es salaam', 'kampala', 'lusaka', 'harare', 'maputo', 'luanda', 
    'dakar', 'casablanca', 'tunis', 'accra', 'kumasi', 'kinshasa', 'algiers', 'khartoum',
    
    // Current leaders & politicians
    'tinubu', 'buhari', 'ramaphosa', 'cyril', 'ruto', 'william ruto', 'akufo-addo', 'akuffo', 
    'nana addo', 'mnangagwa', 'emmerson', 'kagame', 'paul kagame', 'uhuru', 'kenyatta', 
    'sisi', 'el-sisi', 'abdel fattah', 'tshisekedi', 'felix', 'museveni', 'yoweri', 
    'magufuli', 'samia', 'macky sall', 'faye', 'bassirou',
    
    // Sports & culture
    'afcon', 'africa cup', 'african cup', 'can 202', 'caf', 'african champions league', 
    'nigerian premier', 'npfl', 'kenyan premier', 'south african premier',
    'big brother naija', 'bbnaija', 'bbn', 'african music', 'amapiano', 'afrobeats', 
    'afrobeat', 'burna boy', 'wizkid', 'davido', 'tiwa savage', 'yemi alade',
    
    // Organizations & regional
    'ecowas', 'african union', 'au summit', 'east africa', 'east african', 'west africa', 
    'west african', 'north africa', 'maghreb', 'francophone africa', 'anglophone', 
    'sahel', 'eac', 'sadc', 'southern africa',
    
    // Economy & finance
    'naira', 'ngn', 'cedi', 'ghs', 'rand', 'zar', 'shilling', 'kes', 'cfa franc', 
   'west african eco', 'tzs', 'ugx', 'zmw', 'mwk', 'african development bank', 
    'adb', 'imf africa', 'world bank africa',
    
    // Tech & startups
    'lagos tech', 'nairobi tech', 'african fintech', 'african startup', 'flutterwave', 
    'paystack', 'jumia', 'kuda', 'opay', 'palmpay', 'andela', 'mpesa', 'm-pesa', 
    'африка'
];

/**
 * Polymarket native tags for category-based fetching
 */
const POLYMARKET_TAGS = {
    sports: 'sports',
    crypto: 'crypto',
    politics: 'politics',
    pop_culture: 'pop-culture',
    business: 'business',
    science: 'science',
};

/**
 * Helper to categorize markets for the UI
 */
function assignCategory(market: Market): string {
    const q = (market.question + ' ' + (market.description || '')).toLowerCase();
    
    // Explicit categorization based on keywords
    if (q.includes('crypto') || q.includes('bitcoin') || q.includes('btc') || q.includes('eth') || q.includes('solana') || q.includes('airdrop') || q.includes('nft') || q.includes('doge')) return 'Crypto';
    if (q.includes('election') || q.includes('president') || q.includes('policy') || q.includes('tinubu') || q.includes('trump') || q.includes('biden') || q.includes('harris')) return 'Politics';
    if (q.includes('football') || q.includes('afcon') || q.includes('sports') || q.includes('match') || q.includes('team') || q.includes('nfl') || q.includes('nba')) return 'Sports';
    if (q.includes('rate') || q.includes('inflation') || q.includes('naira') || q.includes('usd') || q.includes('economy') || q.includes('fed')) return 'Economy';
    if (q.includes('movie') || q.includes('artist') || q.includes('award') || q.includes('music') || q.includes('oscars') || q.includes('grammy')) return 'Entertainment';
    
    return 'Global';
}

/**
 * Helper to parse and normalize market data from Polymarket API
 */
function parseMarket(m: RawMarketResponse): Market {
    const outcomePrices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices as string) : (m.outcomePrices || ['0.5', '0.5']);
    const clobTokenIds: string[] = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds as string) : (m.clobTokenIds as string[] || []);
    
    // Normalize tokens array so token_id is always available
    const tokens = Array.isArray(m.tokens) && (m.tokens as unknown[]).length > 0
        ? m.tokens
        : clobTokenIds.map((id: string, i: number) => ({
            token_id: id,
            outcome: i === 0 ? 'Yes' : 'No',
          }));
          
    return {
        ...m,
        condition_id: (m.conditionId as string) || (m.condition_id as string) || '',
        slug: (m.slug as string) || '',
        outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes as string) : (m.outcomes || ['Yes', 'No']),
        outcomePrices,
        clobTokenIds,
        tokens,
    } as Market;
}

/**
 * Fetch markets by Polymarket's native tag with parallel requests
 */
async function fetchByTag(tag: string, limit: number = 50): Promise<Market[]> {
    try {
        const res = await fetch(
            `${GAMMA_API_URL}/markets?tag=${tag}&active=true&closed=false&limit=${limit}`,
            { cache: 'no-store' }
        );
        if (!res.ok) return [];
        const data = await res.json() as RawMarketResponse[];
        return data.map(parseMarket);
    } catch (error) {
        console.error(`Error fetching ${tag} markets:`, error);
        return [];
    }
}

/**
 * Fetch high-volume global markets (no tag filter)
 */
async function fetchHighVolumeMarkets(limit: number = 100): Promise<Market[]> {
    try {
        const res = await fetch(
            `${GAMMA_API_URL}/markets?active=true&closed=false&limit=${limit}`,
            { cache: 'no-store' }
        );
        if (!res.ok) return [];
        const data = await res.json() as RawMarketResponse[];
        return data.map(parseMarket);
    } catch (error) {
        console.error('Error fetching high-volume markets:', error);
        return [];
    }
}

export async function fetchAfricanMarkets(): Promise<(Market & { uiCategory: string })[]> {
  try {
    // Parallel fetch from multiple Polymarket categories + high-volume markets
    // This reduces payload size and leverages Polymarket's native categorization
    const [sportsMarkets, cryptoMarkets, politicsMarkets, cultureMarkets, businessMarkets, highVolumeMarkets] = await Promise.all([
        fetchByTag(POLYMARKET_TAGS.sports, 40),
        fetchByTag(POLYMARKET_TAGS.crypto, 40),
        fetchByTag(POLYMARKET_TAGS.politics, 30),
        fetchByTag(POLYMARKET_TAGS.pop_culture, 30),
        fetchByTag(POLYMARKET_TAGS.business, 30),
        fetchHighVolumeMarkets(100),
    ]);

    // Combine all markets and deduplicate by condition_id
    const allMarkets = [
        ...sportsMarkets,
        ...cryptoMarkets, 
        ...politicsMarkets,
        ...cultureMarkets,
        ...businessMarkets,
        ...highVolumeMarkets,
    ];
    
    const uniqueMarkets = Array.from(
        new Map(allMarkets.map(m => [m.condition_id, m])).values()
    );
    
    // Sort by volume (highest first)
    const sortedData = uniqueMarkets.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));

    // Prioritize African markets
    const strictAfrican = sortedData.filter((market) => {
        const questionText = (market.question + ' ' + (market.description || '')).toLowerCase();
        return AFRICAN_KEYWORDS.some((keyword) => questionText.includes(keyword));
    });

    // Filter out overly US-centric politics for fallback markets
    const avoidKeywords = [
        'congress', 'california', 'new york', 'texas', 'florida',
        'fbi', 'cia', 'u.s. treasury', 'mar-a-lago'
    ];
    
    // Target at least 80 markets for good coverage
    const TARGET_MIN_MARKETS = 80;
    let fallbackMarkets: Market[] = [];
    
    if (strictAfrican.length < TARGET_MIN_MARKETS) {
      const needed = TARGET_MIN_MARKETS - strictAfrican.length;
      fallbackMarkets = sortedData
        .filter(m => {
          if (strictAfrican.includes(m)) return false;
          const q = (m.question + ' ' + (m.description || '')).toLowerCase();
          return !avoidKeywords.some(kw => q.includes(kw));
        })
        .slice(0, needed);
    }

    const finalFeed = [...strictAfrican, ...fallbackMarkets].map(m => ({
        ...m,
        uiCategory: assignCategory(m)
    }));

    return finalFeed;
  } catch (error) {
    console.error('Error fetching Polymarket Markets:', error);
    return [];
  }
}

export async function getMarket(conditionId: string): Promise<Market | null> {
    try {
        const res = await fetch(`${GAMMA_API_URL}/markets?condition_id=${conditionId}`);
        if (!res.ok) return null;
        const data = await res.json();
        const m = data[0];
        if (!m) return null;
        return {
            ...m,
            condition_id: m.conditionId || m.condition_id || '',
            slug: m.slug || '',
            outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : m.outcomes,
            outcomePrices: typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : m.outcomePrices,
            clobTokenIds: typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : m.clobTokenIds,
        };
    } catch {
        return null;
    }
}
