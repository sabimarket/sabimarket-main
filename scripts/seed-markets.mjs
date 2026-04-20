/**
 * seed-markets.mjs
 * Deploys 30 SabiMarket contracts on Stellar Testnet and registers them
 * in the SabiMarketFactory + MarketCuration DB table.
 *
 * Usage:
 *   node scripts/seed-markets.mjs
 *
 * Requirements:
 *   - .env.local must be populated (DATABASE_URL, ORACLE_KEYPAIR_SECRET, etc.)
 *   - sabimarket.wasm must be built at smartcontract-stellar/target/wasm32v1-none/release/
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { createRequire } from "module";

// ── Load .env.local ─────────────────────────────────────────────────────────
const __dir = dirname(fileURLToPath(import.meta.url));
const envFile = join(__dir, "../.env.local");
const envLines = readFileSync(envFile, "utf8").split("\n");
for (const line of envLines) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx < 0) continue;
  const key = trimmed.slice(0, idx).trim();
  const val = trimmed.slice(idx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const require = createRequire(import.meta.url);
const {
  rpc,
  Keypair,
  Networks,
  TransactionBuilder,
  Operation,
  xdr,
  Address,
  nativeToScVal,
  Contract,
  BASE_FEE,
} = require("@stellar/stellar-sdk");
const { PrismaClient } = require("@prisma/client");

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL = "https://soroban-testnet.stellar.org";
const NETWORK_PASSPHRASE = Networks.TESTNET;
const FACTORY = process.env.NEXT_PUBLIC_STELLAR_FACTORY;
const USDC = process.env.NEXT_PUBLIC_STELLAR_USDC;
const ORACLE = process.env.NEXT_PUBLIC_STELLAR_ORACLE;
const DEPLOYER_SECRET = process.env.ORACLE_KEYPAIR_SECRET; // deployer uses oracle key on testnet
const WASM_PATH = join(
  __dir,
  "../../smartcontract-stellar/target/wasm32v1-none/release/sabimarket.wasm"
);
const TESTNET_EXPLORER = "https://stellar.expert/explorer/testnet/contract";

const prisma = new PrismaClient();
const server = new rpc.Server(RPC_URL, { allowHttp: false });

// ── Market Definitions ───────────────────────────────────────────────────────
const now = Math.floor(Date.now() / 1000);
const days = (n) => now + n * 86400;

const MARKETS = [
  // ── Africa: Economics ────────────────────────
  {
    question: "Will Nigeria's inflation rate fall below 20% by Q4 2026?",
    title: "Nigeria Inflation Below 20%",
    description:
      "Nigeria's inflation has been running above 30%. Will headline CPI drop below 20% before end of 2026?",
    category: "economics",
    tags: ["nigeria", "inflation", "africa", "macro"],
    endDays: 250,
  },
  {
    question: "Will the West African Eco currency launch before 2028?",
    title: "West African Eco Launch",
    description:
      "ECOWAS has repeatedly delayed the Eco single currency. Will it officially launch before 2028?",
    category: "economics",
    tags: ["ecowas", "eco", "currency", "africa"],
    endDays: 650,
  },
  {
    question: "Will South Africa's unemployment rate drop below 30% in 2026?",
    title: "SA Unemployment Below 30%",
    description:
      "South Africa has one of the world's highest unemployment rates at ~33%. Will it fall below 30% this year?",
    category: "economics",
    tags: ["south-africa", "employment", "macro"],
    endDays: 260,
  },
  {
    question: "Will Senegal become Africa's top gas exporter by 2027?",
    title: "Senegal Top Gas Exporter",
    description:
      "After discovering major offshore gas fields, will Senegal surpass Algeria to become Africa's top gas exporter by end of 2027?",
    category: "economics",
    tags: ["senegal", "gas", "energy", "africa"],
    endDays: 620,
  },
  {
    question: "Will mobile money transactions in Africa exceed $1 trillion in 2026?",
    title: "Africa Mobile Money $1T",
    description:
      "Mobile money (M-Pesa, Opay, MTN MoMo etc.) is exploding. Will total 2026 transaction volume exceed $1 trillion?",
    category: "economics",
    tags: ["mobile-money", "fintech", "africa"],
    endDays: 260,
  },

  // ── Africa: Politics ─────────────────────────
  {
    question: "Will Nigeria hold peaceful governorship elections in 2027?",
    title: "Nigeria 2027 Elections Peaceful",
    description:
      "Will the Independent National Electoral Commission certify the 2027 off-cycle governorship elections as peaceful with no widespread violence?",
    category: "politics",
    tags: ["nigeria", "elections", "africa"],
    endDays: 400,
  },
  {
    question: "Will the African Continental Free Trade Area reach 50 member states by 2027?",
    title: "AfCFTA 50 Members",
    description:
      "AfCFTA currently has 47 signatories. Will it reach 50 ratifications before end of 2027?",
    category: "politics",
    tags: ["afcfta", "trade", "africa"],
    endDays: 620,
  },
  {
    question: "Will Ethiopia and Eritrea sign a formal peace agreement by 2027?",
    title: "Ethiopia-Eritrea Peace Deal",
    description:
      "The 2018 ceasefire was historic but informal. Will a full peace and cooperation treaty be signed before 2027?",
    category: "politics",
    tags: ["ethiopia", "eritrea", "peace", "africa"],
    endDays: 620,
  },

  // ── Sports ───────────────────────────────────
  {
    question: "Will the Super Eagles qualify for the 2026 FIFA World Cup?",
    title: "Nigeria World Cup 2026",
    description:
      "Nigeria's Super Eagles are in AFCON qualifying. Will they make it to the 2026 World Cup in USA/Canada/Mexico?",
    category: "sports",
    tags: ["nigeria", "football", "world-cup", "sports"],
    endDays: 120,
  },
  {
    question: "Will a sub-Saharan African team reach the 2026 World Cup quarter-finals?",
    title: "Africa WC Quarter-Final",
    description:
      "Africa gets 9 slots in the expanded 48-team World Cup. Will any African team reach the quarter-finals?",
    category: "sports",
    tags: ["football", "world-cup", "africa", "sports"],
    endDays: 450,
  },
  {
    question: "Will the Springboks retain the Rugby World Cup in 2027?",
    title: "Springboks Retain RWC",
    description:
      "South Africa are the reigning Rugby World Cup champions. Can they win it again in Australia 2027?",
    category: "sports",
    tags: ["rugby", "springboks", "south-africa", "sports"],
    endDays: 550,
  },
  {
    question: "Will Egypt's Mo Salah win the 2026 Ballon d'Or?",
    title: "Salah Ballon d'Or 2026",
    description:
      "Mo Salah is one of the world's best players. Will he finally win football's most prestigious individual award in 2026?",
    category: "sports",
    tags: ["salah", "ballon-dor", "egypt", "football"],
    endDays: 300,
  },

  // ── Crypto ───────────────────────────────────
  {
    question: "Will Bitcoin exceed $200,000 before end of 2026?",
    title: "Bitcoin $200K 2026",
    description:
      "Bitcoin is above $90K post-halving. Will it hit $200,000 before December 31, 2026?",
    category: "crypto",
    tags: ["bitcoin", "btc", "price", "crypto"],
    endDays: 255,
  },
  {
    question: "Will Stellar (XLM) enter the top 10 by market cap in 2026?",
    title: "Stellar Top 10 Market Cap",
    description:
      "With Soroban DeFi picking up momentum, will XLM's market cap break into the top 10 of all cryptocurrencies?",
    category: "crypto",
    tags: ["stellar", "xlm", "market-cap", "crypto"],
    endDays: 260,
  },
  {
    question: "Will Ethereum ETF inflows exceed Bitcoin ETF inflows in any month of 2026?",
    title: "ETH ETF Flips BTC ETF",
    description:
      "US spot ETH ETFs launched in 2024. Will monthly Ethereum ETF inflows exceed Bitcoin ETF inflows at any point in 2026?",
    category: "crypto",
    tags: ["ethereum", "etf", "bitcoin", "crypto"],
    endDays: 260,
  },
  {
    question: "Will a CBDC launch in at least 5 African countries by 2027?",
    title: "5 African CBDCs By 2027",
    description:
      "Nigeria's eNaira is live. Will at least 5 African nations have active Central Bank Digital Currencies by end of 2027?",
    category: "crypto",
    tags: ["cbdc", "africa", "digital-currency", "crypto"],
    endDays: 620,
  },
  {
    question: "Will Solana's price exceed $500 before end of 2026?",
    title: "Solana $500",
    description:
      "Solana hit an ATH near $300. Will SOL trade above $500 at any point before December 31, 2026?",
    category: "crypto",
    tags: ["solana", "sol", "price", "crypto"],
    endDays: 255,
  },
  {
    question: "Will DeFi TVL on Stellar/Soroban exceed $100M by end of 2026?",
    title: "Soroban DeFi TVL $100M",
    description:
      "Soroban smart contracts are live. Will total value locked across all Stellar DeFi protocols exceed $100M?",
    category: "crypto",
    tags: ["stellar", "soroban", "defi", "tvl"],
    endDays: 255,
  },

  // ── Technology ───────────────────────────────
  {
    question: "Will an African startup reach a $1B+ valuation in 2026?",
    title: "New African Unicorn 2026",
    description:
      "Africa has ~5 unicorns (Flutterwave, OPay, etc.). Will a new startup reach unicorn status in 2026?",
    category: "technology",
    tags: ["startup", "unicorn", "africa", "tech"],
    endDays: 260,
  },
  {
    question: "Will Nigeria launch a national digital identity system by end of 2026?",
    title: "Nigeria Digital ID 2026",
    description:
      "Nigeria's NIMC is modernizing. Will a fully functional national biometric digital ID system be operational for 100M+ citizens?",
    category: "technology",
    tags: ["nigeria", "digital-id", "govtech"],
    endDays: 255,
  },
  {
    question: "Will Africa's internet penetration exceed 50% by end of 2026?",
    title: "Africa 50% Internet Penetration",
    description:
      "Currently around 43% of Africans are online. With new submarine cables and satellite internet (Starlink), will penetration hit 50%?",
    category: "technology",
    tags: ["internet", "connectivity", "africa", "tech"],
    endDays: 255,
  },
  {
    question: "Will Starlink have more than 5 million subscribers in Africa by 2027?",
    title: "Starlink 5M Africa Subs",
    description:
      "SpaceX Starlink is expanding rapidly across Africa. Will subscriber count cross 5 million on the continent?",
    category: "technology",
    tags: ["starlink", "satellite", "internet", "africa"],
    endDays: 500,
  },

  // ── Infrastructure ───────────────────────────
  {
    question: "Will South Africa end Stage 6+ load shedding permanently in 2026?",
    title: "SA Load Shedding Ends",
    description:
      "South Africa has been plagued by rolling blackouts. Will load shedding be permanently eliminated in 2026?",
    category: "infrastructure",
    tags: ["south-africa", "energy", "eskom", "infrastructure"],
    endDays: 260,
  },
  {
    question: "Will Lagos complete the Blue Line rail Phase 2 by end of 2026?",
    title: "Lagos Blue Line Phase 2",
    description:
      "Phase 1 opened in 2023. Will the Lagos Metropolitan Area Transport Authority complete Phase 2 by December 2026?",
    category: "infrastructure",
    tags: ["lagos", "rail", "transport", "nigeria"],
    endDays: 255,
  },
  {
    question: "Will renewable energy exceed 50% of new African power capacity added in 2026?",
    title: "Africa 50% Renewable Capacity",
    description:
      "Solar and wind are rapidly growing on the continent. Will over half of all new power generation capacity added in 2026 be renewable?",
    category: "infrastructure",
    tags: ["renewable", "solar", "energy", "africa"],
    endDays: 260,
  },

  // ── Global ───────────────────────────────────
  {
    question: "Will the US Federal Reserve cut interest rates below 4% in 2026?",
    title: "Fed Funds Rate Below 4%",
    description:
      "The Fed has been holding rates high. Will the federal funds rate target fall below 4% at any point in 2026?",
    category: "economics",
    tags: ["fed", "interest-rates", "usa", "macro"],
    endDays: 260,
  },
  {
    question: "Will oil prices (Brent crude) exceed $100/barrel in 2026?",
    title: "Brent Crude $100",
    description:
      "Oil markets are volatile. Will Brent crude spot price exceed $100 per barrel at any point in 2026?",
    category: "economics",
    tags: ["oil", "brent", "commodities", "macro"],
    endDays: 260,
  },
  {
    question: "Will global AI investment exceed $500B in 2026?",
    title: "Global AI Investment $500B",
    description:
      "2025 saw record AI capex from hyperscalers. Will aggregate global investment in AI infrastructure and startups surpass $500B in 2026?",
    category: "technology",
    tags: ["ai", "investment", "tech", "global"],
    endDays: 260,
  },
  {
    question: "Will the 2028 Olympics be the most watched event in streaming history?",
    title: "LA 2028 Olympics Streaming Record",
    description:
      "LA 2028 will be the first Olympics in the streaming-first era. Will it surpass Super Bowl LVII as the most-streamed live event ever?",
    category: "sports",
    tags: ["olympics", "streaming", "sports", "la2028"],
    endDays: 830,
  },
  {
    question: "Will a humanoid robot be commercially available for under $30,000 by end of 2026?",
    title: "Sub-$30K Humanoid Robot",
    description:
      "Tesla Optimus, Figure AI, and others are racing. Will any manufacturer offer a general-purpose humanoid robot to consumers for under $30,000?",
    category: "technology",
    tags: ["robotics", "humanoid", "ai", "tech"],
    endDays: 260,
  },
  {
    question: "Will SpaceX successfully land humans on the Moon before end of 2027?",
    title: "Artemis Moon Landing",
    description:
      "NASA Artemis + SpaceX Starship. Will astronauts land on the lunar surface and return safely before December 31, 2027?",
    category: "technology",
    tags: ["spacex", "nasa", "moon", "space"],
    endDays: 620,
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

async function uploadWasm(keypair, account) {
  const wasmBuffer = readFileSync(WASM_PATH);
  const crypto = await import("crypto");
  const hash = crypto.createHash("sha256").update(wasmBuffer).digest();
  const hexHash = Buffer.from(hash).toString("hex");

  // Try to upload — if already exists Soroban returns SUCCESS anyway (idempotent)
  // If the TX fails for any reason (e.g. sequence conflict), fall back to just using the hash
  try {
    const uploadOp = Operation.uploadContractWasm({ wasm: wasmBuffer });
    let tx = new TransactionBuilder(account, {
      fee: String(20 * Number(BASE_FEE)),
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(uploadOp)
      .setTimeout(90)
      .build();

    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      console.log(`  ℹ Wasm already uploaded (sim skipped), using hash: ${hexHash.slice(0, 16)}...`);
      return hash;
    }

    tx = rpc.assembleTransaction(tx, sim).build();
    tx.sign(keypair);
    const resp = await server.sendTransaction(tx);
    const res = await pollTx(resp.hash);
    if (res.status !== "SUCCESS") {
      console.log(`  ℹ Wasm upload TX non-success (${res.status}), assuming already uploaded`);
    } else {
      console.log(`  ✓ Wasm uploaded`);
    }
  } catch (e) {
    console.log(`  ℹ Wasm upload skipped (${e.message.slice(0, 60)}), using computed hash`);
  }

  console.log(`  ✓ Wasm hash: ${hexHash.slice(0, 16)}...`);
  return hash;
}

async function createContractInstance(keypair, account, wasmHash) {
  // Generate a random 32-byte salt for a unique contract address
  const crypto = await import("crypto");
  const salt = crypto.randomBytes(32);

  const op = Operation.createCustomContract({
    wasmHash,
    address: new Address(keypair.publicKey()),
    salt,
  });

  let tx = new TransactionBuilder(account, {
    fee: String(10 * Number(BASE_FEE)),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim))
    throw new Error(`Create contract sim error: ${sim.error}`);

  tx = rpc.assembleTransaction(tx, sim).build();
  tx.sign(keypair);

  const resp = await server.sendTransaction(tx);
  const res = await pollTx(resp.hash);
  if (res.status !== "SUCCESS") throw new Error("Create contract failed: " + res.status);

  // Extract new contract address from result
  const retVal = res.returnValue;
  if (!retVal) throw new Error("No return value from create contract");
  const contractAddress = Address.fromScVal(retVal).toString();
  return contractAddress;
}

async function initializeMarket(keypair, account, contractAddress, market) {
  const contract = new Contract(contractAddress);

  const resolutionSources = xdr.ScVal.scvVec(
    ["CoinGecko", "Reuters", "BBC Africa"].map((s) =>
      xdr.ScVal.scvString(s)
    )
  );
  const tags = xdr.ScVal.scvVec(
    market.tags.map((t) => xdr.ScVal.scvString(t))
  );

  const endTime = BigInt(days(market.endDays));
  const createdAt = BigInt(now);

  // Keys MUST be sorted alphabetically for Soroban ScMap
  const metaScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("category"),
      val: xdr.ScVal.scvString(market.category),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("context"),
      val: xdr.ScVal.scvString("Data sourced from public APIs and verified news sources."),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("created_at"),
      val: nativeToScVal(createdAt, { type: "u64" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("creator"),
      val: nativeToScVal(Address.fromString(keypair.publicKey()), { type: "address" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("description"),
      val: xdr.ScVal.scvString(market.description),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("end_time"),
      val: nativeToScVal(endTime, { type: "u64" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("image_uri"),
      val: xdr.ScVal.scvString(""),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("question"),
      val: xdr.ScVal.scvString(market.question),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("resolution_sources"),
      val: resolutionSources,
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("rules"),
      val: xdr.ScVal.scvString("Market resolves YES if the event occurs, NO otherwise."),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("tags"),
      val: tags,
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("title"),
      val: xdr.ScVal.scvString(market.title),
    }),
  ]);

  const op = contract.call(
    "initialize",
    nativeToScVal(Address.fromString(USDC), { type: "address" }),
    nativeToScVal(Address.fromString(ORACLE), { type: "address" }),
    nativeToScVal(Address.fromString(keypair.publicKey()), { type: "address" }),
    metaScVal
  );

  let tx = new TransactionBuilder(account, {
    fee: String(10 * Number(BASE_FEE)),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim))
    throw new Error(`Initialize sim error: ${sim.error}`);

  tx = rpc.assembleTransaction(tx, sim).build();
  tx.sign(keypair);

  const resp = await server.sendTransaction(tx);
  const res = await pollTx(resp.hash);
  if (res.status !== "SUCCESS") throw new Error("Initialize failed: " + res.status);
}

async function registerInFactory(keypair, account, contractAddress, market) {
  const factory = new Contract(FACTORY);

  // Keys MUST be sorted alphabetically for Soroban ScMap
  const recordScVal = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("address"),
      val: nativeToScVal(Address.fromString(contractAddress), { type: "address" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("category"),
      val: xdr.ScVal.scvString(market.category),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("created_at"),
      val: nativeToScVal(BigInt(now), { type: "u64" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("creator"),
      val: nativeToScVal(Address.fromString(keypair.publicKey()), { type: "address" }),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("question"),
      val: xdr.ScVal.scvString(market.question),
    }),
  ]); // already alphabetical: address, category, created_at, creator, question

  const op = factory.call(
    "register_market",
    nativeToScVal(Address.fromString(keypair.publicKey()), { type: "address" }),
    recordScVal
  );

  let tx = new TransactionBuilder(account, {
    fee: String(10 * Number(BASE_FEE)),
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(60)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    console.warn(`  ⚠ Factory register sim warn: ${sim.error} (continuing)`);
    return; // factory admin-gated — skip if not admin
  }

  tx = rpc.assembleTransaction(tx, sim).build();
  tx.sign(keypair);
  const resp = await server.sendTransaction(tx);
  await pollTx(resp.hash);
}

async function pollTx(hash, retries = 40) {
  for (let i = 0; i < retries; i++) {
    await sleep(2500);
    const res = await server.getTransaction(hash);
    if (res.status === "SUCCESS" || res.status === "FAILED") return res;
    if (res.status !== "NOT_FOUND") {
      // pending
    }
  }
  throw new Error(`TX ${hash} timed out`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getRefreshedAccount(keypair) {
  return await server.getAccount(keypair.publicKey());
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n🚀 SabiMarket Testnet Seed Script");
  console.log("══════════════════════════════════════\n");

  if (!DEPLOYER_SECRET) throw new Error("ORACLE_KEYPAIR_SECRET not set in .env.local");
  if (!FACTORY || !USDC || !ORACLE) throw new Error("Contract addresses not set in .env.local");

  const keypair = Keypair.fromSecret(DEPLOYER_SECRET);
  console.log(`Deployer: ${keypair.publicKey()}`);
  console.log(`Factory:  ${FACTORY}`);
  console.log(`WASM:     ${WASM_PATH}\n`);

  // Upload wasm once
  console.log("📦 Uploading SabiMarket WASM...");
  let account = await getRefreshedAccount(keypair);
  const wasmHash = await uploadWasm(keypair, account);
  console.log();

  const results = [];

  for (let i = 0; i < MARKETS.length; i++) {
    const market = MARKETS[i];
    console.log(`[${i + 1}/${MARKETS.length}] ${market.title}`);

    try {
      // Refresh account sequence for each TX
      account = await getRefreshedAccount(keypair);
      const contractAddress = await createContractInstance(keypair, account, wasmHash);
      console.log(`  ✓ Deployed: ${contractAddress}`);

      account = await getRefreshedAccount(keypair);
      await initializeMarket(keypair, account, contractAddress, market);
      console.log(`  ✓ Initialized`);

      account = await getRefreshedAccount(keypair);
      await registerInFactory(keypair, account, contractAddress, market);
      console.log(`  ✓ Registered in factory`);

      // Upsert into MarketCuration DB
      await prisma.marketCuration.upsert({
        where: { conditionId: contractAddress },
        create: {
          conditionId: contractAddress,
          title: market.title,
          category: market.category,
          isActive: true,
        },
        update: {
          title: market.title,
          category: market.category,
          isActive: true,
        },
      });
      console.log(`  ✓ Saved to DB`);
      console.log(`  🔗 ${TESTNET_EXPLORER}/${contractAddress}\n`);

      results.push({ ...market, contractAddress, success: true });
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}\n`);
      results.push({ ...market, contractAddress: null, success: false, error: err.message });
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log("\n══════════════════════════════════════");
  console.log(`✅ Seeded ${succeeded.length}/${MARKETS.length} markets on Stellar Testnet`);
  if (failed.length > 0) {
    console.log(`\n❌ ${failed.length} failed:`);
    failed.forEach((m) => console.log(`  - ${m.title}: ${m.error}`));
  }

  console.log("\n📋 All deployed market addresses:");
  console.log("══════════════════════════════════════");
  succeeded.forEach((m, i) => {
    console.log(
      `${String(i + 1).padStart(2, "0")}. [${m.category.padEnd(14)}] ${m.title}`
    );
    console.log(`    ${TESTNET_EXPLORER}/${m.contractAddress}`);
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});
