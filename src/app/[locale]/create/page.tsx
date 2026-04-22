"use client";

import { useState, useRef } from 'react';
import { useRouter } from '@/i18n/routing';
import { Link } from '@/i18n/routing';
import {
  ArrowLeft, ArrowRight, CheckCircle, Loader2, Lightbulb,
  Calendar, Tag, Shield, Sparkles, Globe, Upload, X as XIcon
} from 'lucide-react';
import { useWallet } from '@/components/Providers';
import { signTransactionXDR } from '@/lib/stellar/wallet';
import { STELLAR_CONTRACTS, STELLAR_NETWORK_PASSPHRASE } from '@/lib/stellar/contracts';

// ─── Types ─────────────────────────────────────────────────────────────────

interface MarketForm {
  question: string;
  title: string;
  description: string;
  category: string;
  tags: string;
  imageUri: string;
  rules: string;
  context: string;
  resolutionSources: string;
  endDate: string;
  resolver: string;
}

const INITIAL: MarketForm = {
  question: '',
  title: '',
  description: '',
  category: '',
  tags: '',
  imageUri: '',
  rules: '',
  context: '',
  resolutionSources: '',
  endDate: '',
  resolver: STELLAR_CONTRACTS.ORACLE,
};

const CATEGORIES = ['Politics', 'Economy', 'Sports', 'Crypto', 'Entertainment', 'Global'];

// ─── Step Indicator ────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Question', icon: Lightbulb },
  { label: 'Details', icon: Tag },
  { label: 'Rules', icon: Shield },
  { label: 'Resolver', icon: Globe },
  { label: 'Preview', icon: CheckCircle },
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div key={i} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
              active ? 'bg-[#00D26A]/15 border border-[#00D26A]/30 text-[#00D26A]' :
              done ? 'bg-white/[0.06] text-white' : 'text-[#7A7068]'
            }`}>
              {done ? <CheckCircle size={13} /> : <s.icon size={13} />}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
            {i < total - 1 && (
              <div className={`h-[1px] w-4 sm:w-8 mx-1 transition-all ${done ? 'bg-white/30' : 'bg-white/[0.08]'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Field helpers ─────────────────────────────────────────────────────────

function Field({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-[12px] font-semibold text-[#C4BFB8] uppercase tracking-widest">{label}</label>
        {hint && <span className="text-[11px] text-[#7A7068]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const inputClass = 'w-full bg-white/[0.04] border border-white/[0.09] text-white text-[14px] rounded-xl px-4 py-3 focus:outline-none focus:ring-1 focus:ring-[#00D26A]/40 focus:border-[#00D26A]/30 transition-all placeholder:text-[#5A5550]';
const textareaClass = `${inputClass} resize-none`;

// ─── Cloudinary unsigned upload ───────────────────────────────────────────

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? 'dpy5zhquf';
const UPLOAD_PRESET = 'sabimarket_markets'; // create unsigned preset in Cloudinary dashboard

async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('upload_preset', UPLOAD_PRESET);
  fd.append('folder', 'sabimarkets/markets');
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: fd,
  });
  if (!res.ok) throw new Error('Image upload failed');
  const data = await res.json();
  return data.secure_url as string;
}

// ─── AI title suggestion (calls OpenAI via API route) ─────────────────────

async function suggestTitle(question: string): Promise<string | null> {
  try {
    const res = await fetch('/api/ai/suggest-title', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.title ?? null;
  } catch {
    return null;
  }
}

// ─── Market creation transaction ──────────────────────────────────────────

async function createMarketOnChain(address: string, form: MarketForm): Promise<string> {
  const {
    rpc, Contract, TransactionBuilder, BASE_FEE,
    Networks, nativeToScVal, Address,
  } = await import('@stellar/stellar-sdk');

  const rpcUrl = process.env.NEXT_PUBLIC_STELLAR_RPC ?? 'https://soroban-testnet.stellar.org';
  const server = new rpc.Server(rpcUrl, { allowHttp: false });
  const account = await server.getAccount(address);

  const endTimestamp = Math.floor(new Date(form.endDate).getTime() / 1000);
  const marketId = `market_${Date.now()}_${address.slice(0, 8)}`;

  const params = nativeToScVal({
    question: form.question,
    title: form.title,
    description: form.description,
    rules: form.rules,
    context: form.context,
    category: form.category,
    resolution_sources: form.resolutionSources,
    image_uri: form.imageUri,
    tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    creator: address,
    end_time: BigInt(endTimestamp),
  });

  const contract = new Contract(STELLAR_CONTRACTS.FACTORY);
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: STELLAR_NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(
      'register_market',
      Address.fromString(address).toScVal(), // caller — must be ScvAddress not ScvString
      nativeToScVal(marketId),               // market_id (string)
      params,                                // MarketParams
    ))
    .setTimeout(30)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error);

  const prepared = rpc.assembleTransaction(tx, sim).build();
  const signed = await signTransactionXDR(prepared.toXDR(), STELLAR_NETWORK_PASSPHRASE);

  const result = await server.sendTransaction(
    TransactionBuilder.fromXDR(signed, Networks.TESTNET)
  );
  if (result.status === 'ERROR') throw new Error(result.errorResult?.toString() ?? 'Transaction failed');
  return result.hash;
}

// ─── Main Page Component ───────────────────────────────────────────────────

export default function CreateMarketPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<MarketForm>(INITIAL);
  const [suggestingTitle, setSuggestingTitle] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { address, isConnected, connect } = useWallet();
  const router = useRouter();

  const set = (key: keyof MarketForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleSuggestTitle = async () => {
    if (!form.question.trim()) return;
    setSuggestingTitle(true);
    const title = await suggestTitle(form.question);
    if (title) setForm(prev => ({ ...prev, title }));
    setSuggestingTitle(false);
  };

  const canAdvance = () => {
    if (step === 0) return form.question.trim().length > 10 && form.title.trim().length > 3;
    if (step === 1) return form.category !== '' && form.endDate !== '';
    if (step === 2) return form.rules.trim().length > 10;
    if (step === 3) return form.resolver.trim().length > 5;
    return true;
  };

  const handleSubmit = async () => {
    if (!isConnected || !address) { await connect(); return; }
    setSubmitting(true);
    setError('');
    try {
      const hash = await createMarketOnChain(address, form);
      setTxHash(hash);
      setStep(5); // success screen
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setError(msg.length > 200 ? msg.slice(0, 200) + '…' : msg);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──
  if (step === 5) {
    return (
      <div className="min-h-screen bg-[#080706] text-[#F0EBE1] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-lg text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#00D26A]/15 border border-[#00D26A]/30 flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={36} className="text-[#00D26A]" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Market Created!</h1>
          <p className="text-[#7A7068] mb-8">Your prediction market has been registered on Stellar.</p>
          {txHash && (
            <a
              href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-[#00D26A] text-sm hover:underline mb-8"
            >
              View transaction on Stellar Expert ↗
            </a>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => { setForm(INITIAL); setStep(0); setTxHash(''); }}
              className="cursor-pointer px-6 py-3 rounded-xl border border-white/[0.09] text-[#F0EBE1] font-semibold text-sm hover:bg-white/[0.05] transition-all"
            >
              Create Another
            </button>
            <Link
              href="/"
              className="px-6 py-3 rounded-xl bg-[#00D26A] text-black font-bold text-sm hover:bg-[#00B85E] transition-all"
            >
              Browse Markets →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080706] text-[#F0EBE1]">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-[0.03]"
             style={{ background: 'radial-gradient(circle, #00D26A 0%, transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px)`,
          backgroundSize: '60px 60px'
        }} />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16">

        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-2 text-[#7A7068] hover:text-white text-[13px] transition-colors mb-8">
          <ArrowLeft size={14} /> Back to Markets
        </Link>

        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-1">Create a Market</h1>
          <p className="text-[#7A7068] text-sm">Turn your prediction into a live on-chain market on Stellar.</p>
        </div>

        <StepIndicator current={step} total={STEPS.length} />

        {/* ── Step 0: Question + Title ── */}
        {step === 0 && (
          <div className="flex flex-col gap-6">
            <Field label="Market Question" hint="Must be a yes/no question">
              <textarea
                rows={3}
                value={form.question}
                onChange={set('question')}
                placeholder="Will Nigeria win the 2026 AFCON? Will BTC reach $200k before 2026?"
                className={textareaClass}
              />
            </Field>

            <Field label="Short Title" hint="3–8 word display title">
              <div className="flex gap-2">
                <input
                  value={form.title}
                  onChange={set('title')}
                  placeholder="e.g. Nigeria AFCON 2026 Win"
                  className={`${inputClass} flex-1`}
                />
                <button
                  onClick={handleSuggestTitle}
                  disabled={suggestingTitle || !form.question.trim()}
                  className="cursor-pointer shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white/[0.05] border border-white/[0.09] rounded-xl text-[12px] font-medium text-[#7A7068] hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
                >
                  {suggestingTitle ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {suggestingTitle ? 'Thinking…' : 'AI Title'}
                </button>
              </div>
            </Field>

            <Field label="Description" hint="Optional">
              <textarea
                rows={3}
                value={form.description}
                onChange={set('description')}
                placeholder="Context, background, or additional details about this market…"
                className={textareaClass}
              />
            </Field>
          </div>
        )}

        {/* ── Step 1: Category + Tags + Image + End Date ── */}
        {step === 1 && (
          <div className="flex flex-col gap-6">
            <Field label="Category">
              <div className="grid grid-cols-3 gap-2">
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setForm(prev => ({ ...prev, category: cat }))}
                    className={`cursor-pointer py-2.5 rounded-xl text-[13px] font-semibold border transition-all ${
                      form.category === cat
                        ? 'bg-[#00D26A]/15 border-[#00D26A]/40 text-[#00D26A]'
                        : 'border-white/[0.07] text-[#7A7068] hover:text-white hover:border-white/20'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Tags" hint="Comma-separated">
              <input
                value={form.tags}
                onChange={set('tags')}
                placeholder="nigeria, football, afcon"
                className={inputClass}
              />
            </Field>

            <Field label="Market Image" hint="Optional — upload or paste URL">
              {form.imageUri ? (
                <div className="relative w-full h-32 rounded-xl overflow-hidden border border-white/[0.09]">
                  <img src={form.imageUri} alt="Market" className="w-full h-full object-cover" />
                  <button
                    onClick={() => setForm(prev => ({ ...prev, imageUri: '' }))}
                    className="cursor-pointer absolute top-2 right-2 p-1 bg-black/60 rounded-full text-white hover:bg-black/80"
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={form.imageUri}
                    onChange={set('imageUri')}
                    placeholder="https://… or ipfs://…"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingImage}
                    className="cursor-pointer shrink-0 flex items-center gap-1.5 px-3 py-2 bg-white/[0.05] border border-white/[0.09] rounded-xl text-[12px] font-medium text-[#7A7068] hover:text-white hover:border-white/20 transition-all disabled:opacity-50"
                  >
                    {uploadingImage ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploadingImage ? 'Uploading…' : 'Upload'}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploadingImage(true);
                      try {
                        const url = await uploadToCloudinary(file);
                        setForm(prev => ({ ...prev, imageUri: url }));
                      } catch {
                        setError('Image upload failed. Please try a URL instead.');
                      } finally {
                        setUploadingImage(false);
                      }
                    }}
                  />
                </div>
              )}
            </Field>

            <Field label="Resolution Date">
              <input
                type="datetime-local"
                value={form.endDate}
                onChange={set('endDate')}
                min={new Date(Date.now() + 3600_000).toISOString().slice(0, 16)}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {/* ── Step 2: Rules + Context + Resolution Sources ── */}
        {step === 2 && (
          <div className="flex flex-col gap-6">
            <Field label="Resolution Rules" hint="How will this market be resolved?">
              <textarea
                rows={4}
                value={form.rules}
                onChange={set('rules')}
                placeholder="This market resolves YES if… resolves NO if… resolves N/A if…"
                className={textareaClass}
              />
            </Field>

            <Field label="Context" hint="Optional background information">
              <textarea
                rows={3}
                value={form.context}
                onChange={set('context')}
                placeholder="Relevant statistics, history, or context that help bettors make informed decisions…"
                className={textareaClass}
              />
            </Field>

            <Field label="Resolution Sources" hint="Add URLs where the oracle will verify the outcome">
              {form.resolutionSources.split('\n').filter(Boolean).map((src, i) => (
                <div key={i} className="flex items-center gap-2 mb-1.5">
                  <input
                    value={src}
                    onChange={e => {
                      const lines = form.resolutionSources.split('\n');
                      lines[i] = e.target.value;
                      setForm(prev => ({ ...prev, resolutionSources: lines.join('\n') }));
                    }}
                    placeholder="https://…"
                    className={`${inputClass} flex-1`}
                  />
                  <button
                    onClick={() => {
                      const lines = form.resolutionSources.split('\n').filter(Boolean);
                      lines.splice(i, 1);
                      setForm(prev => ({ ...prev, resolutionSources: lines.join('\n') }));
                    }}
                    className="cursor-pointer shrink-0 p-2 rounded-lg text-[#FF4560] hover:bg-[#FF4560]/10 transition-colors"
                  >
                    <XIcon size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setForm(prev => ({ ...prev, resolutionSources: (prev.resolutionSources ? prev.resolutionSources + '\n' : '') + '' }))}
                className="cursor-pointer flex items-center gap-1.5 text-[12px] text-[#00D26A] hover:underline mt-1"
              >
                + Add Source URL
              </button>
              {form.resolutionSources.split('\n').filter(Boolean).length === 0 && (
                <button
                  onClick={() => setForm(prev => ({ ...prev, resolutionSources: '' }))}
                  className="cursor-pointer flex items-center gap-1.5 text-[12px] text-[#7A7068] hover:text-white mt-1"
                >
                  + Add first source URL
                </button>
              )}
            </Field>
          </div>
        )}

        {/* ── Step 3: Resolver ── */}
        {step === 3 && (
          <div className="flex flex-col gap-6">
            <Field label="Resolver Address">
              <input
                value={form.resolver}
                onChange={set('resolver')}
                placeholder="G… Stellar account or contract address"
                className={inputClass}
              />
              <p className="text-[11px] text-[#7A7068]">
                Default: SabiMarkets OracleResolver (optimistic + AI resolution). You can specify a custom resolver address.
              </p>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: 'OracleResolver (Default)', addr: STELLAR_CONTRACTS.ORACLE, desc: 'Optimistic + AI + MultiSig' },
                { label: 'Custom Resolver', addr: '', desc: 'Set your own resolver address' },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => opt.addr && setForm(prev => ({ ...prev, resolver: opt.addr }))}
                  className={`cursor-pointer p-4 rounded-2xl border text-left transition-all ${
                    form.resolver === opt.addr && opt.addr
                      ? 'bg-[#00D26A]/10 border-[#00D26A]/30 text-[#00D26A]'
                      : 'border-white/[0.07] hover:border-white/20'
                  }`}
                >
                  <p className="text-[13px] font-bold text-white mb-1">{opt.label}</p>
                  <p className="text-[11px] text-[#7A7068]">{opt.desc}</p>
                  {opt.addr && <p className="text-[10px] font-mono text-[#4A4540] mt-2 truncate">{opt.addr}</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Step 4: Preview ── */}
        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="bg-[#0F0D0B] border border-white/[0.09] rounded-2xl p-6 flex flex-col gap-5">
              <div>
                <p className="text-[10px] text-[#7A7068] uppercase tracking-widest mb-1">Question</p>
                <p className="text-[15px] font-bold text-white">{form.question}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Title', val: form.title },
                  { label: 'Category', val: form.category },
                  { label: 'Tags', val: form.tags || '—' },
                  { label: 'Ends', val: form.endDate ? new Date(form.endDate).toLocaleString() : '—' },
                ].map(r => (
                  <div key={r.label}>
                    <p className="text-[10px] text-[#7A7068] uppercase tracking-widest mb-1">{r.label}</p>
                    <p className="text-[13px] text-white font-medium">{r.val}</p>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[10px] text-[#7A7068] uppercase tracking-widest mb-1">Rules</p>
                <p className="text-[13px] text-[#C4BFB8] leading-relaxed">{form.rules}</p>
              </div>
              <div>
                <p className="text-[10px] text-[#7A7068] uppercase tracking-widest mb-1">Resolver</p>
                <p className="text-[11px] font-mono text-[#7A7068] break-all">{form.resolver}</p>
              </div>
            </div>

            {error && (
              <div className="bg-[#FF4560]/10 border border-[#FF4560]/20 rounded-xl p-4 text-[12px] text-[#FF4560]">
                {error}
              </div>
            )}

            {!isConnected && (
              <p className="text-[12px] text-[#7A7068] text-center">
                Connect your Freighter wallet to submit this market.
              </p>
            )}

            <div className="flex items-start gap-2 bg-[#00D26A]/05 border border-[#00D26A]/15 rounded-xl p-3">
              <Calendar size={14} className="text-[#00D26A] mt-0.5 shrink-0" />
              <p className="text-[11px] text-[#7A7068] leading-relaxed">
                Submitting will call <code className="text-[#00D26A]">register_market</code> on <code className="text-[#00D26A]">SabiMarketFactory</code> via Freighter. Gas is paid in XLM.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10 pt-6 border-t border-white/[0.06]">
          <button
            onClick={() => step > 0 ? setStep(s => s - 1) : router.push('/')}
            className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.09] text-[#7A7068] hover:text-white hover:border-white/20 transition-all font-semibold text-[13px]"
          >
            <ArrowLeft size={14} /> {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step < 4 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canAdvance()}
              className="cursor-pointer flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#00D26A] hover:bg-[#00B85E] text-black font-bold text-[13px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button
              onClick={!isConnected ? connect : handleSubmit}
              disabled={submitting}
              className="cursor-pointer flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#00D26A] hover:bg-[#00B85E] text-black font-bold text-[13px] transition-all disabled:opacity-60"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              {!isConnected ? 'Connect & Create' : submitting ? 'Creating…' : 'Create Market on Stellar'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
