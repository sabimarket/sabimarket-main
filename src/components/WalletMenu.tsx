"use client";

import { useState, useRef, useEffect } from 'react';
import {
  Copy, ExternalLink, Settings, LogOut, ChevronDown,
  CheckCircle, Wallet, TrendingUp, Download, Droplets
} from 'lucide-react';
import { useRouter } from '@/i18n/routing';
import { useWallet } from '@/components/Providers';
import { shortenStellarAddress, stellarAvatarGradient } from '@/lib/stellar/wallet';
import { accountLink } from '@/lib/stellar/contracts';
import { fetchUsdcBalance } from '@/lib/stellar/api';

function MenuItem({
  icon: Icon, label, onClick, color,
}: {
  icon: React.ElementType; label: string; onClick: () => void; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] transition-colors text-[13px] font-medium text-[#C4BFB8]"
      style={color ? { color } : undefined}
    >
      <Icon size={14} />
      <span>{label}</span>
    </button>
  );
}

export function WalletMenu() {
  const [mounted, setMounted] = useState(false);
  const { address, isConnected, isInstalled, connecting, connect, disconnect } = useWallet();
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
  const [fundingBot, setFundingBot] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch USDC balance when wallet opens and is connected
  useEffect(() => {
    if (isConnected && address && isOpen) {
      fetchUsdcBalance(address).then(bal => setUsdcBalance(bal)).catch(() => setUsdcBalance(null));
    }
  }, [address, isConnected, isOpen]);

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleViewOnExplorer = () => {
    if (address) window.open(accountLink(address), '_blank');
  };

  const handleFriendbot = async () => {
    if (!address) return;
    setFundingBot(true);
    try {
      await fetch(`https://friendbot.stellar.org/?addr=${encodeURIComponent(address)}`);
      // Refetch balance after a short delay
      setTimeout(() => {
        fetchUsdcBalance(address).then(bal => setUsdcBalance(bal)).catch(() => {});
      }, 2000);
    } finally {
      setFundingBot(false);
    }
  };

  if (!mounted) {
    return <div className="w-[120px] h-10 bg-white/[0.05] border border-white/[0.09] rounded-xl animate-pulse" />;
  }

  if (!isConnected || !address) {
    if (!isInstalled) {
      return (
        <a
          href="https://www.freighter.app/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 bg-white/[0.05] border border-white/[0.09] text-[#F0EBE1] text-[13px] font-semibold rounded-xl transition-all hover:bg-white/[0.09]"
        >
          <Download size={13} />
          <span className="hidden sm:inline">Get Freighter</span>
        </a>
      );
    }

    return (
      <button
        onClick={connect}
        disabled={connecting}
        className="cursor-pointer flex items-center gap-2 px-3 py-1.5 bg-[#00D26A] hover:bg-[#00B85E] disabled:opacity-60 text-black text-[13px] font-bold rounded-xl transition-all"
      >
        <Wallet size={13} />
        <span>{connecting ? 'Connecting…' : 'Connect'}</span>
      </button>
    );
  }

  const gradient = stellarAvatarGradient(address);
  const short = shortenStellarAddress(address);

  return (
    <div ref={ref} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer flex items-center gap-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.09] rounded-xl px-3 py-1.5 transition-all group"
      >
        <div className="w-6 h-6 rounded-full shrink-0 ring-1 ring-white/10" style={{ background: gradient }} />
        <div className="hidden sm:flex items-center gap-1.5">
          <span className="font-mono text-[12px] text-white font-semibold tracking-tight">{short}</span>
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="w-[3px] h-[10px] rounded-full"
                   style={{ background: gradient, opacity: 0.4 + i * 0.12 }} />
            ))}
          </div>
        </div>
        <ChevronDown size={12} className={`text-[#7A7068] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-[#0F0D0B] border border-white/[0.09] rounded-2xl shadow-2xl z-50 overflow-hidden">

          {/* Profile Header */}
          <div className="p-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl ring-2 ring-white/10 flex-shrink-0" style={{ background: gradient }} />
              <div className="flex-1 min-w-0">
                <p className="font-mono font-semibold text-white text-[13px] truncate">{short}</p>
                <p className="text-[11px] text-[#7A7068] flex items-center gap-1.5 mt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D26A] animate-pulse inline-block" />
                  Stellar Testnet · Freighter
                </p>
              </div>
            </div>
            {usdcBalance !== null && (
              <div className="flex items-center justify-between bg-white/[0.04] rounded-lg px-3 py-2 border border-white/[0.06]">
                <div className="flex items-center gap-2 text-[12px] text-[#7A7068]">
                  <Wallet size={12} />
                  <span>USDC Balance</span>
                </div>
                <span className="font-mono text-sm font-bold text-white">
                  ${usdcBalance.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-2">
            <MenuItem
              icon={copied ? CheckCircle : Copy}
              label={copied ? 'Copied!' : 'Copy Address'}
              onClick={handleCopy}
              color={copied ? '#00D26A' : undefined}
            />
            <MenuItem
              icon={ExternalLink}
              label="View on Stellar Expert"
              onClick={handleViewOnExplorer}
            />
            {(usdcBalance === 0 || usdcBalance === null) && (
              <MenuItem
                icon={Droplets}
                label={fundingBot ? 'Funding…' : 'Fund with Friendbot (Testnet)'}
                onClick={handleFriendbot}
                color="#F5A623"
              />
            )}
            <MenuItem
              icon={TrendingUp}
              label="My Portfolio"
              onClick={() => setIsOpen(false)}
            />
            <MenuItem
              icon={Settings}
              label="Settings"
              onClick={() => { setIsOpen(false); router.push('/settings'); }}
            />
          </div>

          {/* Disconnect */}
          <div className="border-t border-white/[0.06] p-2">
            <button
              onClick={() => { disconnect(); setIsOpen(false); }}
              className="cursor-pointer w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[#FF4560] hover:bg-[#FF4560]/10 transition-colors text-[13px] font-semibold"
            >
              <LogOut size={14} />
              <span>Disconnect</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
