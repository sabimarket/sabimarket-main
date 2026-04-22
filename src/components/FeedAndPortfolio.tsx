"use client";

import { useState, useEffect, useMemo } from 'react';
import { Market } from '@/lib/polymarket/types';
import MarketChart from './MarketChart';
import { MarketList } from './MarketList';
import { BetModal } from './BetModal';
import { MarketDetailModal } from './MarketDetailModal';
import { CreateMarketCTA } from './CreateMarketCTA';
import { useWallet } from '@/components/Providers';
import {
  Activity, Clock, TrendingUp, DollarSign, BarChart2,
  Award, Wallet, Globe, Loader2, Search, X
} from 'lucide-react';

interface RealPosition {
  id: string; marketTitle: string; outcome: string; shares: number;
  avgPrice: number; currentPrice: number; totalCost: number;
  currentValue: number; pnl: number; pnlPct: number; tokenId: string;
}

interface PortfolioStats {
  totalValue: number; totalCost: number; totalPnl: number;
  winRate: number; count: number;
}

interface Props {
  heroMarket: Market | null;
  feedMarkets: (Market & { uiCategory: string })[];
  heroYesPrice: number;
}

export function FeedAndPortfolio({ heroMarket, feedMarkets, heroYesPrice }: Props) {
  const [activeTab, setActiveTab] = useState<'markets' | 'portfolio'>('markets');
  const [portfolioSubTab, setPortfolioSubTab] = useState<'active' | 'history'>('active');
  const [positions, setPositions] = useState<RealPosition[]>([]);
  const [stats, setStats] = useState<PortfolioStats | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const { address, connect: openConnectModal } = useWallet();

  // Hero modal states
  const [isHeroBetOpen, setHeroBetOpen] = useState(false);
  const [heroOutcome, setHeroOutcome] = useState<string | null>(null);
  const [isHeroDetailOpen, setHeroDetailOpen] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Filter feedMarkets by search
  const filteredFeedMarkets = useMemo(() => {
    if (!searchQuery.trim()) return feedMarkets;
    const q = searchQuery.toLowerCase();
    return feedMarkets.filter(m =>
      m.question?.toLowerCase().includes(q) ||
      m.description?.toLowerCase().includes(q) ||
      m.uiCategory?.toLowerCase().includes(q)
    );
  }, [feedMarkets, searchQuery]);

  const handleHeroBet = (outcome: string) => {
    setHeroOutcome(outcome);
    setHeroBetOpen(true);
  };

  // Fetch real on-chain portfolio when user connects and switches to portfolio tab
  useEffect(() => {
    if (!address || activeTab !== 'portfolio') return;
    setLoadingPortfolio(true);
    fetch(`/api/markets/positions?address=${address}`)
      .then(r => r.json())
      .then(data => {
        setPositions(data.positions || []);
        setStats(data.stats || null);
      })
      .catch(console.error)
      .finally(() => setLoadingPortfolio(false));
  }, [address, activeTab]);

  return (
    <div className="w-full">

      {/* ─── TOP NAV TABS ─── */}
      <div className="flex items-center gap-1 bg-white/[0.03] border border-white/[0.07] p-1 rounded-xl w-max mb-6">
        <button onClick={() => setActiveTab('markets')}
          className={`cursor-pointer px-5 py-2 rounded-lg font-semibold text-[13px] transition-all ${
            activeTab === 'markets' ? 'bg-white/[0.08] text-white shadow-sm' : 'text-[#7A7068] hover:text-white hover:bg-white/[0.04]'
          }`}>Markets</button>
        <button onClick={() => setActiveTab('portfolio')}
          className={`cursor-pointer px-5 py-2 rounded-lg font-semibold text-[13px] transition-all ${
            activeTab === 'portfolio' ? 'bg-white/[0.08] text-white shadow-sm' : 'text-[#7A7068] hover:text-white hover:bg-white/[0.04]'
          }`}>
          Portfolio
          {positions.length > 0 && (
            <span className="ml-1.5 text-[10px] bg-[#00D26A] text-black px-1.5 py-0.5 rounded-full font-bold">{positions.length}</span>
          )}
        </button>
      </div>

      {/* ─── PORTFOLIO TAB ─── */}
      {activeTab === 'portfolio' && (
        <div className="w-full flex flex-col fade-in">

          {/* ── Auth gate ── */}
          {!address ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-6">
                <Wallet size={28} className="text-[#7A7068]" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Connect Your Wallet</h3>
              <p className="text-sm text-[#7A7068] max-w-xs mb-6">See your real on-chain positions, P&amp;L, and trading history on SabiMarkets</p>
              <div className="flex flex-col gap-3 items-center">
                <button
                  onClick={() => openConnectModal?.()}
                  className="cursor-pointer bg-[#00D26A] text-black px-8 py-3 rounded-xl font-bold text-sm hover:bg-[#00B85E] transition-colors flex items-center gap-2"
                >
                  <Wallet size={16} /> Connect Wallet
                </button>
                <button onClick={() => setActiveTab('markets')} className="cursor-pointer text-xs text-[#7A7068] hover:text-white transition-colors">
                  Browse markets instead →
                </button>
              </div>

              {/* Ghost stats (blurred teaser) */}
              <div className="mt-12 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-xl opacity-30 pointer-events-none select-none blur-[2px]">
                {['Portfolio Value', 'Total P&L', 'Win Rate', 'Positions'].map(label => (
                  <div key={label} className="bg-[#0F0D0B] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-2">
                    <span className="text-[10px] text-[#7A7068] uppercase tracking-wider font-medium">{label}</span>
                    <span className="text-xl font-bold font-mono text-white">—</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 mb-8">
              {[
                { label: 'Portfolio Value', value: `$${stats.totalValue.toFixed(2)}`, icon: DollarSign, color: 'text-white' },
                { label: 'Total Cost',      value: `$${stats.totalCost.toFixed(2)}`,  icon: Wallet,     color: 'text-white' },
                { label: 'Total P&L',       value: `${stats.totalPnl >= 0 ? '+' : ''}$${stats.totalPnl.toFixed(2)}`, icon: TrendingUp, color: stats.totalPnl >= 0 ? 'text-[#00D26A]' : 'text-[#FF4560]' },
                { label: 'Win Rate',        value: `${stats.winRate}%`,               icon: Award,      color: 'text-white' },
                { label: 'Positions',       value: `${stats.count}`,                  icon: Activity,   color: 'text-white' },
              ].map((s, i) => (
                <div key={i} className="bg-[#0F0D0B] border border-white/[0.07] rounded-xl p-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-[#7A7068] uppercase tracking-wider font-medium">{s.label}</span>
                    <s.icon size={12} className="text-[#7A7068]/60" />
                  </div>
                  <span className={`text-xl font-bold font-mono ${s.color}`}>{s.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Sub-tabs */}
          <div className="flex gap-1 mb-6 bg-white/[0.03] border border-white/[0.06] p-1 rounded-xl w-max">
            <button onClick={() => setPortfolioSubTab('active')}
              className={`cursor-pointer px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-2 transition-all ${
                portfolioSubTab === 'active' ? 'bg-[#00D26A]/10 text-[#00D26A] border border-[#00D26A]/20' : 'text-[#7A7068] hover:text-white'
              }`}>
              <Activity size={14} /> Active
            </button>
            <button onClick={() => setPortfolioSubTab('history')}
              className={`cursor-pointer px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-2 transition-all ${
                portfolioSubTab === 'history' ? 'bg-white/[0.08] text-white border border-white/10' : 'text-[#7A7068] hover:text-white'
              }`}>
              <Clock size={14} /> History
            </button>
          </div>

          {loadingPortfolio ? (
            <div className="flex flex-col items-center justify-center py-24 text-[#7A7068]">
              <Loader2 size={32} className="animate-spin mb-4" />
              <p className="text-sm">Fetching positions from Stellar…</p>
            </div>
          ) : portfolioSubTab === 'history' ? (
            <EmptyState icon={Clock} title="No Trade History Yet" desc="Completed trades will appear here." />
          ) : positions.length === 0 ? (
            <EmptyState icon={BarChart2} title="No Active Positions" desc="You don't have any open positions yet.">
              <button onClick={() => setActiveTab('markets')}
                className="cursor-pointer bg-[#00D26A] text-black px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-[#00B85E] transition-colors mt-4">
                Explore Markets →
              </button>
              <div className="mt-6 w-full max-w-md">
                <CreateMarketCTA variant="banner" />
              </div>
            </EmptyState>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map(pos => (
                <div key={pos.id} className="bg-[#0F0D0B] border border-white/[0.07] rounded-2xl p-5 hover:border-white/[0.14] transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-semibold text-white text-[14px] leading-snug line-clamp-2 pr-4">{pos.marketTitle}</h4>
                    <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      pos.outcome === 'YES' ? 'bg-[#00D26A]/10 text-[#00D26A] border border-[#00D26A]/20' : 'bg-[#FF4560]/10 text-[#FF4560] border border-[#FF4560]/20'
                    }`}>{pos.outcome}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4 border-y border-white/[0.05] py-4">
                    <div>
                      <p className="text-[#7A7068] text-[10px] uppercase mb-1 font-medium">Shares</p>
                      <p className="font-bold text-white font-mono text-sm">{pos.shares.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-[#7A7068] text-[10px] uppercase mb-1 font-medium">Avg</p>
                      <p className="font-bold text-white font-mono text-sm">{Math.round(pos.avgPrice * 100)}¢</p>
                    </div>
                    <div>
                      <p className="text-[#7A7068] text-[10px] uppercase mb-1 font-medium">P&L</p>
                      <p className={`font-bold font-mono text-sm ${pos.pnl >= 0 ? 'text-[#00D26A]' : 'text-[#FF4560]'}`}>
                        {pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-[#0F0D0B] border border-white/[0.07] rounded-lg px-3 py-1.5">
                      <p className="text-[10px] text-[#7A7068]">Current</p>
                      <p className="text-white text-sm font-mono font-bold">{Math.round(pos.currentPrice * 100)}¢</p>
                    </div>
                    <div className="flex-1 bg-[#0F0D0B] border border-white/[0.07] rounded-lg px-3 py-1.5">
                      <p className="text-[10px] text-[#7A7068]">Value</p>
                      <p className="text-white text-sm font-mono font-bold">${pos.currentValue.toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
            </>
          )}
        </div>
      )}

      {/* ─── MARKETS TAB ─── */}
      {activeTab === 'markets' && (
        <div className="fade-in">

          {/* Hero Market */}
          {heroMarket && (
            <div className="w-full rounded-2xl border border-white/[0.07] mb-10 overflow-hidden relative"
                 style={{ background: 'linear-gradient(135deg, #0F0D0B 0%, #121009 100%)' }}>
              <div className="absolute top-0 right-0 w-[400px] h-[400px] opacity-[0.06] pointer-events-none"
                   style={{ background: 'radial-gradient(circle, #00D26A 0%, transparent 70%)' }} />
              <div className="flex flex-col lg:flex-row">
                <div className="flex-1 p-6 sm:p-8 flex flex-col justify-between relative z-10">
                  <div>
                    <div className="flex items-center gap-3 mb-5">
                      <span className="text-[11px] font-bold text-[#FF4560] bg-[#FF4560]/10 border border-[#FF4560]/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                        🔥 Trending Now
                      </span>
                      <span className="text-[11px] text-[#7A7068] font-medium flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#00D26A] animate-pulse inline-block" />
                        Live Oracle
                      </span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">{heroMarket.question}</h2>
                    <p className="text-[#7A7068] text-sm leading-relaxed mb-6 line-clamp-2 max-w-2xl">
                      {heroMarket.description || "This market resolves based on an official consensus from verified sources."}
                    </p>
                  </div>
                  <div className="flex gap-6 py-4 border-t border-white/[0.06] mb-6">
                    <div><p className="text-[#7A7068] text-[10px] uppercase mb-1 font-medium">Volume</p>
                         <p className="text-lg font-bold text-white font-mono">${parseInt(heroMarket.volume || "0").toLocaleString()}</p></div>
                    <div><p className="text-[#7A7068] text-[10px] uppercase mb-1 font-medium">YES Probability</p>
                         <p className="text-lg font-bold text-[#00D26A] font-mono">{Math.round(heroYesPrice * 100)}%</p></div>
                    <div><p className="text-[#7A7068] text-[10px] uppercase mb-1 font-medium">Source</p>
                         <p className="text-lg font-bold text-white font-mono">SabiMarkets</p></div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button onClick={() => handleHeroBet('YES')}
                      className="cursor-pointer flex-1 sm:flex-none px-4 sm:px-8 py-2 sm:py-3 rounded-lg sm:rounded-xl font-bold text-[12px] sm:text-[14px] text-black transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #00D26A, #009A4E)', boxShadow: '0 4px 20px rgba(0,210,106,0.3)' }}>
                      <span className="hidden xs:inline">Bet </span>YES · {Math.round(heroYesPrice * 100)}¢
                    </button>
                    <button onClick={() => handleHeroBet('NO')}
                      className="cursor-pointer flex-1 sm:flex-none px-4 sm:px-8 py-2 sm:py-3 rounded-lg sm:rounded-xl font-bold text-[12px] sm:text-[14px] text-white transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: 'linear-gradient(135deg, #FF4560, #CC2E45)', boxShadow: '0 4px 20px rgba(255,69,96,0.3)' }}>
                      <span className="hidden xs:inline">Bet </span>NO · {100 - Math.round(heroYesPrice * 100)}¢
                    </button>
                    <button onClick={() => setHeroDetailOpen(true)}
                      className="cursor-pointer hidden sm:flex items-center gap-1.5 text-[#7A7068] hover:text-white text-sm font-medium transition-colors px-3 py-3 rounded-xl border border-white/[0.07] hover:bg-white/[0.05]">
                      View Details ↗
                    </button>
                  </div>
                </div>
                <div className="w-full lg:w-[420px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/[0.06] bg-[#080706]/40 p-4 flex flex-col">
                  <div className="flex justify-between items-center text-[#7A7068] text-[11px] font-medium mb-3">
                    <span>Implied Probability</span>
                    <div className="flex gap-3">
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#00D26A]" /> YES</span>
                      <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FF4560]" /> NO</span>
                    </div>
                  </div>
                  <div className="flex-1 min-h-[220px] relative">
                    <MarketChart currentYesPrice={heroYesPrice} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Create Market CTA Banner */}
          <div className="mb-6">
            <CreateMarketCTA variant="banner" />
          </div>

          {/* Search + Feed */}
          <div className="hidden md:flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7068] pointer-events-none" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search markets…"
                className="w-full bg-white/[0.04] border border-white/[0.08] text-white text-[13px] rounded-full pl-8 pr-8 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00D26A]/40 focus:border-[#00D26A]/30 transition-all placeholder:text-[#7A7068]"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-[#7A7068] hover:text-white">
                  <X size={12} />
                </button>
              )}
            </div>
            {searchQuery && (
              <span className="text-[12px] text-[#7A7068]">{filteredFeedMarkets.length} result{filteredFeedMarkets.length !== 1 ? 's' : ''}</span>
            )}
          </div>

          {/* Mobile search  */}
          {searchQuery && (
            <div className="md:hidden flex items-center gap-2 mb-4">
              <div className="relative flex-1">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7068] pointer-events-none" />
                <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search markets…"
                  className="w-full bg-white/[0.04] border border-white/[0.08] text-white text-[13px] rounded-full pl-8 pr-8 py-2 focus:outline-none focus:ring-1 focus:ring-[#00D26A]/40 transition-all placeholder:text-[#7A7068]" />
                <button onClick={() => setSearchQuery('')} className="cursor-pointer absolute right-3 top-1/2 -translate-y-1/2 text-[#7A7068]">
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          {filteredFeedMarkets.length > 0 ? (
            <MarketList initialMarkets={filteredFeedMarkets} />
          ) : (
            <EmptyState icon={Globe}
              title={searchQuery ? `No results for "${searchQuery}"` : 'No Markets Available'}
              desc={searchQuery ? 'Try a different search term.' : 'Unable to load markets. Please check back later.'}>
              {!searchQuery && (
                <button onClick={() => window.location.reload()}
                  className="cursor-pointer bg-white/[0.08] text-white px-6 py-2.5 rounded-xl font-bold text-sm hover:bg-white/[0.12] transition-colors border border-white/[0.1] mt-4">
                  Refresh Page
                </button>
              )}
            </EmptyState>
          )}
        </div>
      )}

      <BetModal isOpen={isHeroBetOpen} onClose={() => setHeroBetOpen(false)}
        market={heroMarket} selectedOutcome={heroOutcome}
        currentPrice={heroOutcome === 'YES' ? heroYesPrice : (1 - heroYesPrice)} />
      <MarketDetailModal 
        isOpen={isHeroDetailOpen} 
        onClose={() => setHeroDetailOpen(false)} 
        market={heroMarket}
        onBet={(outcome) => handleHeroBet(outcome)}
      />
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc, children }: {
  icon: React.ElementType; title: string; desc: string; children?: React.ReactNode;
}) {
  return (
    <div className="w-full bg-[#0F0D0B] border border-white/[0.07] rounded-2xl p-16 text-center flex flex-col items-center justify-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-5">
        <Icon size={28} className="text-[#7A7068]" />
      </div>
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      <p className="text-[#7A7068] text-sm max-w-xs leading-relaxed">{desc}</p>
      {children}
    </div>
  );
}
