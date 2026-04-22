"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ToastProvider } from '@/components/Toast';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import {
  connectFreighter,
  getConnectedAddress,
  isFreighterInstalled,
  type FreighterAccount,
} from '@/lib/stellar/wallet';

// ─── Freighter Wallet Context ───────────────────────────────────────────────

interface WalletContextValue {
  address: string | null;
  network: string | null;
  isConnected: boolean;
  isInstalled: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const WalletContext = createContext<WalletContextValue>({
  address: null,
  network: null,
  isConnected: false,
  isInstalled: false,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
});

export function useWallet() {
  return useContext(WalletContext);
}

const WALLET_CACHE_KEY = 'sabimarket:wallet';

function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<FreighterAccount | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // On mount: check installation + restore previous connection
  useEffect(() => {
    (async () => {
      const installed = await isFreighterInstalled();
      setIsInstalled(installed);
      if (installed) {
        const addr = await getConnectedAddress();
        if (addr) {
          setAccount({ address: addr, network: 'testnet' });
          localStorage.setItem(WALLET_CACHE_KEY, addr);
        } else {
          // Freighter no longer connected — clear stale cache
          localStorage.removeItem(WALLET_CACHE_KEY);
        }
      }
    })();
  }, []);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const acc = await connectFreighter();
      if (acc) {
        setAccount(acc);
        localStorage.setItem(WALLET_CACHE_KEY, acc.address);
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setAccount(null);
    localStorage.removeItem(WALLET_CACHE_KEY);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address: account?.address ?? null,
        network: account?.network ?? null,
        isConnected: !!account?.address,
        isInstalled,
        connecting,
        connect,
        disconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// ─── Root Providers ──────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WalletProvider>
      <ToastProvider>
        <AnalyticsProvider />
        {children}
        <Analytics />
        <SpeedInsights />
      </ToastProvider>
    </WalletProvider>
  );
}
