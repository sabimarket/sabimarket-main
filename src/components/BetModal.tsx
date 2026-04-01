"use client";

import { useState, useEffect } from 'react';
import { Market } from '@/lib/polymarket/types';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2, Zap, ArrowUpRight, ArrowDownRight, AlertTriangle, ExternalLink } from 'lucide-react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useToast } from '@/components/Toast';
import { formatUnits, parseUnits } from 'viem';
import { CONTRACTS, USDC_ABI, MARKET_ABI, flowTestnet } from '@/lib/contracts';

export function BetModal({
  isOpen, onClose, market, selectedOutcome: initialOutcome,
}: {
  isOpen: boolean; onClose: () => void; market: Market | null;
  selectedOutcome: string | null; currentPrice?: number;
}) {
  const [amount, setAmount] = useState<number | string>(10);
  const [step, setStep] = useState<'idle' | 'approving' | 'buying' | 'done' | 'error'>('idle');
  const [txError, setTxError] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>(initialOutcome || "YES");

  const { address } = useAccount();
  const { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo } = useToast();

  const { writeContractAsync } = useWriteContract();

  // Read USDC balance on Flow EVM — no polling to avoid flooding the rate-limited RPC
  const { data: usdcBalance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: USDC_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: flowTestnet.id,
    query: { refetchInterval: false, staleTime: 30_000 },
  });

  // Read USDC allowance for the market contract — no polling
  const marketAddress = market?.id as `0x${string}` | undefined;
  const { data: usdcAllowance, refetch: refetchAllowance } = useReadContract({
    address: CONTRACTS.USDC,
    abi: USDC_ABI,
    functionName: 'allowance',
    args: address && marketAddress ? [address, marketAddress] : undefined,
    chainId: flowTestnet.id,
    query: { refetchInterval: false, staleTime: 30_000 },
  });

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

  // Early return after all hooks
  if (!market || !selectedOutcome) return null;

  const outcomes = market.outcomes || ["Yes", "No"];
  const selectedIndex = outcomes.findIndex(o => o.toLowerCase() === selectedOutcome.toLowerCase());
  const outcomeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const isYes = outcomeIndex === 0;
  
  let accentColor = outcomeIndex === 0 ? '#00D26A' : '#FF4560';

  // Get prices from on-chain data
  const selectedPrice = parseFloat(market.outcomePrices?.[outcomeIndex] || "0.5");
  const basePrice = selectedPrice;

  const validAmount = typeof amount === 'string' && amount === "" ? 0 : Number(amount);
  const price = Math.max(0.01, Math.min(0.99, basePrice));
  const shares = price > 0 ? (validAmount / price).toFixed(1) : "0.0";
  const potentialPayoutDollars = parseFloat(shares);
  const profitDollars = potentialPayoutDollars - validAmount;
  const roi = validAmount > 0 ? ((profitDollars / validAmount) * 100).toFixed(0) : "0";

  const usdcBalanceFormatted = usdcBalance
    ? parseFloat(formatUnits(usdcBalance as bigint, 6)).toFixed(2)
    : null;
  const hasEnoughUsdc = usdcBalance
    ? Number(formatUnits(usdcBalance as bigint, 6)) >= validAmount
    : true;

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
    if (!marketAddress) {
      toastError('Market unavailable', 'This market is not available for trading.');
      return;
    }

    setTxError('');
    const amountWei = parseUnits(validAmount.toString(), 6);

    try {
      // Check allowance and approve if needed
      const currentAllowance = usdcAllowance as bigint | undefined;
      if (!currentAllowance || currentAllowance < amountWei) {
        setStep('approving');
        toastInfo('Approving USDC…', 'Please confirm the approval in your wallet.');
        
        const approveTx = await writeContractAsync({
          address: CONTRACTS.USDC,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [marketAddress, amountWei],
          chainId: flowTestnet.id,
          gas: BigInt(80_000),
        });

        // Wait briefly for approval to process
        await new Promise(resolve => setTimeout(resolve, 3000));
        await refetchAllowance();
      }

      // Buy shares
      setStep('buying');
      toastInfo('Buying shares…', 'Please confirm the transaction in your wallet.');

      const buyTx = await writeContractAsync({
        address: marketAddress,
        abi: MARKET_ABI,
        functionName: 'buyShares',
        args: [isYes, amountWei],
        chainId: flowTestnet.id,
        gas: BigInt(300_000),
      });

      setStep('done');
      toastSuccess(
        'Order placed!',
        `Bought ${shares} ${selectedOutcome} shares @ ${(price * 100).toFixed(1)}¢`
      );
      setTimeout(() => { onClose(); setStep('idle'); }, 2000);

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      let msg = 'Something went wrong. Please try again.';
      if (errorMessage.includes('rejected') || errorMessage.includes('User rejected')) {
        msg = 'You rejected the transaction — no order was placed.';
      } else if (errorMessage.includes('insufficient') || errorMessage.includes('exceeds balance')) {
        msg = 'Insufficient USDC balance.';
      } else if (errorMessage !== 'Unknown error') {
        msg = errorMessage.length > 120 ? errorMessage.slice(0, 120) + '…' : errorMessage;
      }
      
      setTxError(msg);
      setStep('error');
      toastError('Order failed', msg);
    }
  };

  const statusLabel = {
    idle: `Buy ${selectedOutcome} · ${shares} Shares`,
    approving: 'Approving USDC…',
    buying: 'Buying shares…',
    done: '✓ Order Placed!',
    error: 'Try Again',
  }[step];

  const isBusy = step === 'approving' || step === 'buying';

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
                {outcomeIndex === 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />} Betting {selectedOutcome}
              </div>
              <span className="text-[10px] text-[#7A7068] flex items-center gap-1">
                <Zap size={9} className="text-[#00D26A]" /> Live · Flow EVM
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

          {/* Outcome Selector */}
          <div className="grid grid-cols-2 gap-2">
            {outcomes.map((outcome, idx) => {
              const price = parseFloat(market.outcomePrices?.[idx] || "0.5");
              const priceCents = Math.round(price * 100);
              const isSelected = selectedOutcome?.toLowerCase() === outcome.toLowerCase();
              
              const activeColor = idx === 0 ? '#00D26A' : '#FF4560';
              const shadowColor = idx === 0 ? 'rgba(0,210,106,0.35)' : 'rgba(255,69,96,0.35)';
              const textColor = idx === 0 ? '#000' : '#fff';
              
              return (
                <button 
                  key={outcome}
                  onClick={() => setSelectedOutcome(outcome)}
                  className="cursor-pointer py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
                  style={isSelected 
                    ? { backgroundColor: activeColor, borderColor: activeColor, color: textColor, boxShadow: `0 4px 18px ${shadowColor}` }
                    : { borderColor: 'rgba(255,255,255,0.08)', color: '#7A7068' }}>
                  {idx === 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {outcome.toUpperCase()} · {priceCents}¢
                </button>
              );
            })}
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
                style={hasEnoughUsdc ? { '--tw-ring-color': accentColor } as React.CSSProperties : {}}
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
              <span className="text-[#7A7068]">Avg Price</span>
              <span className="font-mono font-bold text-white">{(price * 100).toFixed(1)}¢</span>
            </div>
            <div className="flex justify-between items-center px-4 py-2.5 text-[12px]">
              <span className="text-[#7A7068]">Potential Return</span>
              <span className="font-mono font-bold" style={{ color: accentColor }}>
                ${profitDollars.toFixed(2)} (+{roi}%)
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
            disabled={isBusy || validAmount <= 0 || !hasEnoughUsdc || step === 'done'}
            onClick={handlePlaceOrder}
            className="cursor-pointer w-full py-4 rounded-xl font-bold text-[15px] transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ 
              backgroundColor: step === 'done' ? '#00D26A' : accentColor, 
              color: step === 'done' || accentColor === '#00D26A' ? '#000' : '#fff', 
              boxShadow: `0 6px 24px ${accentColor}45` 
            }}
          >
            {isBusy ? <><Loader2 className="animate-spin" size={16} /> {statusLabel}</> : statusLabel}
          </button>

          <div className="flex items-center justify-center gap-2 text-[10px] text-[#7A7068] -mt-2">
            <span>Max win: ${profitDollars > 0 ? profitDollars.toFixed(2) : '0.00'}</span>
            <span>·</span>
            <span>Max loss: ${validAmount.toFixed(2)}</span>
            <span>·</span>
            <a href={`https://evm-testnet.flowscan.io/address/${market.id}`} target="_blank" className="flex items-center gap-1 hover:text-white transition-colors">
              <ExternalLink size={9} /> FlowScan
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
