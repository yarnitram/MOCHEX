import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

interface HolderNode {
  id: string;
  label: string;
  holdingPct: number;
  holdingTokens: number;
  holdingUsd: number;
  type: "dev" | "whale" | "sniper" | "cex" | "pool" | "holder";
  clusterId: number;
  whaleStatus: {
    action: "accumulating" | "dumping" | "holding";
    netFlow24h: number;
    lastAction: string;
    totalBuys: number;
    totalSells: number;
    recentTrades: Array<{
      type: "buy" | "sell" | "transfer";
      amount: number;
      usd: number;
      timeAgo: string;
      dex?: string;
    }>;
  };
}

interface TransferLink {
  source: string;
  target: string;
  amount: number;
  pct: number;
  timeAgo: string;
  type: "dev_split" | "transfer" | "sniper_seed";
}

// Preset datasets for hot non-major/meme tokens
const TOKEN_PROFILES: Record<
  string,
  {
    name: string;
    symbol: string;
    chain: string;
    contract: string;
    price: number;
    totalSupply: number;
    marketCap: number;
    riskScore: number;
    clusters: { devSplits: number; insiderClusters: number };
  }
> = {
  POPCAT: {
    name: "Popcat (SOL)",
    symbol: "POPCAT",
    chain: "Solana",
    contract: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    price: 0.68,
    totalSupply: 979990000,
    marketCap: 666000000,
    riskScore: 24, // low-medium risk
    clusters: { devSplits: 2, insiderClusters: 1 },
  },
  GOAT: {
    name: "Goatseus Maximus",
    symbol: "GOAT",
    chain: "Solana",
    contract: "CzLSujWBLFsSjncfkh59rQDqJgCSwUiW3zwx3Zypump",
    price: 0.42,
    totalSupply: 1000000000,
    marketCap: 420000000,
    riskScore: 48,
    clusters: { devSplits: 4, insiderClusters: 2 },
  },
  MOODENG: {
    name: "Moo Deng",
    symbol: "MOODENG",
    chain: "Solana",
    contract: "ED5nyyWEZyPPnoSTLvy37LVmmQQWhZBpwhxPEaYpump",
    price: 0.28,
    totalSupply: 989900000,
    marketCap: 277000000,
    riskScore: 42,
    clusters: { devSplits: 3, insiderClusters: 2 },
  },
  PNUT: {
    name: "Peanut the Squirrel",
    symbol: "PNUT",
    chain: "Solana",
    contract: "2qEHjNzTpVisJa87aa8HyWGbvtspBywnycTmQbYpump",
    price: 0.85,
    totalSupply: 1000000000,
    marketCap: 850000000,
    riskScore: 35,
    clusters: { devSplits: 3, insiderClusters: 1 },
  },
  CHILLGUY: {
    name: "Just a Chill Guy",
    symbol: "CHILLGUY",
    chain: "Solana",
    contract: "Df6yfrKC8kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump",
    price: 0.32,
    totalSupply: 1000000000,
    marketCap: 320000000,
    riskScore: 58,
    clusters: { devSplits: 5, insiderClusters: 3 },
  },
  SPX: {
    name: "SPX6900",
    symbol: "SPX",
    chain: "Ethereum / Base",
    contract: "0xE0f63A424a4439cBE457D80E4f4b51aD25b2c56C",
    price: 0.74,
    totalSupply: 930990000,
    marketCap: 688000000,
    riskScore: 18,
    clusters: { devSplits: 1, insiderClusters: 1 },
  },
  NEIRO: {
    name: "First Neiro on Ethereum",
    symbol: "NEIRO",
    chain: "Ethereum",
    contract: "0x812Ba41e071C7b7fA4EBcFB62dF5F45f6fA853Ee",
    price: 0.00185,
    totalSupply: 420690000000,
    marketCap: 778000000,
    riskScore: 32,
    clusters: { devSplits: 2, insiderClusters: 2 },
  },
};

function generateDeterministicHolders(symbol: string): {
  profile: (typeof TOKEN_PROFILES)[string];
  nodes: HolderNode[];
  links: TransferLink[];
} {
  const upper = symbol.toUpperCase();
  
  // Hash the input to use as a seed
  let seed = 0;
  for (let i = 0; i < upper.length; i++) {
    seed = (seed << 5) - seed + upper.charCodeAt(i);
    seed |= 0;
  }
  seed = Math.abs(seed);

  // Check if it's a contract address
  const isEthContract = upper.startsWith("0X") && upper.length > 40;
  const isSolContract = !upper.startsWith("0X") && upper.length > 30;
  const isContract = isEthContract || isSolContract;

  let displaySymbol = upper;
  let displayContract = `7x${upper.substring(0, 6)}...pump`;
  let displayChain = seed % 2 === 0 ? "Solana" : "Ethereum";

  if (isContract) {
    const prefixes = ["DOGE", "CAT", "PEPE", "WIF", "MEME", "BONK", "INU", "FLOKI", "APE", "PUP", "SHIB"];
    const suffixes = ["AI", "X", "INU", "MAX", "COIN", "PRO", "TRON", "DAO", "LITE"];
    const useSuffix = seed % 3 === 0;
    
    if (useSuffix) {
      displaySymbol = prefixes[seed % prefixes.length] + suffixes[(seed >> 2) % suffixes.length];
    } else {
      displaySymbol = prefixes[seed % prefixes.length];
    }

    displayContract = symbol; // Keep original casing for contract
    displayChain = isEthContract ? "Ethereum" : "Solana";
  } else if (!TOKEN_PROFILES[upper]) {
    displayContract = `7x${upper.padEnd(6, "0")}...pump`;
  }

  const isFallback = !TOKEN_PROFILES[upper] || isContract;

  const baseProfile = TOKEN_PROFILES[upper] && !isContract ? TOKEN_PROFILES[upper] : {
    name: `${displaySymbol} Token`,
    symbol: displaySymbol,
    chain: displayChain,
    contract: displayContract,
    price: 0.01 + (seed % 100) / 50,
    totalSupply: 1000000000,
    marketCap: 50000000 + (seed % 50000000),
    riskScore: 20 + (seed % 70),
    clusters: { devSplits: (seed % 5) + 1, insiderClusters: (seed % 3) + 1 },
  };

  const nodes: HolderNode[] = [];
  const links: TransferLink[] = [];

  const devSplits = baseProfile.clusters.devSplits;
  const whaleCount = isFallback ? 15 + (seed % 25) : 22;
  const poolPct = isFallback ? 5 + (seed % 15) + (seed % 10) / 10 : 12.5;
  const mexcPct = isFallback ? 3 + (seed % 10) + (seed % 10) / 10 : 8.2;
  const devPct = isFallback ? 2 + (seed % 8) + (seed % 10) / 10 : 4.8;
  const hasMexc = isFallback ? seed % 3 !== 0 : true;

  // 1. Liquidity Pool Node
  const poolTokens = Math.round(baseProfile.totalSupply * (poolPct / 100));
  nodes.push({
    id: `pool_${upper.toLowerCase()}`,
    label: `${baseProfile.chain === "Solana" ? "Raydium AMM Pool" : "Uniswap V3 Pool"} 💧`,
    holdingPct: poolPct,
    holdingTokens: poolTokens,
    holdingUsd: Math.round(poolTokens * baseProfile.price),
    type: "pool",
    clusterId: 0,
    whaleStatus: {
      action: "holding",
      netFlow24h: 0,
      lastAction: "Constant automated AMM liquidity rebalancing",
      totalBuys: 2000 + (seed % 1500),
      totalSells: 1800 + (seed % 1500),
      recentTrades: [],
    },
  });

  // 2. CEX Exchange Hot Wallets (MEXC / Binance)
  if (hasMexc) {
    const mexcTokens = Math.round(baseProfile.totalSupply * (mexcPct / 100));
    const isAccumulating = seed % 2 === 0;
    nodes.push({
      id: `cex_mexc_${upper.toLowerCase()}`,
      label: "MEXC Exchange Hot Wallet 🏛️",
      holdingPct: mexcPct,
      holdingTokens: mexcTokens,
      holdingUsd: Math.round(mexcTokens * baseProfile.price),
      type: "cex",
      clusterId: 0,
      whaleStatus: {
        action: isAccumulating ? "accumulating" : "dumping",
        netFlow24h: Math.round(mexcTokens * (isAccumulating ? 0.04 : -0.02)),
        lastAction: isAccumulating ? `CEX User Deposits (+${Math.round(mexcTokens * 0.04).toLocaleString()} in last 4h)` : `CEX User Withdrawals`,
        totalBuys: 1000 + (seed % 800),
        totalSells: 900 + (seed % 800),
        recentTrades: [
          { type: isAccumulating ? "buy" : "sell", amount: 250000, usd: Math.round(250000 * baseProfile.price), timeAgo: "12m ago", dex: "CEX Flow" },
        ],
      },
    });
  }

  // 3. Deployer / Dev Wallet (Cluster 1)
  const devId = `dev_wallet_${upper.toLowerCase()}`;
  const devTokens = Math.round(baseProfile.totalSupply * (devPct / 100));
  const devAction = seed % 3 === 0 ? "holding" : "dumping";
  nodes.push({
    id: devId,
    label: "Deployer / Creator 👨‍💻",
    holdingPct: devPct,
    holdingTokens: devTokens,
    holdingUsd: Math.round(devTokens * baseProfile.price),
    type: "dev",
    clusterId: 1,
    whaleStatus: {
      action: devAction,
      netFlow24h: devAction === "dumping" ? -Math.round(devTokens * 0.08) : 0,
      lastAction: devAction === "dumping" ? `Distributed tokens to secondary wallets` : "Holding Genesis Allocation",
      totalBuys: 2,
      totalSells: devAction === "dumping" ? 12 + (seed % 10) : 0,
      recentTrades: devAction === "dumping" ? [
        { type: "sell", amount: 150000, usd: Math.round(150000 * baseProfile.price), timeAgo: "2h ago", dex: baseProfile.chain === "Solana" ? "Raydium" : "Uniswap" },
      ] : [],
    },
  });

  // 4. Dev Cluster Offshoot Wallets (Cluster 1)
  for (let i = 1; i <= devSplits; i++) {
    const subId = `dev_split_${i}_${upper.toLowerCase()}`;
    const pct = +( (devPct / devSplits) * (1 + ((seed + i) % 10) / 20) ).toFixed(2);
    const tokens = Math.round(baseProfile.totalSupply * (pct / 100));
    nodes.push({
      id: subId,
      label: `Dev Sub-wallet #${i} (Cluster 1)`,
      holdingPct: pct,
      holdingTokens: tokens,
      holdingUsd: Math.round(tokens * baseProfile.price),
      type: "sniper",
      clusterId: 1,
      whaleStatus: {
        action: i % 2 === 0 ? "dumping" : "holding",
        netFlow24h: i % 2 === 0 ? -Math.round(tokens * 0.05) : 0,
        lastAction: i % 2 === 0 ? `Sold $${Math.round(tokens * 0.05 * baseProfile.price).toLocaleString()} via DEX` : "Inactive (Holding)",
        totalBuys: 1,
        totalSells: i % 2 === 0 ? 3 + (seed % 5) : 0,
        recentTrades: i % 2 === 0
            ? [{ type: "sell", amount: Math.round(tokens * 0.05), usd: Math.round(tokens * 0.05 * baseProfile.price), timeAgo: `${i}h ago`, dex: "Jupiter" }]
            : [],
      },
    });

    links.push({
      source: devId,
      target: subId,
      amount: tokens,
      pct,
      timeAgo: `${i * (seed % 5) + 1}d ago`,
      type: "dev_split",
    });
  }

  // 5. Independent Whales & Sniper Rings
  for (let i = 1; i <= whaleCount; i++) {
    const isCluster2 = i >= 4 && i <= 3 + baseProfile.clusters.insiderClusters * 2;
    const isCluster3 = i >= 11 && i <= 10 + baseProfile.clusters.insiderClusters * 2;
    const clusterId = isCluster2 ? 2 : isCluster3 ? 3 : 0;
    
    const baseWhalePct = isFallback ? 1.0 + (seed % 50) / 20 : 3.2;
    const pct = +(baseWhalePct / (1 + i * 0.15)).toFixed(2);
    const tokens = Math.round(baseProfile.totalSupply * (pct / 100));
    
    const isNetBuyer = (seed + i * 7) % 3 === 0;
    const isNetSeller = (seed + i * 11) % 3 === 1;
    const action = isNetBuyer ? "accumulating" : isNetSeller ? "dumping" : "holding";

    const shortAddr = `${(seed + i * 9999).toString(16).slice(0, 4)}...${(seed * 31 + i * 777).toString(16).slice(-4)}`;
    const walletId = `wallet_${upper.toLowerCase()}_${i}`;

    const label = clusterId > 0 
      ? `Syndicate Whale #${i} (Cluster ${clusterId})` 
      : isNetBuyer 
      ? `Mega Whale #${i} 🟢 (Buying)` 
      : `Top Holder #${i} 🐳`;

    const chainNative = baseProfile.chain === "Solana" ? "SOL" : "ETH";
    const dex = baseProfile.chain === "Solana" ? "Raydium" : "Uniswap";

    nodes.push({
      id: walletId,
      label,
      holdingPct: pct,
      holdingTokens: tokens,
      holdingUsd: Math.round(tokens * baseProfile.price),
      type: clusterId > 0 ? "sniper" : "whale",
      clusterId,
      whaleStatus: {
        action,
        netFlow24h: isNetBuyer ? Math.round(tokens * 0.12) : isNetSeller ? -Math.round(tokens * 0.15) : 0,
        lastAction: isNetBuyer
          ? `Swapped ${Math.round(tokens * 0.04 * baseProfile.price / 150)} ${chainNative} for ${upper} on ${dex} (${(seed % 50) + i}m ago)`
          : isNetSeller
          ? `Sold ${Math.round(tokens * 0.05).toLocaleString()} ${upper} for USDC (${(seed % 10) + i}h ago)`
          : "No transfers in last 72 hours",
        totalBuys: isNetBuyer ? 10 + (seed % 10) : 3,
        totalSells: isNetSeller ? 15 + (seed % 10) : 1,
        recentTrades: isNetBuyer
          ? [
              { type: "buy", amount: Math.round(tokens * 0.04), usd: Math.round(tokens * 0.04 * baseProfile.price), timeAgo: "28m ago", dex },
              { type: "buy", amount: Math.round(tokens * 0.08), usd: Math.round(tokens * 0.08 * baseProfile.price), timeAgo: "3h ago", dex },
            ]
          : isNetSeller
          ? [
              { type: "sell", amount: Math.round(tokens * 0.05), usd: Math.round(tokens * 0.05 * baseProfile.price), timeAgo: "1h ago", dex },
            ]
          : [],
      },
    });

    if (isCluster2 && i > 4) {
      links.push({
        source: `wallet_${upper.toLowerCase()}_4`,
        target: walletId,
        amount: Math.round(tokens * 0.5),
        pct: +(pct * 0.5).toFixed(2),
        timeAgo: `${i}d ago`,
        type: "sniper_seed",
      });
    }

    if (isCluster3 && i > 11) {
      links.push({
        source: `wallet_${upper.toLowerCase()}_11`,
        target: walletId,
        amount: Math.round(tokens * 0.6),
        pct: +(pct * 0.6).toFixed(2),
        timeAgo: `${i * 2}d ago`,
        type: "transfer",
      });
    }
  }

  return { profile: baseProfile, nodes, links };
}

export async function GET(request: Request) {
  // Admin-only protection
  const { isAdmin } = await requireAdmin(false);
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token") || "POPCAT";

  try {
    const { profile, nodes, links } = generateDeterministicHolders(token);

    // Calculate cluster aggregation
    const clusterMap: Record<number, number> = {};
    for (const node of nodes) {
      if (node.clusterId > 0) {
        clusterMap[node.clusterId] = (clusterMap[node.clusterId] || 0) + node.holdingPct;
      }
    }

    const largestClusterPct = Math.max(0, ...Object.values(clusterMap));
    const totalClusterSupply = Object.values(clusterMap).reduce((a, b) => a + b, 0);

    const accumulatingCount = nodes.filter((n) => n.whaleStatus.action === "accumulating").length;
    const dumpingCount = nodes.filter((n) => n.whaleStatus.action === "dumping").length;

    const whaleSentiment =
      accumulatingCount > dumpingCount
        ? "Bullish Accumulation"
        : dumpingCount > accumulatingCount
        ? "Bearish Distribution"
        : "Neutral Consolidation";

    return NextResponse.json({
      success: true,
      token: profile,
      metrics: {
        totalHoldersSampled: nodes.length,
        clusterCount: Object.keys(clusterMap).length,
        largestClusterPct: +largestClusterPct.toFixed(2),
        totalClusterSupply: +totalClusterSupply.toFixed(2),
        riskScore: profile.riskScore,
        whaleSentiment,
        accumulatingWhales: accumulatingCount,
        dumpingWhales: dumpingCount,
      },
      nodes,
      links,
      availablePresets: Object.keys(TOKEN_PROFILES),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to generate bubble map data" },
      { status: 500 }
    );
  }
}
