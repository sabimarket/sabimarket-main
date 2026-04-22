import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { explorerLink } from '@/lib/stellar/contracts';
import type { Market } from '@/lib/polymarket/types';
import { BetSection } from './BetSection';
import { ArrowLeft, ExternalLink, Clock, Shield } from 'lucide-react';

type Props = { params: Promise<{ locale: string; id: string }> };

// ─── SEO Metadata ────────────────────────────────────────────────────────────

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const row = await prisma.marketCuration.findFirst({ where: { conditionId: id } });
  if (!row) return { title: 'Market Not Found | SabiMarkets' };
  return {
    title: `${row.title} | SabiMarkets`,
    description: `Place your prediction on "${row.title}" — Africa's on-chain prediction market powered by Stellar.`,
    openGraph: {
      title: row.title,
      description: `Trade YES/NO shares on SabiMarkets · Stellar Soroban · ${row.category}`,
      siteName: 'SabiMarkets',
    },
    twitter: {
      card: 'summary',
      title: row.title,
      description: `Bet on "${row.title}" on SabiMarkets`,
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function MarketDetailPage({ params }: Props) {
  const { id, locale } = await params;

  // Fetch from DB
  const row = await prisma.marketCuration.findFirst({ where: { conditionId: id, isActive: true } });
  if (!row) notFound();

  // Build a Market object from DB data (prices default to 50/50)
  const market: Market = {
    id: row.conditionId,
    condition_id: row.conditionId,
    question: row.title,
    description: '',
    category: row.category,
    imageUri: '',
    image: '',
    outcomes: ['Yes', 'No'],
    outcomePrices: ['0.5000', '0.5000'],
    volume: '0',
    active: true,
    closed: false,
    resolved: false,
    outcome: 0,
    endDate: (row as { endDate?: string | Date }).endDate
      ? new Date((row as { endDate: string | Date }).endDate!).toISOString()
      : '',
    totalYesShares: '0.000000',
    totalNoShares: '0.000000',
    totalCollateral: '0.000000',
    createdAt: Math.floor(row.createdAt.getTime() / 1000),
  };

  const backHref = `/${locale}`;

  return (
    <main className="min-h-screen bg-[#080706] text-[#F0EBE1] font-sans antialiased">
      {/* Ambient bg */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full opacity-[0.04]"
             style={{ background: 'radial-gradient(circle, #00D26A 0%, transparent 70%)' }} />
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 relative z-10">

        {/* Back button */}
        <Link href={backHref}
          className="inline-flex items-center gap-2 text-[13px] text-[#7A7068] hover:text-white transition-colors mb-8">
          <ArrowLeft size={14} /> Back to Markets
        </Link>

        {/* Card */}
        <div className="bg-[#0F0D0B] border border-white/[0.08] rounded-3xl overflow-hidden">

          {/* Accent bar */}
          <div className="h-[3px] w-full" style={{ background: 'linear-gradient(90deg, #00D26A, #00A854)' }} />

          <div className="p-6 sm:p-8 flex flex-col gap-8">

            {/* Header */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A7068] bg-white/[0.05] border border-white/[0.08] px-2.5 py-1 rounded-full">
                  {market.category}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] text-[#7A7068]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#00D26A] animate-pulse inline-block" />
                  Stellar · Soroban
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight">{market.question}</h1>
            </div>

            {/* Probability bar */}
            <div>
              <div className="flex justify-between text-[12px] text-[#7A7068] mb-2">
                <span>YES · {Math.round(parseFloat(market.outcomePrices[0]) * 100)}%</span>
                <span>NO · {Math.round(parseFloat(market.outcomePrices[1]) * 100)}%</span>
              </div>
              <div className="h-3 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.round(parseFloat(market.outcomePrices[0]) * 100)}%`,
                    background: 'linear-gradient(90deg, #00D26A, #00A854)',
                  }}
                />
              </div>
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'YES Shares', value: market.totalYesShares },
                { label: 'NO Shares', value: market.totalNoShares },
                { label: 'Volume (USDC)', value: `$${parseInt(market.volume || '0').toLocaleString()}` },
              ].map(s => (
                <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                  <p className="text-[10px] text-[#7A7068] uppercase tracking-wider mb-1">{s.label}</p>
                  <p className="text-[15px] font-bold text-white font-mono">{s.value}</p>
                </div>
              ))}
            </div>

            {/* Bet Buttons (client) */}
            <BetSection market={market} />

            {/* Market info */}
            <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-6">
              {market.endDate && (
                <div className="flex items-center gap-2 text-[12px] text-[#7A7068]">
                  <Clock size={13} />
                  Closes {new Date(market.endDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </div>
              )}
              <div className="flex items-center gap-2 text-[12px] text-[#7A7068]">
                <Shield size={13} />
                Resolved by SabiMarkets OracleResolver
              </div>
              <a
                href={explorerLink(market.id)}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 text-[12px] text-[#7A7068] hover:text-[#00D26A] transition-colors"
              >
                <ExternalLink size={13} />
                View contract on Stellar Expert
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
