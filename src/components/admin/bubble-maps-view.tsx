"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as d3 from "d3-force";
import type { AdminTrackedWallet, AdminTrackedToken } from "@/lib/types";

interface HolderNode extends d3.SimulationNodeDatum {
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
  radius?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface TransferLink extends d3.SimulationLinkDatum<HolderNode> {
  source: any;
  target: any;
  amount: number;
  pct: number;
  timeAgo: string;
  type: "dev_split" | "transfer" | "sniper_seed";
}

interface MapData {
  token: {
    name: string;
    symbol: string;
    chain: string;
    contract: string;
    price: number;
    totalSupply: number;
    marketCap: number;
    riskScore: number;
  };
  metrics: {
    totalHoldersSampled: number;
    clusterCount: number;
    largestClusterPct: number;
    totalClusterSupply: number;
    riskScore: number;
    whaleSentiment: string;
    accumulatingWhales: number;
    dumpingWhales: number;
  };
  nodes: HolderNode[];
  links: TransferLink[];
  availablePresets: string[];
}

const CLUSTER_COLORS = [
  "#6b7280", // Cluster 0: Unconnected / Independent (Gray)
  "#f59e0b", // Cluster 1: Dev & Deployer Splits (Amber)
  "#8b5cf6", // Cluster 2: Sniper Ring A (Purple)
  "#ec4899", // Cluster 3: Insider Syndicate B (Pink)
  "#06b6d4", // Cluster 4: Secondary Cluster (Cyan)
];

export function BubbleMapsView() {
  const searchParams = useSearchParams();
  const initialToken = searchParams.get("token") || "POPCAT";

  const [currentToken, setCurrentToken] = useState(initialToken.toUpperCase());
  const [customInput, setCustomInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [data, setData] = useState<MapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inspector & Highlights
  const [selectedNode, setSelectedNode] = useState<HolderNode | null>(null);
  const [highlightFilter, setHighlightFilter] = useState<"all" | "accumulating" | "dumping" | "clusters">("all");
  const [copied, setCopied] = useState(false);

  // View Mode: Interactive Map vs Whale Data Table
  const [viewMode, setViewMode] = useState<"map" | "table">("map");

  // Table Sorting & Filters
  const [tableSortField, setTableSortField] = useState<"netFlow" | "holdingPct" | "holdingUsd" | "sells">("netFlow");
  const [tableSortDir, setTableSortDir] = useState<"asc" | "desc">("asc"); // asc puts largest negative sellers first
  const [tableSearch, setTableSearch] = useState("");
  const [tableClusterFilter, setTableClusterFilter] = useState<number | "all">("all");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const simulationRef = useRef<d3.Simulation<HolderNode, TransferLink> | null>(null);
  const draggedNodeRef = useRef<HolderNode | null>(null);
  const hoveredNodeRef = useRef<HolderNode | null>(null);

  // Watchlist & Tracking State
  const [trackedWallets, setTrackedWallets] = useState<AdminTrackedWallet[]>([]);
  const [trackedTokens, setTrackedTokens] = useState<AdminTrackedToken[]>([]);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [scannerLoading, setScannerLoading] = useState(false);

  const loadTrackedWalletsAndTokens = async () => {
    try {
      const [wRes, tRes] = await Promise.all([
        fetch("/api/admin/tracked-wallets"),
        fetch("/api/admin/tracked-tokens")
      ]);
      const wJson = await wRes.json();
      const tJson = await tRes.json();
      
      if (wJson.success) setTrackedWallets(wJson.data);
      if (tJson.success) setTrackedTokens(tJson.data);
    } catch (err) {
      console.error("Failed to load tracked data:", err);
    }
  };

  useEffect(() => {
    loadTrackedWalletsAndTokens();
  }, []);

  const toggleTrackWallet = async (walletId: string, label: string) => {
    const existing = trackedWallets.find((w) => w.wallet_address === walletId);
    setWatchlistLoading(true);
    try {
      if (existing) {
        await fetch(`/api/admin/tracked-wallets?id=${existing.id}`, { method: "DELETE" });
        setTrackedWallets((prev) => prev.filter((w) => w.id !== existing.id));
      } else {
        const res = await fetch("/api/admin/tracked-wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wallet_address: walletId, label }),
        });
        const json = await res.json();
        if (json.success) setTrackedWallets((prev) => [json.data, ...prev]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const toggleTrackToken = async (symbol: string) => {
    const existing = trackedTokens.find((t) => t.symbol === symbol);
    setWatchlistLoading(true);
    try {
      if (existing) {
        await fetch(`/api/admin/tracked-tokens?id=${existing.id}`, { method: "DELETE" });
        setTrackedTokens((prev) => prev.filter((t) => t.id !== existing.id));
      } else {
        const res = await fetch("/api/admin/tracked-tokens", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ symbol }),
        });
        const json = await res.json();
        if (json.success) setTrackedTokens((prev) => [json.data, ...prev]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setWatchlistLoading(false);
    }
  };

  const runWhaleScanner = async () => {
    setScannerLoading(true);
    try {
      const res = await fetch("/api/admin/whale-scanner", { method: "POST" });
      const json = await res.json();
      if (json.success) {
        alert(json.message); // Simple alert for now, could use a toast
      } else {
        alert("Scanner failed: " + json.error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setScannerLoading(false);
    }
  };

  // Computed Whale Flow & Outflow Metrics
  const whaleStats = useMemo(() => {
    if (!data) return { netFlowTokens: 0, netFlowUsd: 0, topDumper: null, topBuyer: null, totalDumpingTokens: 0 };
    const nonPool = data.nodes.filter((n) => n.type !== "pool");
    const netFlowTokens = nonPool.reduce((acc, n) => acc + n.whaleStatus.netFlow24h, 0);
    const netFlowUsd = Math.round(netFlowTokens * data.token.price);

    const dumpers = nonPool.filter((n) => n.whaleStatus.netFlow24h < 0);
    const totalDumpingTokens = Math.abs(dumpers.reduce((acc, n) => acc + n.whaleStatus.netFlow24h, 0));

    const sortedByFlow = [...nonPool].sort(
      (a, b) => a.whaleStatus.netFlow24h - b.whaleStatus.netFlow24h
    );
    const topDumper = sortedByFlow.length > 0 && sortedByFlow[0].whaleStatus.netFlow24h < 0 ? sortedByFlow[0] : null;
    const topBuyer =
      sortedByFlow.length > 0 && sortedByFlow[sortedByFlow.length - 1].whaleStatus.netFlow24h > 0
        ? sortedByFlow[sortedByFlow.length - 1]
        : null;

    return { netFlowTokens, netFlowUsd, topDumper, topBuyer, totalDumpingTokens };
  }, [data]);

  // Filtered & Sorted Nodes for the Table View
  const tableRows = useMemo(() => {
    if (!data) return [];
    let list = data.nodes.filter((n) => n.type !== "pool");

    if (highlightFilter === "accumulating") {
      list = list.filter((n) => n.whaleStatus.action === "accumulating");
    } else if (highlightFilter === "dumping") {
      list = list.filter((n) => n.whaleStatus.action === "dumping");
    } else if (highlightFilter === "clusters") {
      list = list.filter((n) => n.clusterId > 0);
    }

    if (tableClusterFilter !== "all") {
      list = list.filter((n) => n.clusterId === tableClusterFilter);
    }

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase();
      list = list.filter(
        (n) =>
          n.id.toLowerCase().includes(q) ||
          n.label.toLowerCase().includes(q) ||
          n.whaleStatus.lastAction.toLowerCase().includes(q)
      );
    }

    list = [...list].sort((a, b) => {
      let diff = 0;
      if (tableSortField === "netFlow") {
        diff = a.whaleStatus.netFlow24h - b.whaleStatus.netFlow24h;
      } else if (tableSortField === "holdingPct") {
        diff = a.holdingPct - b.holdingPct;
      } else if (tableSortField === "holdingUsd") {
        diff = a.holdingUsd - b.holdingUsd;
      } else if (tableSortField === "sells") {
        diff = a.whaleStatus.totalSells - b.whaleStatus.totalSells;
      }
      return tableSortDir === "asc" ? diff : -diff;
    });

    return list;
  }, [data, highlightFilter, tableClusterFilter, tableSearch, tableSortField, tableSortDir]);

  const handleSortToggle = (field: "netFlow" | "holdingPct" | "holdingUsd" | "sells") => {
    if (tableSortField === field) {
      setTableSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setTableSortField(field);
      // For netFlow, default asc so dumpers (negative) show first. For others, default desc.
      setTableSortDir(field === "netFlow" ? "asc" : "desc");
    }
  };

  // Fetch token graph data
  const loadTokenData = async (tokenSymbol: string) => {
    setLoading(true);
    setError(null);
    setSelectedNode(null);
    try {
      const res = await fetch(`/api/admin/bubblemaps?token=${encodeURIComponent(tokenSymbol)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
      } else {
        throw new Error(json.error || "Failed to load bubble map");
      }
    } catch (err: any) {
      setError(err.message || "Failed to load bubble map data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTokenData(currentToken);
  }, [currentToken]);

  // Set up Force-Directed Simulation on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.nodes.length === 0) return;

    const width = container.clientWidth || 900;
    const height = Math.max(container.clientHeight || 650, 600);

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    // Deep clone nodes and links for D3 simulation
    const nodes: HolderNode[] = data.nodes.map((n) => {
      // Radius scaled with holdingPct
      const r = Math.max(16, Math.min(68, 12 + Math.sqrt(n.holdingPct) * 16));
      return {
        ...n,
        radius: r,
        x: width / 2 + (Math.random() - 0.5) * 300,
        y: height / 2 + (Math.random() - 0.5) * 300,
      };
    });

    const links: TransferLink[] = data.links.map((l) => ({
      ...l,
      source: l.source,
      target: l.target,
    }));

    if (simulationRef.current) simulationRef.current.stop();

    const simulation = d3
      .forceSimulation<HolderNode>(nodes)
      .force(
        "link",
        d3
          .forceLink<HolderNode, TransferLink>(links)
          .id((d) => d.id)
          .distance(90)
          .strength(0.4)
      )
      .force("charge", d3.forceManyBody<HolderNode>().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.06))
      .force(
        "collide",
        d3
          .forceCollide<HolderNode>()
          .radius((d) => (d.radius || 20) + 8)
          .iterations(2)
      )
      .alpha(1)
      .alphaDecay(0.025);

    simulationRef.current = simulation;

    // Render loop
    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw faint background radar rings
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      const centerDistances = [100, 200, 300, 420];
      for (const d of centerDistances) {
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, d, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw Links (Wallet Transfers)
      for (const link of links) {
        const source: any = link.source;
        const target: any = link.target;
        if (!source || !target || source.x == null || target.x == null) continue;

        const isLinkedToSelected =
          selectedNode &&
          (selectedNode.id === source.id || selectedNode.id === target.id);

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(source.x, source.y);
        ctx.lineTo(target.x, target.y);

        if (isLinkedToSelected) {
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 3]);
        } else {
          ctx.strokeStyle =
            link.type === "dev_split"
              ? "rgba(245, 158, 11, 0.45)"
              : "rgba(139, 92, 246, 0.4)";
          ctx.lineWidth = 1.2;
          ctx.setLineDash([]);
        }
        ctx.stroke();

        // Draw transfer flow direction dots
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        ctx.beginPath();
        ctx.arc(midX, midY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = isLinkedToSelected ? "#fbbf24" : "rgba(255, 255, 255, 0.4)";
        ctx.fill();
        ctx.restore();
      }

      // Draw Nodes (Wallets)
      for (const node of nodes) {
        if (node.x == null || node.y == null || !node.radius) continue;

        // Keep inside bounds
        const pad = node.radius + 6;
        node.x = Math.max(pad, Math.min(width - pad, node.x));
        node.y = Math.max(pad, Math.min(height - pad, node.y));

        const isSelected = selectedNode?.id === node.id;
        const isHovered = hoveredNodeRef.current?.id === node.id;

        // Check Highlight Filter
        let isDimmed = false;
        if (highlightFilter === "accumulating" && node.whaleStatus.action !== "accumulating") {
          isDimmed = true;
        } else if (highlightFilter === "dumping" && node.whaleStatus.action !== "dumping") {
          isDimmed = true;
        } else if (highlightFilter === "clusters" && node.clusterId === 0) {
          isDimmed = true;
        }

        ctx.save();
        ctx.globalAlpha = isDimmed ? 0.25 : 1;

        // Base Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        // Color based on cluster or action
        const clusterColor =
          CLUSTER_COLORS[node.clusterId % CLUSTER_COLORS.length];

        const grad = ctx.createRadialGradient(
          node.x - node.radius * 0.3,
          node.y - node.radius * 0.3,
          node.radius * 0.1,
          node.x,
          node.y,
          node.radius
        );

        if (node.type === "pool") {
          grad.addColorStop(0, "#38bdf8");
          grad.addColorStop(1, "#0284c7");
        } else if (node.type === "cex") {
          grad.addColorStop(0, "#facc15");
          grad.addColorStop(1, "#ca8a04");
        } else if (node.whaleStatus.action === "accumulating") {
          grad.addColorStop(0, "#34d399");
          grad.addColorStop(1, "#059669");
        } else if (node.whaleStatus.action === "dumping") {
          grad.addColorStop(0, "#f87171");
          grad.addColorStop(1, "#dc2626");
        } else {
          grad.addColorStop(0, clusterColor);
          grad.addColorStop(1, "#1f2937");
        }

        ctx.fillStyle = grad;
        ctx.fill();

        // Border / Halo
        ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 1.5;
        ctx.strokeStyle = isSelected
          ? "#fbbf24"
          : isHovered
          ? "#ffffff"
          : node.clusterId > 0
          ? clusterColor
          : "rgba(255, 255, 255, 0.2)";
        ctx.stroke();

        // Cluster Ring for Connected Syndicates
        if (node.clusterId > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = clusterColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 2]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Inner Label: Supply %
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 4;

        if (node.radius >= 22) {
          ctx.font = `bold ${Math.max(10, Math.floor(node.radius * 0.38))}px monospace`;
          ctx.fillStyle = "#ffffff";
          ctx.fillText(`${node.holdingPct}%`, node.x, node.y);

          // Sub-badge icon (Whale, Dev, Pool, or Action)
          const badge =
            node.type === "pool"
              ? "💧"
              : node.type === "cex"
              ? "🏛️"
              : node.type === "dev"
              ? "👨‍💻"
              : node.whaleStatus.action === "accumulating"
              ? "🟢"
              : node.whaleStatus.action === "dumping"
              ? "🔴"
              : "🐳";

          ctx.font = `${Math.max(9, Math.floor(node.radius * 0.3))}px sans-serif`;
          ctx.fillText(badge, node.x, node.y - node.radius * 0.55);
        }

        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      simulation.stop();
    };
  }, [data, selectedNode, highlightFilter]);

  // Pointer event handlers
  const findNodeAt = (x: number, y: number): HolderNode | null => {
    if (!simulationRef.current) return null;
    const nodes = simulationRef.current.nodes();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i];
      if (node.x == null || node.y == null || !node.radius) continue;
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy <= node.radius * node.radius) {
        return node;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hit = findNodeAt(x, y);
    if (hit) {
      draggedNodeRef.current = hit;
      hit.fx = hit.x;
      hit.fy = hit.y;
      simulationRef.current?.alphaTarget(0.3).restart();
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      draggedNodeRef.current.fx = x;
      draggedNodeRef.current.fy = y;
    } else {
      const hit = findNodeAt(x, y);
      hoveredNodeRef.current = hit;
      if (canvasRef.current) {
        canvasRef.current.style.cursor = hit ? "pointer" : "default";
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (draggedNodeRef.current) {
      draggedNodeRef.current.fx = null;
      draggedNodeRef.current.fy = null;
      simulationRef.current?.alphaTarget(0);
      draggedNodeRef.current = null;
    } else if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const hit = findNodeAt(x, y);
      if (hit) {
        setSelectedNode(hit);
        setCopied(false);
      }
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customInput.trim()) return;
    setCurrentToken(customInput.trim().toUpperCase());
    setCustomInput("");
    setShowSuggestions(false);
  };

  const handleSuggestionClick = (sym: string) => {
    setCurrentToken(sym);
    setCustomInput("");
    setShowSuggestions(false);
  };

  const HOT_TOKENS = ["POPCAT", "GOAT", "MOODENG", "PNUT", "CHILLGUY", "SPX", "NEIRO"];
  const allSuggestions = Array.from(new Set([...HOT_TOKENS, ...trackedTokens.map((t) => t.symbol)]));
  const filteredSuggestions = allSuggestions.filter((sym) =>
    sym.toLowerCase().includes(customInput.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header Banner */}
      <div className="bg-panel border border-line rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-xl shadow-xs">
            🕸️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-text">
                BubbleMaps & Whale Tracker
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ADMIN
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/20">
                ON-CHAIN CLUSTERS
              </span>
            </div>
            <p className="text-xs text-muted">
              Inspect holder distribution, multi-wallet developer splits, and live DEX Buy vs Sell activities for non-major tokens.
            </p>
          </div>
        </div>

        {/* Global Links */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWatchlist(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 border border-amber-500/30 transition-colors"
          >
            <span>⭐</span>
            <span>Watchlist ({trackedWallets.length}W, {trackedTokens.length}T)</span>
          </button>
          <Link
            href="/admin/bubbles"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-panel-soft hover:bg-panel-soft/80 text-text border border-line transition-colors"
          >
            <span>🫧</span>
            <span>Market Bubbles</span>
          </Link>
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-panel-soft hover:bg-panel-soft/80 text-muted hover:text-text border border-line transition-colors"
          >
            ← Admin Dashboard
          </Link>
        </div>
      </div>

      {/* Preset Token Selector & Contract Search Bar */}
      <div className="bg-panel/90 backdrop-blur border border-line rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Token Presets (Non-Major / Meme Coins) */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          <span className="text-[11px] font-semibold text-muted shrink-0 mr-1">
            Hot Tokens:
          </span>
          {HOT_TOKENS.map(
            (sym) => (
              <button
                key={sym}
                type="button"
                onClick={() => setCurrentToken(sym)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  currentToken === sym
                    ? "bg-purple-600 text-white shadow-xs"
                    : "bg-panel-soft text-muted hover:text-text border border-line"
                }`}
              >
                ${sym}
              </button>
            )
          )}
        </div>

        {/* Custom Contract / Symbol Search */}
        <form
          onSubmit={handleSearchSubmit}
          className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[240px] relative"
        >
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search coin or contract..."
              value={customInput}
              onChange={(e) => {
                setCustomInput(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              className="w-full bg-panel-soft border border-line rounded-xl px-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-purple-500"
            />
            {showSuggestions && customInput.trim() && filteredSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-panel border border-line rounded-xl shadow-lg overflow-hidden z-50">
                {filteredSuggestions.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => handleSuggestionClick(sym)}
                    className="w-full text-left px-3 py-2 text-xs text-text hover:bg-panel-soft transition-colors cursor-pointer"
                  >
                    ${sym}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shrink-0 cursor-pointer transition-colors"
          >
            Scan Map
          </button>
          
          {/* Token Tracking Toggle */}
          <button
            type="button"
            disabled={watchlistLoading}
            onClick={() => toggleTrackToken(currentToken)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition-colors disabled:opacity-50 flex items-center gap-1 ${
              trackedTokens.some((t) => t.symbol === currentToken)
                ? "bg-amber-500/20 text-amber-500 border border-amber-500/40"
                : "bg-panel border border-line text-muted hover:text-text hover:bg-panel-soft"
            }`}
          >
            ⭐ {trackedTokens.some((t) => t.symbol === currentToken) ? "Watching Token" : "Watch Token"}
          </button>
        </form>
      </div>

      {/* Overview Metrics Cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-panel border border-line rounded-2xl p-3.5 shadow-xs">
            <p className="text-[10px] text-muted uppercase font-semibold">Token / Price</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-base font-black text-text">${data.token.symbol}</span>
              <span className="text-xs font-mono text-muted">${data.token.price}</span>
            </div>
            <p className="text-[10px] text-muted truncate mt-0.5">{data.token.chain}</p>
          </div>

          <div className="bg-panel border border-line rounded-2xl p-3.5 shadow-xs">
            <p className="text-[10px] text-muted uppercase font-semibold">Cluster Risk Score</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`text-base font-mono font-black ${
                  data.metrics.riskScore > 50
                    ? "text-loss"
                    : data.metrics.riskScore > 30
                    ? "text-amber-400"
                    : "text-gain"
                }`}
              >
                {data.metrics.riskScore}/100
              </span>
              <span className="text-[10px] text-muted">
                ({data.metrics.clusterCount} syndicates)
              </span>
            </div>
            <p className="text-[10px] text-muted mt-0.5">
              Largest group: <b className="text-text">{data.metrics.largestClusterPct}%</b> supply
            </p>
          </div>

          <div className="bg-panel border border-line rounded-2xl p-3.5 shadow-xs">
            <p className="text-[10px] text-muted uppercase font-semibold">Whale Action Ratio</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs font-bold text-gain">
                🟢 {data.metrics.accumulatingWhales} Buying
              </span>
              <span className="text-xs font-bold text-loss">
                🔴 {data.metrics.dumpingWhales} Selling
              </span>
            </div>
            <p className="text-[10px] text-muted mt-0.5">{data.metrics.whaleSentiment}</p>
          </div>

          <div className="bg-panel border border-line rounded-2xl p-3.5 shadow-xs">
            <p className="text-[10px] text-muted uppercase font-semibold">
              Filter Highlights
            </p>
            <div className="flex items-center gap-1 mt-1">
              {(
                [
                  { id: "all", label: "All" },
                  { id: "accumulating", label: "Buyers 🟢" },
                  { id: "dumping", label: "Sellers 🔴" },
                  { id: "clusters", label: "Clusters ⚠️" },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setHighlightFilter(f.id)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer ${
                    highlightFilter === f.id
                      ? "bg-purple-600 text-white"
                      : "bg-panel-soft text-muted hover:text-text border border-line"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Mode Switcher & Whale Sell Alert Toolbar */}
      {data && (
        <div className="bg-panel border border-line rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-muted">View Mode:</span>
            <div className="flex items-center bg-panel-soft border border-line rounded-xl p-1 gap-1">
              <button
                type="button"
                onClick={() => setViewMode("map")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "map"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-muted hover:text-text"
                }`}
              >
                <span>🕸️</span>
                <span>Network Graph</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  viewMode === "table"
                    ? "bg-purple-600 text-white shadow-xs"
                    : "text-muted hover:text-text"
                }`}
              >
                <span>📊</span>
                <span>Whale Activity Table</span>
                {data.metrics.dumpingWhales > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-loss/30 text-loss">
                    {data.metrics.dumpingWhales} dumping
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Real-time Whale Outflow / Inflow Summary */}
          <div className="flex items-center gap-2 text-xs">
            {whaleStats.netFlowUsd < 0 ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-loss/15 border border-loss/30 text-loss font-semibold">
                <span className="animate-pulse">🔴</span>
                <span>
                  Net Whale Outflow:{" "}
                  <b className="font-mono">${Math.abs(whaleStats.netFlowUsd).toLocaleString()}</b> in 24h
                </span>
                {whaleStats.topDumper && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNode(whaleStats.topDumper);
                      setViewMode("table");
                    }}
                    className="underline text-[11px] text-loss hover:text-white cursor-pointer ml-1"
                  >
                    View Top Seller ({whaleStats.topDumper.holdingPct}%)
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gain/15 border border-gain/30 text-gain font-semibold">
                <span>🟢</span>
                <span>
                  Net Whale Inflow:{" "}
                  <b className="font-mono">+${whaleStats.netFlowUsd.toLocaleString()}</b> in 24h
                </span>
                {whaleStats.topBuyer && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNode(whaleStats.topBuyer);
                      setViewMode("table");
                    }}
                    className="underline text-[11px] text-gain hover:text-white cursor-pointer ml-1"
                  >
                    View Top Buyer ({whaleStats.topBuyer.holdingPct}%)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid: Map / Table + Side Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 1. Interactive Force Graph Viewport */}
        <div
          ref={containerRef}
          className={`${
            viewMode === "map" ? "lg:col-span-2 block" : "hidden"
          } relative h-[620px] sm:h-[680px] bg-panel-soft/40 border border-line rounded-3xl overflow-hidden shadow-inner flex items-center justify-center select-none`}
        >
          {loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs gap-3">
              <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-mono text-text">Scanning on-chain wallet clusters...</p>
            </div>
          )}

          {error && (
            <div className="absolute top-4 left-4 z-20 px-3 py-2 rounded-xl bg-loss/20 border border-loss/30 text-loss text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}

          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="w-full h-full block touch-none"
          />

          {/* Graph Legend Overlay */}
          <div className="absolute top-3 left-3 pointer-events-none bg-panel/85 backdrop-blur-xs border border-line/60 rounded-xl p-2.5 flex flex-col gap-1 text-[11px] font-medium text-muted shadow-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-gain" />
              <span>🟢 Net Buyer (Accumulating)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-loss" />
              <span>🔴 Net Seller (Dumping DEX)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              <span>👨‍💻 Dev Split / Insider Cluster</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400" />
              <span>💧 Liquidity Pool (AMM)</span>
            </div>
          </div>

          <div className="absolute bottom-3 left-3 pointer-events-none text-[10px] text-muted/70 bg-panel/70 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-line/40">
            💡 Click any wallet to view live DEX trades · Drag nodes to reposition
          </div>
        </div>

        {/* 2. Whale Selling & Activity Data Table */}
        <div
          className={`${
            viewMode === "table" ? "lg:col-span-2 flex" : "hidden"
          } flex-col bg-panel border border-line rounded-3xl p-4 sm:p-5 shadow-sm min-h-[620px] max-h-[680px] gap-3`}
        >
          {/* Table Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-line pb-3">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search wallet, label, or action..."
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                className="w-full bg-panel-soft border border-line rounded-xl px-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-purple-500"
              />
              {tableSearch && (
                <button
                  type="button"
                  onClick={() => setTableSearch("")}
                  className="text-xs text-muted hover:text-text px-1"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Cluster Filter */}
              <select
                value={tableClusterFilter}
                onChange={(e) =>
                  setTableClusterFilter(e.target.value === "all" ? "all" : Number(e.target.value))
                }
                className="bg-panel-soft border border-line rounded-xl px-2.5 py-1.5 text-xs text-text font-medium focus:outline-none focus:border-purple-500"
              >
                <option value="all">All Clusters</option>
                <option value={1}>Cluster 1 (Dev & Splits)</option>
                <option value={2}>Cluster 2 (Sniper Syndicate)</option>
                <option value={3}>Cluster 3 (Insider Ring)</option>
                <option value={0}>Independent Wallets</option>
              </select>

              {/* Quick Sort Shortcuts */}
              <button
                type="button"
                onClick={() => {
                  setTableSortField("netFlow");
                  setTableSortDir("asc");
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  tableSortField === "netFlow" && tableSortDir === "asc"
                    ? "bg-loss/20 text-loss border border-loss/40"
                    : "bg-panel-soft text-muted hover:text-text border border-line"
                }`}
                title="Sort by largest negative net sellers first"
              >
                🔴 Sellers First
              </button>

              <button
                type="button"
                onClick={() => {
                  setTableSortField("netFlow");
                  setTableSortDir("desc");
                }}
                className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold cursor-pointer transition-colors ${
                  tableSortField === "netFlow" && tableSortDir === "desc"
                    ? "bg-gain/20 text-gain border border-gain/40"
                    : "bg-panel-soft text-muted hover:text-text border border-line"
                }`}
                title="Sort by largest accumulators first"
              >
                🟢 Buyers First
              </button>
            </div>
          </div>

          {/* Whale Table Content */}
          <div className="overflow-x-auto flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-panel border-b border-line text-[11px] font-semibold text-muted select-none">
                <tr>
                  <th className="py-2.5 px-3">#</th>
                  <th className="py-2.5 px-3">Wallet / Holder</th>
                  <th className="py-2.5 px-2">Cluster</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text"
                    onClick={() => handleSortToggle("holdingPct")}
                  >
                    Supply % {tableSortField === "holdingPct" ? (tableSortDir === "desc" ? "↓" : "↑") : "↕"}
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text"
                    onClick={() => handleSortToggle("holdingUsd")}
                  >
                    Value {tableSortField === "holdingUsd" ? (tableSortDir === "desc" ? "↓" : "↑") : "↕"}
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:text-text"
                    onClick={() => handleSortToggle("netFlow")}
                  >
                    24h Net Flow {tableSortField === "netFlow" ? (tableSortDir === "asc" ? "↓ (Dumping)" : "↑ (Buying)") : "↕"}
                  </th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Recent DEX Action</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 font-mono">
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-muted italic font-sans">
                      No whale wallets match the active search or filters.
                    </td>
                  </tr>
                ) : (
                  tableRows.map((node, index) => {
                    const isSelected = selectedNode?.id === node.id;
                    const clusterColor = CLUSTER_COLORS[node.clusterId % CLUSTER_COLORS.length];
                    const isDumping = node.whaleStatus.action === "dumping";
                    const isAccumulating = node.whaleStatus.action === "accumulating";

                    return (
                      <tr
                        key={node.id}
                        onClick={() => setSelectedNode(node)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-purple-500/15 border-l-2 border-l-purple-500"
                            : "hover:bg-panel-soft/60"
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-2.5 px-3 text-muted text-[11px] font-sans">
                          {index + 1}
                        </td>

                        {/* Wallet Label & ID */}
                        <td className="py-2.5 px-3 font-sans">
                          <div className="flex flex-col">
                            <span className="font-bold text-text text-xs flex items-center gap-1.5">
                              {node.label}
                            </span>
                            <span className="font-mono text-[10px] text-muted truncate max-w-[140px]">
                              {node.id}
                            </span>
                          </div>
                        </td>

                        {/* Cluster Tag */}
                        <td className="py-2.5 px-2 font-sans">
                          {node.clusterId > 0 ? (
                            <span
                              className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                              style={{
                                backgroundColor: `${clusterColor}20`,
                                color: clusterColor,
                                border: `1px solid ${clusterColor}40`,
                              }}
                            >
                              Cluster #{node.clusterId}
                            </span>
                          ) : (
                            <span className="text-[10px] text-muted font-sans">Independent</span>
                          )}
                        </td>

                        {/* Supply Share */}
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text">{node.holdingPct}%</span>
                            <div className="w-12 h-1.5 bg-panel-soft rounded-full overflow-hidden hidden sm:block">
                              <div
                                className="h-full bg-purple-500 rounded-full"
                                style={{ width: `${Math.min(100, node.holdingPct * 10)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Value USD */}
                        <td className="py-2.5 px-3 text-text font-bold">
                          ${(node.holdingUsd / 1e3).toFixed(1)}k
                        </td>

                        {/* 24h Net Flow */}
                        <td className="py-2.5 px-3">
                          {node.whaleStatus.netFlow24h < 0 ? (
                            <div className="flex flex-col text-loss">
                              <span className="font-black text-xs">
                                -${Math.abs(Math.round(node.whaleStatus.netFlow24h * (data?.token.price || 1))).toLocaleString()}
                              </span>
                              <span className="text-[9px] opacity-80">
                                {node.whaleStatus.netFlow24h.toLocaleString()} tokens
                              </span>
                            </div>
                          ) : node.whaleStatus.netFlow24h > 0 ? (
                            <div className="flex flex-col text-gain">
                              <span className="font-black text-xs">
                                +${Math.round(node.whaleStatus.netFlow24h * (data?.token.price || 1)).toLocaleString()}
                              </span>
                              <span className="text-[9px] opacity-80">
                                +{node.whaleStatus.netFlow24h.toLocaleString()} tokens
                              </span>
                            </div>
                          ) : (
                            <span className="text-muted text-[11px]">$0 (Holding)</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3 font-sans">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isDumping
                                ? "bg-loss/20 text-loss border border-loss/30"
                                : isAccumulating
                                ? "bg-gain/20 text-gain border border-gain/30"
                                : "bg-panel-soft text-muted border border-line"
                            }`}
                          >
                            {node.whaleStatus.action}
                          </span>
                        </td>

                        {/* Last Action Snippet */}
                        <td className="py-2.5 px-3 font-sans text-muted text-[11px] max-w-[180px] truncate">
                          {node.whaleStatus.lastAction}
                        </td>

                        {/* Action CTA */}
                        <td className="py-2.5 px-3 text-right font-sans">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedNode(node);
                            }}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-purple-600 text-white"
                                : "bg-panel-soft hover:bg-panel text-text border border-line"
                            }`}
                          >
                            {isSelected ? "Inspecting" : "Inspect →"}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table Footer Info */}
          <div className="pt-2 border-t border-line flex flex-wrap items-center justify-between text-[11px] text-muted">
            <span>
              Showing <b className="text-text">{tableRows.length}</b> whale wallets sampled on-chain.
            </span>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-loss" />
                <span>
                  <b>{tableRows.filter((r) => r.whaleStatus.action === "dumping").length}</b> Selling
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gain" />
                <span>
                  <b>{tableRows.filter((r) => r.whaleStatus.action === "accumulating").length}</b> Buying
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Side Whale & Wallet Inspector */}
        <div className="lg:col-span-1 bg-panel border border-line rounded-3xl p-5 flex flex-col gap-4 shadow-sm overflow-y-auto max-h-[680px]">
          {selectedNode ? (
            <div className="space-y-4 animate-in fade-in duration-150">
              {/* Header */}
              <div className="flex items-start justify-between border-b border-line pb-3">
                <div>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider mb-1 ${
                      selectedNode.whaleStatus.action === "accumulating"
                        ? "bg-gain/20 text-gain border border-gain/30"
                        : selectedNode.whaleStatus.action === "dumping"
                        ? "bg-loss/20 text-loss border border-loss/30"
                        : "bg-panel-soft text-muted border border-line"
                    }`}
                  >
                    {selectedNode.whaleStatus.action.toUpperCase()}
                  </span>
                  <h3 className="text-base font-bold text-text">{selectedNode.label}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="p-1 text-muted hover:text-text rounded-lg hover:bg-panel-soft text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Wallet Address Bar */}
              <div className="bg-panel-soft/70 border border-line rounded-xl p-2.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-mono text-muted truncate">
                  {selectedNode.id}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(selectedNode.id)}
                  className="px-2 py-1 rounded-lg bg-panel hover:bg-panel-soft text-[10px] font-bold text-text border border-line cursor-pointer shrink-0"
                >
                  {copied ? "✓ Copied" : "Copy"}
                </button>
              </div>

              {/* Holding Balance Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="bg-panel-soft/60 border border-line rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase">Supply Share</p>
                  <p className="text-lg font-mono font-black text-text mt-0.5">
                    {selectedNode.holdingPct}%
                  </p>
                </div>
                <div className="bg-panel-soft/60 border border-line rounded-xl p-3">
                  <p className="text-[10px] text-muted uppercase">Estimated Value</p>
                  <p className="text-lg font-mono font-black text-accent mt-0.5">
                    ${(selectedNode.holdingUsd / 1e3).toFixed(1)}k
                  </p>
                </div>
              </div>

              {/* Cluster Syndicate Warning */}
              {selectedNode.clusterId > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-300 space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span>Cluster #{selectedNode.clusterId} Member</span>
                  </div>
                  <p className="text-[11px] text-amber-300/80 leading-relaxed">
                    This wallet is directly connected via pre-launch or bulk transfer transactions to other top wallets in this token.
                  </p>
                </div>
              )}

              {/* Whale Buy / Sell Activity (Answers the user's question directly!) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-text uppercase tracking-wider">
                    Recent DEX Activity
                  </h4>
                  <span className="text-[10px] font-mono text-muted">
                    {selectedNode.whaleStatus.totalBuys}B / {selectedNode.whaleStatus.totalSells}S
                  </span>
                </div>

                <div className="bg-panel-soft/40 border border-line rounded-xl p-2.5 text-xs text-muted">
                  <p className="font-medium text-text">Last Action:</p>
                  <p className="text-[11px] text-muted mt-0.5">
                    {selectedNode.whaleStatus.lastAction}
                  </p>
                </div>

                {selectedNode.whaleStatus.recentTrades.length > 0 ? (
                  <div className="space-y-1.5">
                    {selectedNode.whaleStatus.recentTrades.map((trade, idx) => (
                      <div
                        key={idx}
                        className="bg-panel-soft/60 border border-line rounded-xl p-2 flex items-center justify-between text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                              trade.type === "buy"
                                ? "bg-gain/20 text-gain"
                                : trade.type === "sell"
                                ? "bg-loss/20 text-loss"
                                : "bg-panel text-muted"
                            }`}
                          >
                            {trade.type}
                          </span>
                          <span className="font-mono text-text text-[11px]">
                            {trade.amount.toLocaleString()} ${currentToken}
                          </span>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-[11px] text-text font-semibold">
                            ${trade.usd.toLocaleString()}
                          </p>
                          <p className="text-[9px] text-muted">{trade.timeAgo}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-muted italic text-center py-2">
                    No DEX swaps in the last 72h (Holding)
                  </p>
                )}
              </div>

              {/* Quick Actions */}
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={watchlistLoading}
                  onClick={() => toggleTrackWallet(selectedNode.id, selectedNode.label)}
                  className={`w-full py-2 rounded-xl text-center font-bold text-xs transition-colors disabled:opacity-50 ${
                    trackedWallets.some((w) => w.wallet_address === selectedNode.id)
                      ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 border border-amber-500/40"
                      : "bg-panel-soft hover:bg-panel-soft/80 text-text border border-line"
                  }`}
                >
                  {trackedWallets.some((w) => w.wallet_address === selectedNode.id)
                    ? "⭐ Untrack Wallet"
                    : "⭐ Track Wallet"}
                </button>
                <Link
                  href={`/watchlist`}
                  className="w-full py-2 rounded-xl text-center font-bold text-xs bg-accent hover:bg-accent/90 text-accent-text transition-colors"
                >
                  Create Setup on Watchlist
                </Link>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 text-muted h-full space-y-3">
              <span className="text-4xl">🔍</span>
              <div>
                <p className="font-semibold text-text text-sm">Select a Wallet Bubble</p>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  Click any node on the graph to inspect wallet holdings, cluster ties, and real-time DEX Buy vs Sell transactions.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Tracked Whales Watchlist Modal */}
      {showWatchlist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-panel border border-line rounded-3xl w-full max-w-2xl shadow-xl flex flex-col overflow-hidden max-h-[85vh]">
            <div className="p-5 border-b border-line flex items-center justify-between bg-panel-soft/50">
              <div className="flex items-center gap-3">
                <span className="text-2xl">⭐</span>
                <div>
                  <h2 className="text-lg font-bold text-text">Whale Watchlist & Alerts</h2>
                  <p className="text-xs text-muted">Tracking {trackedWallets.length} wallets and {trackedTokens.length} tokens.</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runWhaleScanner}
                  disabled={scannerLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
                >
                  {scannerLoading ? "Scanning..." : "Run Scanner 🔍"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowWatchlist(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-xl bg-panel hover:bg-panel-soft text-muted hover:text-text border border-line transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              
              {/* Tracked Tokens Section */}
              <div>
                <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-2">
                  <span>🪙 Tracked Tokens</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-panel-soft border border-line text-[10px] text-muted">{trackedTokens.length}</span>
                </h3>
                {trackedTokens.length === 0 ? (
                  <p className="text-xs text-muted italic p-4 bg-panel-soft/30 border border-line rounded-xl text-center">
                    No tokens tracked. Click "Watch Token" next to the search bar.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {trackedTokens.map((token) => (
                      <div key={token.id} className="bg-panel-soft/40 border border-line rounded-xl p-3 flex items-center justify-between group">
                        <span className="font-bold text-xs text-text">${token.symbol}</span>
                        <div className="flex items-center gap-2">
                          <button
                            title={token.alert_enabled ? "Alerts On (Testing Phase)" : "Alerts Off"}
                            className={`text-xs ${token.alert_enabled ? 'text-amber-500' : 'text-muted'}`}
                          >
                            🔔
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleTrackToken(token.symbol)}
                            className="text-muted hover:text-loss opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tracked Wallets Section */}
              <div>
                <h3 className="text-sm font-bold text-text mb-3 flex items-center gap-2">
                  <span>🐋 Tracked Whales</span>
                  <span className="px-1.5 py-0.5 rounded-md bg-panel-soft border border-line text-[10px] text-muted">{trackedWallets.length}</span>
                </h3>
                {trackedWallets.length === 0 ? (
                  <p className="text-xs text-muted italic p-4 bg-panel-soft/30 border border-line rounded-xl text-center">
                    No whales tracked. Click "Track Wallet" inside the BubbleMaps inspector.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {trackedWallets.map((wallet) => (
                      <div
                        key={wallet.id}
                        className="bg-panel-soft/40 border border-line rounded-xl p-3 flex items-center justify-between group"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h3 className="font-bold text-xs text-text truncate">{wallet.label || "Unknown Whale"}</h3>
                            {wallet.alert_enabled && (
                              <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                🔔 Alerts On
                              </span>
                            )}
                          </div>
                          <p className="font-mono text-[10px] text-muted truncate">
                            {wallet.wallet_address}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleTrackWallet(wallet.wallet_address, wallet.label || "")}
                          className="px-2 py-1 rounded-lg text-[10px] font-semibold text-loss hover:bg-loss/10 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                        >
                          Untrack
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
