import { Market } from './types';

const GAMMA_API_URL = 'https://gamma-api.polymarket.com';

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
    'zimbabwe',
    
    // Major cities
    'lagos', 'abuja', 'nairobi', 'johannesburg', 'cairo', 'addis ababa', 'kigali', 
    'dar es salaam', 'kampala', 'lusaka', 'harare', 'maputo', 'luanda', 'dakar', 
    'casablanca', 'tunis', 'accra', 'kinshasa', 'algiers', 'khartoum',
    
    // Current leaders & politicians
    'tinubu', 'ramaphosa', 'ruto', 'akufo-addo', 'buhari', 'mnangagwa', 'kagame', 
    'uhuru', 'kenyatta', 'sisi', 'tshisekedi', 'museveni', 'magufuli', 'macky sall',
    
    // Sports & culture
    'afcon', 'african cup', 'can ', 'african champions league', 'nigerian premier league',
    'big brother naija', 'bbnaija', 'african music', 'amapiano', 'afrobeats',
    
    // Organizations & regional
    'ecowas', 'african union', 'au summit', 'east africa', 'west africa', 'maghreb', 
    'francophone', 'anglophone', 'sahel', 'eac', 'sadc',
    
    // Economy & finance
    'naira', 'cedi', 'rand', 'shilling', 'cfa franc', 'west african eco', 'kes', 'tzs', 
    'ugx', 'zmw', 'mwk', 'african development bank', 'imf africa', 'world bank africa',
    
    // Tech & startups
    'lagos tech', 'nairobi tech', 'african fintech', 'african startup', 'flutterwave', 
    'paystack', 'jumia', 'kuda', 'opay', 'palmpay', 'andela', 'mpesa', 'm-pesa'
];

/**
 * Helper to categorize markets for the UI
 */
function assignCategory(market: Market): string {
    const q = (market.question + ' ' + (market.description || '')).toLowerCase();
    
    // Explicit exclusions or overrides
    if (q.includes('crypto') || q.includes('bitcoin') || q.includes('btc') || q.includes('eth') || q.includes('solana') || q.includes('airdrop') || q.includes('nft') || q.includes('doge')) return 'Crypto';
    if (q.includes('election') || q.includes('president') || q.includes('policy') || q.includes('tinubu') || q.includes('trump') || q.includes('biden') || q.includes('harris')) return 'Politics';
    if (q.includes('football') || q.includes('afcon') || q.includes('sports') || q.includes('match') || q.includes('team') || q.includes('nfl') || q.includes('nba')) return 'Sports';
    if (q.includes('rate') || q.includes('inflation') || q.includes('naira') || q.includes('usd') || q.includes('economy') || q.includes('fed')) return 'Economy';
    if (q.includes('movie') || q.includes('artist') || q.includes('award') || q.includes('music') || q.includes('oscars') || q.includes('grammy')) return 'Entertainment';
    
    return 'Global';
}

export async function fetchAfricanMarkets(): Promise<(Market & { uiCategory: string })[]> {
  try {
    // Note: no next:revalidate — response is >2MB and Next.js cache rejects it.
    // Vercel's CDN edge cache handles freshness via Cache-Control instead.
    const res = await fetch(`${GAMMA_API_URL}/markets?active=true&closed=false&limit=1000`, {
      cache: 'no-store', // always fresh on each server render
    });

    if (!res.ok) return [];

    const data: any[] = await res.json();
    const parsedData: Market[] = data.map(m => {
      const outcomePrices = typeof m.outcomePrices === 'string' ? JSON.parse(m.outcomePrices) : (m.outcomePrices || ['0.5', '0.5']);
      const clobTokenIds: string[] = typeof m.clobTokenIds === 'string' ? JSON.parse(m.clobTokenIds) : (m.clobTokenIds || []);
      // Normalise tokens array so token_id is always available
      // Polymarket sometimes sends tokens[], sometimes only clobTokenIds[]
      const tokens = Array.isArray(m.tokens) && m.tokens.length > 0
        ? m.tokens
        : clobTokenIds.map((id: string, i: number) => ({
            token_id: id,
            outcome: i === 0 ? 'Yes' : 'No',
          }));
      return {
        ...m,
        condition_id: m.conditionId || m.condition_id || '',
        slug: m.slug || '',
        outcomes: typeof m.outcomes === 'string' ? JSON.parse(m.outcomes) : (m.outcomes || ['Yes', 'No']),
        outcomePrices,
        clobTokenIds,
        tokens, // guaranteed to have token_id now
      };
    });
    
    // Sort strictly by volume to get the best markets at the top
    const sortedData = parsedData.sort((a, b) => parseFloat(b.volume) - parseFloat(a.volume));

    // First, grab anything technically African.
    const strictAfrican = sortedData.filter((market) => {
        const questionText = (market.question + ' ' + (market.description || '')).toLowerCase();
        return AFRICAN_KEYWORDS.some((keyword) => questionText.includes(keyword));
    });

    // We still want a full dashboard. If African markets alone are too few, 
    // we backfill with highly liquid global markets, but filter out only US-centric politics and conflicts
    const avoidKeywords = [
        'trump', 'biden', 'kamala', 'harris', 'republican', 'democrat', 
        'senate', 'congress', 'california', 'new york', 'super bowl', 'nfl', 'nba',
        'fbi', 'cnn', 'fox', 'u.s.', 'united states',
        'israel', 'gaza', 'ukraine', 'putin'
    ];
    
    // Target at least 100 markets for excellent coverage
    const TARGET_MIN_MARKETS = 100;
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
