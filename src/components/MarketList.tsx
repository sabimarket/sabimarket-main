"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/routing";
import { MarketCard } from "./MarketCard";
import { Market } from "@/lib/polymarket/types";
import { BetModal } from "./BetModal";
import { Flame, Globe, Bitcoin, Landmark, Trophy, TrendingUp, Clapperboard } from "lucide-react";
import { CreateMarketCTA } from "./CreateMarketCTA";

export function MarketList({ initialMarkets }: { initialMarkets: (Market & { uiCategory: string })[] }) {
    const router = useRouter();
    const [selectedCategory, setSelectedCategory] = useState<string>("All");
    
    const [isBetModalOpen, setBetModalOpen] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
    const [selectedOutcome, setSelectedOutcome] = useState<string | null>(null);
    const [selectedPrice, setSelectedPrice] = useState<number>(0);

    const categories = [
        { name: "All", icon: <Flame size={13} /> },
        { name: "Global", icon: <Globe size={13} /> },
        { name: "Crypto", icon: <Bitcoin size={13} /> },
        { name: "Politics", icon: <Landmark size={13} /> },
        { name: "Sports", icon: <Trophy size={13} /> },
        { name: "Economy", icon: <TrendingUp size={13} /> },
        { name: "Entertainment", icon: <Clapperboard size={13} /> }
    ];

    const filteredMarkets = selectedCategory === "All" 
        ? initialMarkets 
        : initialMarkets.filter(m => m.uiCategory === selectedCategory);

    const handleMarketClick = (market: Market) => {
        router.push(`/market/${market.id}`);
    };

    const handleBetClick = (e: React.MouseEvent, market: Market, outcome: "YES"|"NO", price: number) => {
        e.stopPropagation();
        setSelectedMarket(market);
        setSelectedOutcome(outcome);
        setSelectedPrice(price);
        setBetModalOpen(true);
    };

    return (
        <div className="w-full flex flex-col">
            
            {/* Section header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <h2 className="text-[15px] font-bold text-white">Live Markets</h2>
                    <span className="text-[11px] text-[#7A7068] bg-white/[0.04] border border-white/[0.07] px-2 py-0.5 rounded-full font-mono">
                        {filteredMarkets.length} markets
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[#00D26A]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00D26A] animate-pulse inline-block" />
                    Live
                </div>
            </div>
            
            {/* Category Filter Pills */}
            <div className="flex overflow-x-auto gap-2 hide-scrollbar mb-6 pb-1">
                {categories.map((cat) => (
                    <button
                        key={cat.name}
                        onClick={() => setSelectedCategory(cat.name)}
                        className={`whitespace-nowrap flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all cursor-pointer ${
                            selectedCategory === cat.name 
                            ? 'bg-white/[0.1] text-white border border-white/[0.15]' 
                            : 'bg-transparent text-[#7A7068] border border-white/[0.06] hover:text-white hover:border-white/[0.12]'
                        }`}
                    >
                        {cat.icon} {cat.name}
                    </button>
                ))}
            </div>

            {/* Markets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredMarkets.length > 0 ? filteredMarkets.map((market, i) => (
                  <MarketCard
                      key={market.id || i}
                      market={market}
                      index={i}
                      onMarketClick={handleMarketClick}
                      onBetClick={handleBetClick}
                  />
                )) : (
                    <div className="col-span-full py-16 text-center flex flex-col items-center gap-4">
                      <p className="text-[#7A7068] text-sm font-mono">No markets found in this category.</p>
                      <CreateMarketCTA variant="banner" />
                    </div>
                )}
            </div>

            <BetModal 
                isOpen={isBetModalOpen} 
                onClose={() => setBetModalOpen(false)} 
                market={selectedMarket}
                selectedOutcome={selectedOutcome}
                currentPrice={selectedPrice}
            />
        </div>
    );
}
