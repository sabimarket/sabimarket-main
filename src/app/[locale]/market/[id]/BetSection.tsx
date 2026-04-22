"use client";

import { useState } from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { BetModal } from '@/components/BetModal';
import type { Market } from '@/lib/polymarket/types';

interface Props {
  market: Market;
}

export function BetSection({ market }: Props) {
  const [betOpen, setBetOpen] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const yesPrice = parseFloat(market.outcomePrices?.[0] || '0.5');
  const noPrice  = parseFloat(market.outcomePrices?.[1] || '0.5');

  const openBet = (o: string) => {
    setOutcome(o);
    setBetOpen(true);
  };

  return (
    <>
      <div className="flex gap-3">
        <button
          onClick={() => openBet('YES')}
          className="flex-1 py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #00D26A, #009A4E)', color: '#000', boxShadow: '0 4px 20px rgba(0,210,106,0.25)' }}
        >
          <ArrowUpRight size={16} />
          YES · {Math.round(yesPrice * 100)}¢
        </button>
        <button
          onClick={() => openBet('NO')}
          className="flex-1 py-3 rounded-xl font-bold text-[14px] flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #FF4560, #CC2E45)', color: '#fff', boxShadow: '0 4px 20px rgba(255,69,96,0.25)' }}
        >
          <ArrowDownRight size={16} />
          NO · {Math.round(noPrice * 100)}¢
        </button>
      </div>

      <BetModal
        isOpen={betOpen}
        onClose={() => setBetOpen(false)}
        market={market}
        selectedOutcome={outcome}
      />
    </>
  );
}
