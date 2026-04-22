"use client";

import { useState, useEffect } from 'react';
import { Market } from '@/lib/polymarket/types';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X, Loader2, Zap, ArrowUpRight, ArrowDownRight, AlertTriangle, ExternalLink } from 'lucide-react';
import { useWallet } from '@/components/Providers';
import { useToast } from '@/components/Toast';
import { fetchUsdcBalance } from '@/lib/stellar/api';
import { signTransactionXDR } from '@/lib/stellar/wallet';
import { STELLAR_CONTRACTS, STELLAR_NETWORK_PASSPHRASE, explorerLink } from '@/lib/stellar/contracts';

// -- Stellar transaction helpers (client-side only) --------------------------

async function buildAndSignInvocation(
  address: string,
  contractId: string,
  method: string,
  args: unknown[],
): Promise<string> {
  // Dynamic import — @stellar/stellar-sdk is large, keep it code-split
  const {
    rpc, Contract, TransactionBuilder, BASE_FEE,
    Networks, Address, nativeToScVal,
  } = await import('@stellar/stellar-sdk');

  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC ?? 'https://soroban-testnet.stellar.org';
  const server = new rpc.Server(rpcUrl, { allowHttp: false });
  const account = await server.getAccount(address);

  const contract = new Contract(contractId);

  // Encode args: Stellar addresses (G.../C... 56-char) must be ScvAddress, not ScvString
  const isStellarAddress = (v: unknown): v is string =>
    typeof v === 'string' && v.length === 56 && /^[A-Z2-7]+$/.test(v);

  const scArgs = args.map(a => {
    if (isStellarAddress(a)) return Address.fromString(a).toScVal();
    return nativeToScVal(a as never);
  });

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...scArgs))
    .setTimeout(30)
    .build();

  // Simulate to get footprint + resource fee
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signed = await signTransactionXDR(prepared.toXDR(), STELLAR_NETWORK_PASSPHRASE);

  // Submit
  const result = await server.sendTransaction(
    (await import('@stellar/stellar-sdk')).TransactionBuilder.fromXDR(signed, Networks.TESTNET)
  );
  if (result.status === 'ERROR') throw new Error(result.errorResult?.toString() ?? 'Transaction failed');
  return result.hash;
}

// ---------------------------------------------------------------------------

export function BetModal({
  isOpen, onClose, market, selectedOutcome: initialOutcome,
}: {
  isOpen: boolean; onClose: () => void; market: Market | null;
  selectedOutcome: string | null; currentPrice?: number;
}) {
  const [amount, setAmount] = useState<number | string>(10);
  const [step, setStep] = useState<'idle' | 'approving' | 'buying' | 'done' | 'error'>('idle');
  const [txError, setTxError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [approveTxHash, setApproveTxHash] = useState('');
  const [selectedOutcome, setSelectedOutcome] = useState<string>(initialOutcome || 'YES');
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);

  const { address, isConnected, connect } = useWallet();
  const { success: toastSuccess, error: toastError, warning: toastWarning, info: toastInfo } = useToast();

  // Sync outcome when modal opens
  useEffect(() => {
    if (initialOutcome && isOpen) setSelectedOutcome(initialOutcome);
  }, [initialOutcome, isOpen]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) { setStep('idle'); setTxError(''); setTxHash(''); setApproveTxHash(''); }
  }, [isOpen]);

  // Fetch USDC balance
  useEffect(() => {
    if (isConnected && address && isOpen) {
      fetchUsdcBalance(address).then(setUsdcBalance).catch(() => setUsdcBalance(null));
    }
  }, [address, isConnected, isOpen]);

  if (!market || !selectedOutcome) return null;

  const outcomes = market.outcomes || ['Yes', 'No'];
  const selectedIndex = outcomes.findIndex(o => o.toLowerCase() === selectedOutcome.toLowerCase());
  const outcomeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const isYes = outcomeIndex === 0;

  const accentColor = isYes ? '#00D26A' : '#FF4560';
  const selectedPrice = parseFloat(market.outcomePrices?.[outcomeIndex] || '0.5');
  const validAmount = typeof amount === 'string' && amount === '' ? 0 : Number(amount);
  const price = Math.max(0.01, Math.min(0.99, selectedPrice));
  const shares = price > 0 ? (validAmount / price).toFixed(1) : '0.0';
  const potentialPayout = parseFloat(shares);
  const profit = potentialPayout - validAmount;
  const roi = validAmount > 0 ? ((profit / validAmount) * 100).toFixed(0) : '0';

  const hasEnoughUsdc = usdcBalance !== null ? usdcBalance >= validAmount : true;

  const handlePlaceOrder = async () => {
    if (!isConnected || !address) {
      await connect();
      return;
    }
    if (validAmount <= 0) { toastWarning('Invalid amount', 'Enter an amount greater than 0.'); return; }
    if (usdcBalance !== null && !hasEnoughUsdc) {
      toastError('Insufficient USDC', `You need $${validAmount}. Balance: $${usdcBalance?.toFixed(2)}.`);
      return;
    }

    setTxError('');
    const SCALAR = 1_000_000;
    const usdcAmount = Math.round(validAmount * SCALAR);

    try {
      // Step 1 — Approve USDC spending
      setStep('approving');
      toastInfo('Step 1/2 — Approve USDC', 'Please confirm in Freighter.');
      const approveHash = await buildAndSignInvocation(address, STELLAR_CONTRACTS.USDC, 'approve', [
        address,          // from
        market.id,        // spender (market contract)
        usdcAmount,       // amount
        null,             // expiry (null = max)
      ]);
      setApproveTxHash(approveHash);

      // Step 2 — Buy shares
      setStep('buying');
      toastInfo('Step 2/2 — Buying shares', 'Please confirm in Freighter.');
      const hash = await buildAndSignInvocation(address, market.id, 'buy_shares', [
        address,     // buyer
        isYes,       // is_yes
        usdcAmount,  // usdc_amount
      ]);

      setTxHash(hash);
      setStep('done');
      toastSuccess('Order placed!', `Bought ${shares} ${selectedOutcome} shares @ ${(price * 100).toFixed(1)}¢`);
      setTimeout(() => { onClose(); setStep('idle'); }, 3000);

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      const friendly = msg.includes('User rejected') || msg.includes('rejected')
        ? 'You rejected the transaction.'
        : msg.length > 120 ? msg.slice(0, 120) + '…' : msg;
      setTxError(friendly);
      setStep('error');
      toastError('Order failed', friendly);
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
          '!top-auto !bottom-0 !left-0 !right-0 !translate-x-0 !translate-y-0',
          'w-full max-w-full rounded-t-3xl rounded-b-none',
          'sm:!top-[50%] sm:!bottom-auto sm:!left-[50%] sm:!right-auto',
          'sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:max-w-[420px] sm:rounded-2xl',
          'bg-[#0F0D0B] border border-white/[0.08] text-white p-0 overflow-hidden shadow-2xl [&>button]:hidden',
        ].join(' ')}
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
                <Zap size={9} className="text-[#00D26A]" /> Stellar · Soroban
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
              const p = parseFloat(market.outcomePrices?.[idx] || '0.5');
              const isSelected = selectedOutcome?.toLowerCase() === outcome.toLowerCase();
              const color = idx === 0 ? '#00D26A' : '#FF4560';
              return (
                <button
                  key={outcome}
                  onClick={() => setSelectedOutcome(outcome)}
                  className="cursor-pointer py-3 rounded-xl border font-bold text-sm flex items-center justify-center gap-1.5 transition-all"
                  style={isSelected
                    ? { backgroundColor: color, borderColor: color, color: idx === 0 ? '#000' : '#fff', boxShadow: `0 4px 18px ${color}55` }
                    : { borderColor: 'rgba(255,255,255,0.08)', color: '#7A7068' }
                  }
                >
                  {idx === 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {outcome.toUpperCase()} · {Math.round(p * 100)}¢
                </button>
              );
            })}
          </div>

          {/* USDC balance */}
          {usdcBalance !== null && (
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#7A7068]">USDC Balance</span>
              <span className={`font-mono font-bold ${hasEnoughUsdc ? 'text-[#00D26A]' : 'text-[#FF4560]'}`}>
                ${usdcBalance.toFixed(2)}
              </span>
            </div>
          )}

          {/* Amount */}
          <div>
            <p className="text-[10px] font-semibold text-[#7A7068] uppercase tracking-widest mb-2">Amount (USDC)</p>
            <div className="relative mb-2">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7A7068] text-sm pointer-events-none">$</span>
              <input
                type="number" value={amount}
                onChange={e => setAmount(e.target.value)}
                inputMode="decimal"
                className={`w-full bg-white/[0.05] border rounded-xl py-3 pl-8 pr-4 text-white font-mono font-bold text-[15px] focus:outline-none transition-all ${
                  !hasEnoughUsdc ? 'border-[#FF4560]/40' : 'border-white/[0.08] focus:ring-1 focus:ring-[#00D26A]/40 focus:border-[#00D26A]/30'
                }`}
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
            {[
              { label: 'Shares', value: shares },
              { label: 'Price per share', value: `${(price * 100).toFixed(1)}¢` },
              { label: 'Potential payout', value: `$${potentialPayout.toFixed(2)}` },
              { label: 'ROI', value: `${profit >= 0 ? '+' : ''}${roi}%`, color: profit >= 0 ? '#00D26A' : '#FF4560' },
            ].map(row => (
              <div key={row.label} className="flex justify-between items-center px-4 py-2.5 text-[12px]">
                <span className="text-[#7A7068]">{row.label}</span>
                <span className="font-mono font-bold" style={row.color ? { color: row.color } : { color: 'white' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Error */}
          {step === 'error' && txError && (
            <div className="flex items-start gap-2.5 bg-[#FF4560]/10 border border-[#FF4560]/20 rounded-xl px-4 py-3 text-[12px] text-[#FF4560]">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p className="leading-relaxed">{txError}</p>
            </div>
          )}

          {/* 2-step progress indicator */}
          {(step === 'approving' || step === 'buying' || step === 'done') && (
            <div className="flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              {[
                { label: 'Approve USDC', active: step === 'approving', done: step === 'buying' || step === 'done', hash: approveTxHash },
                { label: 'Buy Shares', active: step === 'buying', done: step === 'done', hash: txHash },
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-3 text-[12px]">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${
                    s.done ? 'bg-[#00D26A] border-[#00D26A]' :
                    s.active ? 'border-[#00D26A] bg-[#00D26A]/10' :
                    'border-white/[0.12] bg-transparent'
                  }`}>
                    {s.done ? <span className="text-black text-[10px] font-bold">✓</span> :
                     s.active ? <Loader2 size={10} className="animate-spin text-[#00D26A]" /> :
                     <span className="text-[#7A7068] text-[10px]">{i + 1}</span>}
                  </div>
                  <span className={s.done || s.active ? 'text-white font-medium' : 'text-[#7A7068]'}>{s.label}</span>
                  {s.hash && (
                    <a href={`https://stellar.expert/explorer/testnet/tx/${s.hash}`} target="_blank" rel="noopener noreferrer"
                       className="ml-auto flex items-center gap-1 text-[#00D26A] hover:underline text-[10px]">
                      <ExternalLink size={10} /> tx
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Success tx link (final) */}
          {step === 'done' && txHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 text-[12px] text-[#00D26A] hover:underline"
            >
              <ExternalLink size={12} /> View buy transaction on Stellar Expert
            </a>
          )}

          {/* CTA */}
          {!isConnected ? (
            <button
              onClick={connect}
              className="cursor-pointer w-full py-4 rounded-xl font-bold text-[14px] bg-[#00D26A] hover:bg-[#00B85E] text-black transition-all"
            >
              Connect Freighter to Trade
            </button>
          ) : (
            <button
              onClick={step === 'error' ? () => setStep('idle') : handlePlaceOrder}
              disabled={isBusy || validAmount <= 0 || (usdcBalance !== null && !hasEnoughUsdc)}
              className="cursor-pointer w-full py-4 rounded-xl font-bold text-[14px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={step === 'done'
                ? { backgroundColor: '#00D26A', color: '#000' }
                : { backgroundColor: accentColor, color: isYes ? '#000' : '#fff' }
              }
            >
              {isBusy && <Loader2 size={16} className="animate-spin" />}
              {statusLabel}
            </button>
          )}

          <p className="text-[10px] text-center text-[#7A7068]">
            Trades execute directly on Stellar Soroban. 1% protocol fee.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
