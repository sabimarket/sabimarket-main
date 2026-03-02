"use client";

import { useState, useEffect } from 'react';
import { Market } from '@/lib/polymarket/types';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2, Zap, ArrowUpRight, ArrowDownRight, AlertTriangle, ExternalLink } from 'lucide-react';
import { useAccount, useSignTypedData, useReadContract } from 'wagmi';
import { useToast } from '@/components/Toast';
import { parseUnits, formatUnits } from 'viem';
import { useMarketStore } from '@/store/marketStore';

// Polymarket CTF Exchange on Polygon
const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
// USDC (PoS) on Polygon
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const USDC_ABI = [
  { name: 'balanceOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

// Spread markup: 0.5%
const SPREAD_BPS = 50;

export function BetModal({
  isOpen, onClose, market, selectedOutcome: initialOutcome, currentPrice,
}: {
  isOpen: boolean; onClose: () => void; market: Market | null;
  selectedOutcome: "YES" | "NO" | null; currentPrice: number;
}) {
  const [amount, setAmount] = useState<number | string>(10);
  const [isSigning, setIsSigning] = useState(false);
  const [step, setStep] = useState<'idle' | 'signing' | 'submitting' | 'done' | 'error'>('idle');
  const [txError, setTxError] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<"YES" | "NO">(initialOutcome || "YES");

  // Get live prices from store
  const { livePrices } = useMarketStore();

  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();
  const { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo } = useToast();

  // Sync outcome when modal opens with new selection
  useEffect(() => {
    if (initialOutcome && isOpen) {
      setSelectedOutcome(initialOutcome);
    }
  }, [initialOutcome, isOpen]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStep('idle');
      setTxError('');
    }
  }, [isOpen]);

  const isYes = selectedOutcome === 'YES';
  const accentColor = isYes ? '#00D26A' : '#FF4560';

  // Get prices from Polymarket data (live prices or fallback to market data)
  const yesTokenId = market?.tokens?.[0]?.token_id;
  const noTokenId = market?.tokens?.[1]?.token_id;
  
  const yesPrice = yesTokenId && livePrices[yesTokenId] !== undefined 
    ? livePrices[yesTokenId] 
    : parseFloat(market?.outcomePrices?.[0] || "0.5");
  const noPrice = noTokenId && livePrices[noTokenId] !== undefined 
    ? livePrices[noTokenId] 
    : parseFloat(market?.outcomePrices?.[1] || "0.5");
  
  // Use the correct price based on selected outcome
  const basePrice = isYes ? yesPrice : noPrice;

  // Read USDC balance
  const { data: usdcBalance } = useReadContract({
    address: USDC_ADDRESS,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
  });

  if (!market || !selectedOutcome) return null;

  const validAmount = typeof amount === 'string' && amount === "" ? 0 : Number(amount);
  // Apply spread to price: buy slightly higher, sell slightly lower
  // Ensure basePrice is valid (between 0.01 and 0.99)
  const safeBasePrice = Math.max(0.01, Math.min(0.99, basePrice || 0.5));
  const spreadPrice = isYes
    ? Math.min(0.99, safeBasePrice * (1 + SPREAD_BPS / 10000))
    : Math.max(0.01, safeBasePrice * (1 - SPREAD_BPS / 10000));

  const yesPriceInCents = Math.round(yesPrice * 100);
  const noPriceInCents = Math.round(noPrice * 100);
  const shares = spreadPrice > 0 ? (validAmount / spreadPrice).toFixed(1) : "0.0";
  const potentialPayoutDollars = parseFloat(shares);
  const profitDollars = potentialPayoutDollars - validAmount;
  const roi = validAmount > 0 ? ((profitDollars / validAmount) * 100).toFixed(0) : "0";

  const usdcBalanceFormatted = usdcBalance
    ? parseFloat(formatUnits(usdcBalance as bigint, 6)).toFixed(2)
    : null;
  const hasEnoughUsdc = usdcBalance
    ? Number(formatUnits(usdcBalance as bigint, 6)) >= validAmount
    : true;

  const tokenId = market.tokens?.[selectedOutcome === 'YES' ? 0 : 1]?.token_id;

  const handlePlaceOrder = async () => {
    if (!address) {
      toastError('Wallet not connected', 'Please connect your wallet first.');
      return;
    }
    if (validAmount <= 0) {
      toastWarning('Invalid amount', 'Enter an amount greater than 0.');
      return;
    }
    if (!hasEnoughUsdc) {
      toastError('Insufficient USDC', `You need $${validAmount} USDC. Balance: $${usdcBalanceFormatted}.`);
      return;
    }
    if (!tokenId) {
      toastError('Market unavailable', 'This market does not have a valid token ID.');
      return;
    }

    setIsSigning(true);
    setTxError('');
    setStep('signing');

    try {
      const salt = BigInt(Date.now());
      const makerAmount = BigInt(Math.round(spreadPrice * validAmount * 1_000_000));
      const takerAmount = BigInt(Math.round(validAmount * 1_000_000));

      // Sign the EIP-712 order with user's wallet
      const signature = await signTypedDataAsync({
        domain: {
          name: "Polymarket CTF Exchange",
          version: "1",
          chainId: 137,
          verifyingContract: CTF_EXCHANGE as `0x${string}`,
        },
        types: {
          Order: [
            { name: "salt",          type: "uint256" },
            { name: "maker",         type: "address" },
            { name: "signer",        type: "address" },
            { name: "taker",         type: "address" },
            { name: "tokenId",       type: "uint256" },
            { name: "makerAmount",   type: "uint256" },
            { name: "takerAmount",   type: "uint256" },
            { name: "expiration",    type: "uint256" },
            { name: "nonce",         type: "uint256" },
            { name: "feeRateBps",    type: "uint256" },
            { name: "side",          type: "uint8"   },
            { name: "signatureType", type: "uint8"   },
          ]
        },
        primaryType: "Order",
        message: {
          salt,
          maker: address,
          signer: address,
          taker: "0x0000000000000000000000000000000000000000",
          tokenId: BigInt(tokenId),
          makerAmount,
          takerAmount,
          expiration: BigInt(0),
          nonce: BigInt(0),
          feeRateBps: BigInt(0),
          side: isYes ? 0 : 1,
          signatureType: 0,
        }
      });

      setStep('submitting');
      toastInfo('Submitting order…', 'Broadcasting to Polymarket CLOB.');

      // POST signed order to our relay API
      const res = await fetch('/api/clob/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenId,
          side: isYes ? 'BUY' : 'SELL',
          price: spreadPrice,
          size: validAmount,
          userAddress: address,
          signature,
          salt: salt.toString(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Order rejected by CLOB');
      }

      setStep('done');
      toastSuccess(
        '🎉 Order placed!',
        `${shares} ${selectedOutcome} shares @ ${isYes ? yesPriceInCents : noPriceInCents}¢. Order ID: ${data.orderId?.slice(0, 8)}...`
      );
      setTimeout(() => { onClose(); setStep('idle'); }, 2000);

    } catch (err: any) {
      const msg = err?.message?.includes('rejected')
        ? 'You rejected the signature — no order was placed.'
        : err?.message || 'Something went wrong.';
      setTxError(msg);
      setStep('error');
      toastError('Order failed', msg);
    } finally {
      setIsSigning(false);
    }
  };

  const statusLabel = {
    idle: `Buy ${selectedOutcome} · ${shares} Shares`,
    signing: 'Sign in your wallet…',
    submitting: 'Submitting to CLOB…',
    done: '✓ Order Placed!',
    error: 'Try Again',
  }[step];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className={[
          "!top-auto !bottom-0 !left-0 !right-0 !translate-x-0 !translate-y-0",
          "w-full max-w-full rounded-t-3xl rounded-b-none",
          "data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom transition-transform duration-300",
          "sm:!top-[50%] sm:!bottom-auto sm:!left-[50%] sm:!right-auto",
          "sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:max-w-[420px] sm:rounded-2xl",
          "bg-[#0F0D0B] border border-white/[0.08] text-white p-0 overflow-hidden shadow-2xl [&>button]:hidden",
        ].join(" ")}
      >
        {/* Mobile drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Accent bar */}
        <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accentColor}70, ${accentColor})` }} />

        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-white/[0.06] flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <div className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border"
                   style={{ color: accentColor, backgroundColor: `${accentColor}18`, borderColor: `${accentColor}30` }}>
                {isYes ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} Betting {selectedOutcome}
              </div>
              <span className="text-[10px] text-[#7A7068] flex items-center gap-1">
                <Zap size={9} className="text-[#00D26A]" /> Live · Polymarket CLOB
              </span>
            </div>
            <p className="text-[13px] text-[#7A7068] leading-snug line-clamp-2">{market.question}</p>
          </div>
          <button onClick={onClose}
            className="cursor-pointer p-1.5 hover:bg-white/[0.08] rounded-lg transition-colors shrink-0 text-[#7A7068] hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 pt-4 pb-6 flex flex-col gap-4 overflow-y-auto max-h-[72vh] sm:max-h-none">

          {/* YES / NO */}
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={() => setSelectedOutcome('YES')}
              className="cursor-pointer py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
              style={isYes ? { backgroundColor: '#00D26A', borderColor: '#00D26A', color: '#000', boxShadow: '0 4px 18px rgba(0,210,106,0.35)' }
                          : { borderColor: 'rgba(255,255,255,0.08)', color: '#7A7068' }}>
              <ArrowUpRight size={14} /> YES · {yesPriceInCents}¢
            </button>
            <button 
              onClick={() => setSelectedOutcome('NO')}
              className="cursor-pointer py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
              style={!isYes ? { backgroundColor: '#FF4560', borderColor: '#FF4560', color: '#fff', boxShadow: '0 4px 18px rgba(255,69,96,0.35)' }
                           : { borderColor: 'rgba(255,255,255,0.08)', color: '#7A7068' }}>
              <ArrowDownRight size={14} /> NO · {noPriceInCents}¢
            </button>
          </div>

          {/* USDC balance indicator */}
          {usdcBalanceFormatted && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#7A7068]">USDC Balance</span>
              <span className={`font-mono font-bold ${hasEnoughUsdc ? 'text-[#00D26A]' : 'text-[#FF4560]'}`}>
                ${usdcBalanceFormatted}
              </span>
            </div>
          )}

          {/* Amount */}
          <div>
            <p className="text-[10px] font-semibold text-[#7A7068] uppercase tracking-widest mb-2">Amount (USDC)</p>
            <div className="relative mb-2">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A7068] text-sm pointer-events-none">$</span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                inputMode="decimal"
                className={`w-full bg-white/[0.05] border rounded-xl py-3 pl-8 pr-4 text-white font-mono font-bold text-[15px] focus:outline-none transition-all ${
                  !hasEnoughUsdc ? 'border-[#FF4560]/40' : 'border-white/[0.08] focus:ring-1'
                }`}
                style={hasEnoughUsdc ? { '--tw-ring-color': accentColor } as any : {}}
              />
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[10, 25, 50, 100].map(p => (
                <button key={p} onClick={() => setAmount(p)}
                  className="cursor-pointer py-2 rounded-lg text-[11px] font-bold border border-white/[0.07] bg-white/[0.04] hover:bg-white/[0.09] text-[#7A7068] hover:text-white transition-all">
                  ${p}
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.022] divide-y divide-white/[0.05]">
            <div className="flex justify-between items-center px-4 py-2.5 text-[12px]">
              <span className="text-[#7A7068]">Shares</span>
              <span className="font-mono font-bold text-white">{shares}</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5 text-[12px]">
              <span className="text-[#7A7068]">Price (incl. 0.5% spread)</span>
              <span className="font-mono font-bold text-white">{Math.round(spreadPrice * 100)}¢</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5 text-[12px]">
              <span className="text-[#7A7068]">Potential Return</span>
              <span className="font-mono font-bold" style={{ color: accentColor }}>
                ${potentialPayoutDollars.toFixed(2)} (+{roi}%)
              </span>
            </div>
          </div>

          {/* Error state */}
          {step === 'error' && txError && (
            <div className="flex gap-2 bg-[#FF4560]/10 border border-[#FF4560]/20 rounded-xl p-3">
              <AlertTriangle size={14} className="text-[#FF4560] shrink-0 mt-0.5" />
              <p className="text-[11px] text-[#FF4560] leading-snug">{txError}</p>
            </div>
          )}

          {/* CTA */}
          <button
            disabled={isSigning || validAmount <= 0 || !hasEnoughUsdc || step === 'done'}
            onClick={handlePlaceOrder}
            className="cursor-pointer w-full py-4 rounded-xl font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ backgroundColor: step === 'done' ? '#00D26A' : accentColor, color: isYes || step === 'done' ? '#000' : '#fff', boxShadow: `0 6px 24px ${accentColor}45` }}
          >
            {(step === 'signing' || step === 'submitting') ? <><Loader2 className="animate-spin" size={16} /> {statusLabel}</> : statusLabel}
          </button>

          <div className="flex items-center justify-center gap-2 text-[10px] text-[#7A7068] -mt-2">
            <span>Max win: ${potentialPayoutDollars.toFixed(2)}</span>
            <span>·</span>
            <span>Max loss: ${validAmount.toFixed(2)}</span>
            <span>·</span>
            <a href="https://polymarket.com" target="_blank" className="flex items-center gap-1 hover:text-white transition-colors">
              <ExternalLink size={9} /> Polymarket
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
