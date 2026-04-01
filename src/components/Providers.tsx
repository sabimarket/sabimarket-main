"use client";

import '@rainbow-me/rainbowkit/styles.css';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider, http } from 'wagmi';
import { QueryClientProvider, QueryClient } from "@tanstack/react-query";
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { ToastProvider } from '@/components/Toast';
import { AnalyticsProvider } from '@/components/AnalyticsProvider';
import { flowTestnet } from '@/lib/contracts';

const RPC_URL = 'https://testnet.evm.nodes.onflow.org';

const config = getDefaultConfig({
    appName: 'SabiMarket',
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'd579a8a79998b9febf26831effd00175',
    chains: [flowTestnet],
    ssr: true,
    transports: {
        [flowTestnet.id]: http(RPC_URL, { retryCount: 4, retryDelay: 600 }),
    },
});

const queryClient = new QueryClient();

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <WagmiProvider config={config}>
            <QueryClientProvider client={queryClient}>
                <RainbowKitProvider theme={darkTheme({
                    accentColor: '#00D26A',
                    accentColorForeground: 'black',
                    borderRadius: 'large',
                    fontStack: 'system',
                    overlayBlur: 'small',
                })}>
                    <ToastProvider>
                        <AnalyticsProvider />
                        {children}
                        <Analytics />
                        <SpeedInsights />
                    </ToastProvider>
                </RainbowKitProvider>
            </QueryClientProvider>
        </WagmiProvider>
    );
}
