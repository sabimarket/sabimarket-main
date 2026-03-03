import { getTranslations } from 'next-intl/server';
import { getLocale } from 'next-intl/server';
import { fetchAfricanMarkets } from '@/lib/polymarket/api';
import { translateMarkets } from '@/lib/translate';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { WalletMenu } from '@/components/WalletMenu';
import { Search } from 'lucide-react';
import Marquee from '@/components/Marquee';
import { FeedAndPortfolio } from '@/components/FeedAndPortfolio';

export default async function HomePage() {
  const [t, locale, rawMarkets] = await Promise.all([
    getTranslations('Home'),
    getLocale(),
    fetchAfricanMarkets(),
  ]);

  // Translate market questions & descriptions into the active locale (server-side)
  const markets = await translateMarkets(rawMarkets, locale);

  const heroMarket = markets.length > 0 ? markets[0] : null;
  const feedMarkets = markets.length > 0 ? markets.slice(1) : [];

  const heroYesPriceStr = heroMarket?.outcomePrices && Array.isArray(heroMarket.outcomePrices)
    ? heroMarket.outcomePrices[0]
    : "0.5";
  const heroYesPrice = parseFloat(heroYesPriceStr);

  return (
    <main className="flex flex-col min-h-screen bg-[#080706] text-[#F0EBE1] font-sans antialiased selection:bg-[#00D26A]/20">

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.04]"
             style={{ background: 'radial-gradient(circle, #00D26A 0%, transparent 70%)' }} />
        <div className="absolute -bottom-40 -right-20 w-[500px] h-[500px] rounded-full opacity-[0.03]"
             style={{ background: 'radial-gradient(circle, #F5A623 0%, transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
      </div>

      {/* ─── NAVBAR ─── */}
      <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-[#080706]/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-8 h-14 gap-4">

          {/* Logo */}
          <a href="/" className="flex items-center gap-2 shrink-0">
            <img src="/sabimarket-logo.png" alt="SabiMarket" className="w-8 h-8 shrink-0" />
            {/* <span className="text-[15px] font-bold text-white tracking-tight hidden sm:inline">
              Sabi<span className="text-[#00D26A]">Markets</span>
            </span> */}
            <span className="text-[9px] font-bold text-[#7A7068] bg-white/[0.05] border border-white/[0.08] px-1.5 py-0.5 rounded-full uppercase tracking-widest hidden md:inline">
              Africa
            </span>
          </a>

          {/* Search Bar */}
          <div className="hidden md:flex flex-1 max-w-[400px] mx-auto relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7068] pointer-events-none" />
            <input
              id="market-search"
              type="text"
              placeholder={t('search_placeholder')}
              className="w-full bg-white/[0.04] border border-white/[0.08] text-white text-[13px] rounded-full pl-8 pr-4 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#00D26A]/40 focus:border-[#00D26A]/30 transition-all placeholder:text-[#7A7068]"
            />
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-2 shrink-0">
            <LanguageSwitcher />
            <WalletMenu />
          </div>
        </div>
      </header>

      {/* ─── MOBILE SEARCH ─── */}
      <div className="md:hidden w-full px-4 py-3 border-b border-white/[0.06] bg-[#080706]/80 backdrop-blur-xl">
        <div className="relative w-full">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#7A7068] pointer-events-none" />
          <input
            type="text"
            placeholder={t('search_placeholder')}
            className="w-full bg-white/[0.04] border border-white/[0.08] text-white text-[13px] rounded-full pl-8 pr-4 py-2 focus:outline-none focus:ring-1 focus:ring-[#00D26A]/40 focus:border-[#00D26A]/30 transition-all placeholder:text-[#7A7068]"
          />
        </div>
      </div>

      {/* ─── LIVE TICKER ─── */}
      <div className="w-full border-b border-white/[0.05] bg-[#080706]/60 overflow-hidden py-2">
        <Marquee markets={markets.slice(0, 12)} />
      </div>

      {/* ─── MAIN CONTENT ─── */}
      <div className="max-w-[1400px] mx-auto w-full px-4 sm:px-6 lg:px-8 pt-6 pb-24 relative z-10">
        <FeedAndPortfolio
          heroMarket={heroMarket}
          feedMarkets={feedMarkets}
          heroYesPrice={heroYesPrice}
        />
      </div>

    </main>
  );
}
