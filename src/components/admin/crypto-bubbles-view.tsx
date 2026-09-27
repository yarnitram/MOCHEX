"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import Link from "next/link";
import * as d3 from "d3-force";

interface BubbleToken {
  symbol: string;
  base: string;
  price: number;
  change24h: number;
  change1h: number;
  change7d: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  isMajor: boolean;
}

interface SimNode extends d3.SimulationNodeDatum {
  token: BubbleToken;
  radius: number;
  targetRadius: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

type Timeframe = "1h" | "24h" | "7d";
type SizeMetric = "volume" | "performance" | "equal";
type FilterMode = "all" | "gainers" | "losers";

export function CryptoBubblesView() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [tokens, setTokens] = useState<BubbleToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Controls
  const [timeframe, setTimeframe] = useState<Timeframe>("24h");
  const [sizeMetric, setSizeMetric] = useState<SizeMetric>("volume");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [nonMajorOnly, setNonMajorOnly] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Selected Token Modal / Drawer
  const [selectedToken, setSelectedToken] = useState<BubbleToken | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [addingToWatchlist, setAddingToWatchlist] = useState(false);
  const [watchlistSuccess, setWatchlistSuccess] = useState(false);

  // D3 Simulation reference
  const simulationRef = useRef<d3.Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const draggedNodeRef = useRef<SimNode | null>(null);

  // Fetch data
  const fetchData = async () => {
    try {
      const res = await fetch(`/api/admin/bubbles?non_major=${nonMajorOnly}&limit=90`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.tokens) {
        setTokens(data.tokens);
        setError(null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to fetch market bubbles data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [nonMajorOnly, autoRefresh]);

  // Filtered Tokens
  const filteredTokens = useMemo(() => {
    return tokens.filter((t) => {
      if (search && !t.base.toLowerCase().includes(search.toLowerCase())) {
        return false;
      }
      const val = timeframe === "1h" ? t.change1h : timeframe === "7d" ? t.change7d : t.change24h;
      if (filterMode === "gainers" && val < 0) return false;
      if (filterMode === "losers" && val > 0) return false;
      return true;
    });
  }, [tokens, search, filterMode, timeframe]);

  // Initialize and Update Simulation
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || filteredTokens.length === 0) return;

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

    // Calculate radii based on selected size metric
    const maxVol = Math.max(...filteredTokens.map((t) => t.volume24h), 1);
    const minVol = Math.min(...filteredTokens.map((t) => t.volume24h), 1);

    const nodes: SimNode[] = filteredTokens.map((token) => {
      // Retain previous position if available
      const existing = nodesRef.current.find((n) => n.token.symbol === token.symbol);

      let r = 38;
      if (sizeMetric === "volume") {
        const norm = (token.volume24h - minVol) / (maxVol - minVol || 1);
        r = 28 + Math.sqrt(norm) * 62; // 28px to 90px radius
      } else if (sizeMetric === "performance") {
        const change = Math.abs(timeframe === "1h" ? token.change1h : timeframe === "7d" ? token.change7d : token.change24h);
        r = 28 + Math.min(change, 40) * 1.5;
      } else {
        r = 42;
      }

      return {
        token,
        radius: r,
        targetRadius: r,
        x: existing?.x ?? width / 2 + (Math.random() - 0.5) * 200,
        y: existing?.y ?? height / 2 + (Math.random() - 0.5) * 200,
        vx: existing?.vx ?? 0,
        vy: existing?.vy ?? 0,
      };
    });

    nodesRef.current = nodes;

    // Build D3 Force Simulation
    if (simulationRef.current) simulationRef.current.stop();

    const simulation = d3
      .forceSimulation<SimNode>(nodes)
      .force("center", d3.forceCenter(width / 2, height / 2).strength(0.04))
      .force(
        "collide",
        d3
          .forceCollide<SimNode>()
          .radius((d) => d.radius + 3)
          .iterations(3)
      )
      .force("x", d3.forceX(width / 2).strength(0.03))
      .force("y", d3.forceY(height / 2).strength(0.03))
      .alpha(0.8)
      .alphaDecay(0.02)
      .velocityDecay(0.25);

    simulationRef.current = simulation;

    // Render loop
    let animId: number;
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw subtle background grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw each bubble
      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;

        // Keep inside bounds
        const pad = node.radius + 4;
        node.x = Math.max(pad, Math.min(width - pad, node.x));
        node.y = Math.max(pad, Math.min(height - pad, node.y));

        const val =
          timeframe === "1h"
            ? node.token.change1h
            : timeframe === "7d"
            ? node.token.change7d
            : node.token.change24h;
        const isGain = val >= 0;
        const isHovered = hoveredNode?.token.symbol === node.token.symbol;
        const isSelected = selectedToken?.symbol === node.token.symbol;

        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        // Vibrant radial gradient
        const grad = ctx.createRadialGradient(
          node.x - node.radius * 0.3,
          node.y - node.radius * 0.35,
          node.radius * 0.1,
          node.x,
          node.y,
          node.radius
        );

        if (isGain) {
          grad.addColorStop(0, isHovered ? "#34d399" : "#10b981");
          grad.addColorStop(0.7, "#059669");
          grad.addColorStop(1, "#047857");
        } else {
          grad.addColorStop(0, isHovered ? "#f87171" : "#ef4444");
          grad.addColorStop(0.7, "#dc2626");
          grad.addColorStop(1, "#b91c1c");
        }

        ctx.fillStyle = grad;
        ctx.fill();

        // Border / Glow
        ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 1.5;
        ctx.strokeStyle = isSelected
          ? "#fbbf24"
          : isHovered
          ? "#ffffff"
          : isGain
          ? "rgba(110, 231, 183, 0.4)"
          : "rgba(252, 165, 165, 0.4)";
        ctx.stroke();

        // Inner shadow / 3D specular highlight
        ctx.beginPath();
        ctx.ellipse(
          node.x,
          node.y - node.radius * 0.55,
          node.radius * 0.45,
          node.radius * 0.18,
          0,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
        ctx.fill();

        // Text labels inside bubble
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const fontSize = Math.max(10, Math.floor(node.radius * 0.32));
        const subFontSize = Math.max(8, Math.floor(node.radius * 0.22));

        // Token Ticker
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "rgba(0, 0, 0, 0.8)";
        ctx.shadowBlur = 4;
        ctx.fillText(node.token.base, node.x, node.y - node.radius * 0.22);

        // Change Percentage
        ctx.font = `bold ${subFontSize + 1}px monospace`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(
          `${isGain ? "+" : ""}${val.toFixed(1)}%`,
          node.x,
          node.y + node.radius * 0.14
        );

        // Price (only if bubble is large enough)
        if (node.radius >= 38) {
          ctx.font = `${Math.max(8, subFontSize - 1)}px monospace`;
          ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
          const formattedPrice =
            node.token.price < 0.001
              ? node.token.price.toExponential(2)
              : node.token.price < 1
              ? node.token.price.toFixed(4)
              : node.token.price.toFixed(2);
          ctx.fillText(`$${formattedPrice}`, node.x, node.y + node.radius * 0.42);
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
  }, [filteredTokens, sizeMetric, timeframe, hoveredNode, selectedToken]);

  // Mouse & Touch Interactivity
  const findNodeAt = (x: number, y: number): SimNode | null => {
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const node = nodesRef.current[i];
      if (node.x == null || node.y == null) continue;
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
      setHoveredNode(hit);
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
        setSelectedToken(hit.token);
        setWatchlistSuccess(false);
      }
    }
  };

  // Add to Watchlist helper
  const handleAddToWatchlist = async () => {
    if (!selectedToken) return;
    setAddingToWatchlist(true);
    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedToken.symbol,
          entry_price: selectedToken.price,
          stop_loss: +(selectedToken.price * 0.92).toFixed(6),
          take_profit: +(selectedToken.price * 1.25).toFixed(6),
          trigger_price: selectedToken.price,
          order_type: "limit",
          notes: `Added from Market Bubbles. 24h Vol: $${(selectedToken.volume24h / 1e6).toFixed(1)}M, 24h: ${selectedToken.change24h}%`,
        }),
      });
      if (res.ok) {
        setWatchlistSuccess(true);
      }
    } catch {
      // ignore
    } finally {
      setAddingToWatchlist(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Top Banner / Breadcrumb & Controls */}
      <div className="bg-panel border border-line rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-xl shadow-xs">
            🫧
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-text">
                Market Bubbles
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ADMIN
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gain/15 text-gain border border-gain/20">
                LIVE PHYSICS
              </span>
            </div>
            <p className="text-xs text-muted">
              Interactive 2D bubble matrix for emerging & non-major tokens. Sized by volume and momentum.
            </p>
          </div>
        </div>

        {/* Global Action Links */}
        <div className="flex items-center gap-2">
          <Link
            href="/admin/bubblemaps"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-panel-soft hover:bg-panel-soft/80 text-text border border-line transition-colors"
          >
            <span>🕸️</span>
            <span>Open BubbleMaps</span>
          </Link>
          <Link
            href="/admin"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-panel-soft hover:bg-panel-soft/80 text-muted hover:text-text border border-line transition-colors"
          >
            ← Admin Dashboard
          </Link>
        </div>
      </div>

      {/* Control Filter Bar */}
      <div className="bg-panel/90 backdrop-blur border border-line rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        {/* Timeframe Selector */}
        <div className="flex items-center gap-1 bg-panel-soft/80 p-1 rounded-xl border border-line text-xs font-semibold">
          {(["1h", "24h", "7d"] as Timeframe[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                timeframe === tf
                  ? "bg-accent text-accent-text shadow-xs"
                  : "text-muted hover:text-text"
              }`}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Size Metric */}
        <div className="flex items-center gap-1 bg-panel-soft/80 p-1 rounded-xl border border-line text-xs font-semibold">
          <span className="text-[11px] text-muted px-2">Size by:</span>
          {(
            [
              { id: "volume", label: "Volume" },
              { id: "performance", label: "% Change" },
              { id: "equal", label: "Equal" },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSizeMetric(m.id)}
              className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                sizeMetric === m.id
                  ? "bg-panel text-text border border-line shadow-xs font-bold"
                  : "text-muted hover:text-text"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Direction Filter */}
        <div className="flex items-center gap-1 bg-panel-soft/80 p-1 rounded-xl border border-line text-xs font-semibold">
          {(["all", "gainers", "losers"] as FilterMode[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilterMode(f)}
              className={`px-2.5 py-1 rounded-lg transition-all capitalize cursor-pointer ${
                filterMode === f
                  ? f === "gainers"
                    ? "bg-gain/20 text-gain border border-gain/30"
                    : f === "losers"
                    ? "bg-loss/20 text-loss border border-loss/30"
                    : "bg-panel text-text border border-line"
                  : "text-muted hover:text-text"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Non-major Only Toggle */}
        <label className="flex items-center gap-2 text-xs font-medium text-text cursor-pointer select-none bg-panel-soft/50 px-2.5 py-1.5 rounded-xl border border-line">
          <input
            type="checkbox"
            checked={nonMajorOnly}
            onChange={(e) => setNonMajorOnly(e.target.checked)}
            className="rounded border-line text-accent focus:ring-accent"
          />
          <span>Non-Major / Meme Only</span>
        </label>

        {/* Search */}
        <div className="relative min-w-[150px] flex-1 sm:flex-initial">
          <input
            type="text"
            placeholder="Search coin..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-panel-soft border border-line rounded-xl px-3 py-1.5 text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Refresh & Live State */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchData}
            title="Refresh Market Data"
            className="p-1.5 rounded-lg bg-panel-soft hover:bg-panel text-muted hover:text-text border border-line cursor-pointer transition-colors"
          >
            🔄
          </button>
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-muted">
            <span className="w-2 h-2 rounded-full bg-gain animate-pulse" />
            {filteredTokens.length} coins
          </span>
        </div>
      </div>

      {/* Main Canvas Simulation Viewport */}
      <div
        ref={containerRef}
        className="relative w-full h-[650px] sm:h-[720px] bg-panel-soft/40 border border-line rounded-3xl overflow-hidden shadow-inner flex items-center justify-center select-none"
      >
        {loading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs gap-3">
            <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-mono text-text">Loading live token physics...</p>
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

        {/* Subtle Bottom Floating Hint */}
        <div className="absolute bottom-3 left-4 pointer-events-none text-[11px] font-medium text-muted/70 bg-panel/70 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-line/40">
          💡 Click any bubble to inspect · Drag and toss bubbles with mouse
        </div>
      </div>

      {/* Detailed Token Drawer / Inspector Modal */}
      {selectedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-panel border border-line rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center font-extrabold text-xl shadow-md ${
                    selectedToken.change24h >= 0
                      ? "bg-gain/20 text-gain border border-gain/30"
                      : "bg-loss/20 text-loss border border-loss/30"
                  }`}
                >
                  {selectedToken.base.slice(0, 3)}
                </div>
                <div>
                  <h3 className="text-xl font-black tracking-tight text-text">
                    {selectedToken.symbol}
                  </h3>
                  <p className="text-xs text-muted">
                    {selectedToken.isMajor ? "Major Coin" : "Emerging / Non-Major Token"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedToken(null)}
                className="p-2 text-muted hover:text-text rounded-xl hover:bg-panel-soft cursor-pointer text-sm"
              >
                ✕
              </button>
            </div>

            {/* Price & Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-panel-soft/60 border border-line rounded-2xl p-3.5">
                <p className="text-[11px] text-muted font-medium uppercase tracking-wider">
                  Live Price
                </p>
                <p className="text-lg font-mono font-black text-text mt-0.5">
                  ${selectedToken.price < 0.01 ? selectedToken.price.toFixed(6) : selectedToken.price.toFixed(4)}
                </p>
              </div>

              <div className="bg-panel-soft/60 border border-line rounded-2xl p-3.5">
                <p className="text-[11px] text-muted font-medium uppercase tracking-wider">
                  24h Volume
                </p>
                <p className="text-lg font-mono font-black text-accent mt-0.5">
                  ${(selectedToken.volume24h / 1e6).toFixed(2)}M
                </p>
              </div>

              <div className="bg-panel-soft/60 border border-line rounded-2xl p-3">
                <p className="text-[10px] text-muted uppercase">1h Change</p>
                <p
                  className={`text-sm font-mono font-bold mt-0.5 ${
                    selectedToken.change1h >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {selectedToken.change1h >= 0 ? "+" : ""}
                  {selectedToken.change1h}%
                </p>
              </div>

              <div className="bg-panel-soft/60 border border-line rounded-2xl p-3">
                <p className="text-[10px] text-muted uppercase">24h Change</p>
                <p
                  className={`text-sm font-mono font-bold mt-0.5 ${
                    selectedToken.change24h >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {selectedToken.change24h >= 0 ? "+" : ""}
                  {selectedToken.change24h}%
                </p>
              </div>

              <div className="bg-panel-soft/60 border border-line rounded-2xl p-3">
                <p className="text-[10px] text-muted uppercase">7d Momentum</p>
                <p
                  className={`text-sm font-mono font-bold mt-0.5 ${
                    selectedToken.change7d >= 0 ? "text-gain" : "text-loss"
                  }`}
                >
                  {selectedToken.change7d >= 0 ? "+" : ""}
                  {selectedToken.change7d}%
                </p>
              </div>

              <div className="bg-panel-soft/60 border border-line rounded-2xl p-3">
                <p className="text-[10px] text-muted uppercase">24h High / Low</p>
                <p className="text-xs font-mono text-muted mt-0.5">
                  ${selectedToken.high24h.toFixed(3)} / ${selectedToken.low24h.toFixed(3)}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleAddToWatchlist}
                disabled={addingToWatchlist || watchlistSuccess}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  watchlistSuccess
                    ? "bg-gain text-white"
                    : "bg-accent hover:bg-accent/90 text-accent-text shadow-md shadow-accent/20"
                }`}
              >
                <span>🪙</span>
                <span>
                  {watchlistSuccess
                    ? "✓ Added to Active Watchlist!"
                    : addingToWatchlist
                    ? "Adding to Watchlist..."
                    : "1-Click Add to Watchlist"}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2">
                <Link
                  href={`/admin/bubblemaps?token=${selectedToken.base}`}
                  className="py-2.5 rounded-xl font-semibold text-xs bg-panel-soft hover:bg-panel border border-line text-text flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>🕸️</span>
                  <span>Inspect BubbleMap</span>
                </Link>

                <Link
                  href={`/chart?symbol=${selectedToken.symbol}`}
                  className="py-2.5 rounded-xl font-semibold text-xs bg-panel-soft hover:bg-panel border border-line text-text flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>📈</span>
                  <span>View Chart</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
