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
  const baseProfile = TOKEN_PROFILES[upper] || {
    name: `${upper} Token`,
    symbol: upper,
    chain: "Solana",
    contract: `7x${upper.padEnd(6, "0")}kZE3KNkrHERKzAetSxbrWeniQfyJY4Jpump`,
    price: 0.05,
    totalSupply: 1000000000,
    marketCap: 50000000,
    riskScore: 45,
    clusters: { devSplits: 3, insiderClusters: 2 },
  };

  const seed = upper.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const nodes: HolderNode[] = [];
  const links: TransferLink[] = [];

  // 1. Raydium/Uniswap Liquidity Pool Node
  const poolPct = 12.5;
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
      totalBuys: 2840,
      totalSells: 2610,
      recentTrades: [],
    },
  });

  // 2. CEX Exchange Hot Wallets (MEXC / Binance)
  const mexcPct = 8.2;
  const mexcTokens = Math.round(baseProfile.totalSupply * (mexcPct / 100));
  nodes.push({
    id: `cex_mexc_${upper.toLowerCase()}`,
    label: "MEXC Exchange Hot Wallet 🏛️",
    holdingPct: mexcPct,
    holdingTokens: mexcTokens,
    holdingUsd: Math.round(mexcTokens * baseProfile.price),
    type: "cex",
    clusterId: 0,
    whaleStatus: {
      action: "accumulating",
      netFlow24h: Math.round(mexcTokens * 0.04),
      lastAction: "CEX User Deposits (+1.2M tokens in last 4h)",
      totalBuys: 1420,
      totalSells: 980,
      recentTrades: [
        { type: "buy", amount: 250000, usd: Math.round(250000 * baseProfile.price), timeAgo: "12m ago", dex: "CEX Inflow" },
        { type: "buy", amount: 180000, usd: Math.round(180000 * baseProfile.price), timeAgo: "44m ago", dex: "CEX Inflow" },
      ],
    },
  });

  // 3. Deployer / Dev Wallet (Cluster 1)
  const devId = `dev_wallet_${upper.toLowerCase()}`;
  const devPct = 4.8;
  const devTokens = Math.round(baseProfile.totalSupply * (devPct / 100));
  nodes.push({
    id: devId,
    label: "Deployer / Creator 👨‍💻",
    holdingPct: devPct,
    holdingTokens: devTokens,
    holdingUsd: Math.round(devTokens * baseProfile.price),
    type: "dev",
    clusterId: 1,
    whaleStatus: {
      action: "dumping",
      netFlow24h: -Math.round(devTokens * 0.08),
      lastAction: "Distributed 350,000 tokens to secondary wallets",
      totalBuys: 2,
      totalSells: 19,
      recentTrades: [
        { type: "sell", amount: 150000, usd: Math.round(150000 * baseProfile.price), timeAgo: "2h ago", dex: "Raydium" },
        { type: "transfer", amount: 200000, usd: Math.round(200000 * baseProfile.price), timeAgo: "5h ago" },
      ],
    },
  });

  // 4. Dev Cluster Offshoot Wallets (Cluster 1)
  for (let i = 1; i <= baseProfile.clusters.devSplits; i++) {
    const subId = `dev_split_${i}_${upper.toLowerCase()}`;
    const pct = +(2.8 - i * 0.4).toFixed(2);
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
        lastAction: i % 2 === 0 ? "Sold $12,400 via Jupiter DEX" : "Inactive (Holding)",
        totalBuys: 1,
        totalSells: i % 2 === 0 ? 8 : 0,
        recentTrades:
          i % 2 === 0
            ? [{ type: "sell", amount: 80000, usd: Math.round(80000 * baseProfile.price), timeAgo: "1h ago", dex: "Jupiter" }]
            : [],
      },
    });

    links.push({
      source: devId,
      target: subId,
      amount: tokens,
      pct,
      timeAgo: `${i * 3 + 2}d ago`,
      type: "dev_split",
    });
  }

  // 5. Independent Whales & Sniper Rings (Clusters 2 & 3 & Unconnected)
  const whaleCount = 22;
  for (let i = 1; i <= whaleCount; i++) {
    const isCluster2 = i >= 4 && i <= 7;
    const isCluster3 = i >= 11 && i <= 13;
    const clusterId = isCluster2 ? 2 : isCluster3 ? 3 : 0;
    
    // Deterministic holding percentage
    const pct = +(3.2 / (1 + i * 0.18)).toFixed(2);
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
        netFlow24h: isNetBuyer
          ? Math.round(tokens * 0.12)
          : isNetSeller
          ? -Math.round(tokens * 0.15)
          : 0,
        lastAction: isNetBuyer
          ? `Swapped 25 SOL for ${upper} on Raydium (28m ago)`
          : isNetSeller
          ? `Sold ${Math.round(tokens * 0.05).toLocaleString()} ${upper} for USDC (1h ago)`
          : "No transfers in last 72 hours",
        totalBuys: isNetBuyer ? 14 : 3,
        totalSells: isNetSeller ? 18 : 1,
        recentTrades: isNetBuyer
          ? [
              { type: "buy", amount: Math.round(tokens * 0.04), usd: Math.round(tokens * 0.04 * baseProfile.price), timeAgo: "28m ago", dex: "Raydium" },
              { type: "buy", amount: Math.round(tokens * 0.08), usd: Math.round(tokens * 0.08 * baseProfile.price), timeAgo: "3h ago", dex: "Jupiter" },
            ]
          : isNetSeller
          ? [
              { type: "sell", amount: Math.round(tokens * 0.05), usd: Math.round(tokens * 0.05 * baseProfile.price), timeAgo: "1h ago", dex: "Raydium" },
            ]
          : [],
      },
    });

    // Create syndicate transfer links for cluster 2
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

    // Create syndicate transfer links for cluster 3
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
