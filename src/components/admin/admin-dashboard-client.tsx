"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fmtPx } from "@/lib/format";
import type { AnnouncementData } from "@/app/api/admin/announcement/route";

interface Props {
  currentUserId: string;
}

interface MetricsData {
  users: { total: number };
  trades: { total: number; closed: number; open: number; winRate: number; totalPnl: number };
  watchlist: { total: number };
  alerts: { last24h: number };
  storage: { googleDriveActive: boolean; googleDriveEmail: string | null; backend: string };
  mexc: { status: string; latencyMs: number };
}

interface UserItem {
  id: string;
  username: string;
  displayName: string;
  updatedAt: string;
  isAdmin: boolean;
  tradesCount: number;
  watchlistCount: number;
  googleDriveConnected: boolean;
}

type TabType = "overview" | "users" | "webhooks" | "storage" | "announcements";

export function AdminDashboardClient({ currentUserId }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [users, setUsers] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Webhook Simulator State
  const [testSymbol, setTestSymbol] = useState("BTC_USDT");
  const [testAction, setTestAction] = useState("trigger");
  const [testPrice, setTestPrice] = useState("68500");
  const [testSide, setTestSide] = useState<"long" | "short">("long");
  const [testTimeframe, setTestTimeframe] = useState("15m");
  const [simulatingWebhook, setSimulatingWebhook] = useState(false);
  const [simResult, setSimResult] = useState<any>(null);

  // Announcement Manager State
  const [announcement, setAnnouncement] = useState<AnnouncementData>({
    title: "System Update",
    message: "New MEXC futures pairs and high-speed charting engine are now live.",
    type: "announcement",
    link_url: "/watchlist",
    link_text: "Explore Pairs →",
    is_active: false,
  });
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);
  const [announcementSaved, setAnnouncementSaved] = useState(false);

  // Storage / Token State
  const [copiedToken, setCopiedToken] = useState(false);
  const [storageStatus, setStorageStatus] = useState<any>(null);

  // Pinging MEXC Latency
  const [isPingingMexc, setIsPingingMexc] = useState(false);

  // Load Initial Metrics & Data
  const loadMetrics = async () => {
    try {
      const res = await fetch("/api/admin/metrics");
      const data = await res.json();
      if (data.metrics) setMetrics(data.metrics);
    } catch (err) {
      console.error("Failed to load metrics:", err);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  const loadAnnouncement = async () => {
    try {
      const res = await fetch("/api/admin/announcement");
      const data = await res.json();
      if (data.announcement) setAnnouncement(data.announcement);
    } catch (err) {
      console.error("Failed to load announcement:", err);
    }
  };

  const loadStorageStatus = async () => {
    try {
      const res = await fetch("/api/auth/google-drive/status");
      const data = await res.json();
      setStorageStatus(data);
    } catch (err) {
      console.error("Failed to load storage status:", err);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadMetrics(), loadUsers(), loadAnnouncement(), loadStorageStatus()]).finally(() => {
      setLoading(false);
    });
  }, []);

  // Ping MEXC Live Latency
  const handlePingMexc = async () => {
    setIsPingingMexc(true);
    const start = performance.now();
    try {
      const res = await fetch("https://contract.mexc.com/api/v1/contract/ping", {
        signal: AbortSignal.timeout(4000),
      });
      const elapsed = Math.round(performance.now() - start);
      if (res.ok && metrics) {
        setMetrics({
          ...metrics,
          mexc: { status: "healthy", latencyMs: elapsed },
        });
      }
    } catch {
      if (metrics) {
        setMetrics({ ...metrics, mexc: { status: "degraded", latencyMs: -1 } });
      }
    } finally {
      setIsPingingMexc(false);
    }
  };

  // Run Webhook Simulation
  const handleRunWebhookSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSimulatingWebhook(true);
    setSimResult(null);

    try {
      const res = await fetch("/api/admin/test-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: testSymbol,
          action: testAction,
          price: testPrice,
          side: testSide,
          timeframe: testTimeframe,
        }),
      });
      const data = await res.json();
      setSimResult(data);
    } catch (err) {
      setSimResult({ error: (err as Error).message });
    } finally {
      setSimulatingWebhook(false);
    }
  };

  // Save Announcement
  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAnnouncement(true);
    setAnnouncementSaved(false);

    try {
      const res = await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(announcement),
      });
      if (res.ok) {
        setAnnouncementSaved(true);
        setTimeout(() => setAnnouncementSaved(false), 3000);
      }
    } catch (err) {
      console.error("Failed to save announcement:", err);
    } finally {
      setSavingAnnouncement(false);
    }
  };

  // Toggle Admin Role
  const handleToggleAdminRole = async (targetUserId: string, currentAdminStatus: boolean) => {
    if (targetUserId === currentUserId) {
      alert("You cannot remove your own admin role.");
      return;
    }

    const nextStatus = !currentAdminStatus;
    const confirmMsg = nextStatus
      ? "Grant full administrator privileges to this trader?"
      : "Revoke administrator privileges from this trader?";

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetUserId, setAdmin: nextStatus }),
      });

      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === targetUserId ? { ...u, isAdmin: nextStatus } : u))
        );
      } else {
        const d = await res.json();
        alert(d.error || "Failed to update role");
      }
    } catch (err) {
      alert("Network error updating admin role");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-5 rounded-2xl bg-panel border border-line shadow-xl">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center text-2xl shadow-inner font-bold">
            🛡️
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-extrabold text-text tracking-tight font-mono">
                Admin Command Center
              </h1>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/30 font-semibold">
                SUPERUSER
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              System telemetry, trader directory, TradingView webhook lab, and global cloud storage.
            </p>
          </div>
        </div>

        {/* Quick System Indicators */}
        <div className="flex items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-canvas border border-line flex items-center gap-2 text-xs font-mono">
            <span
              className={`w-2 h-2 rounded-full ${
                metrics?.mexc.status === "healthy" ? "bg-gain animate-pulse" : "bg-loss"
              }`}
            />
            <span className="text-muted">MEXC Futures:</span>
            <span className="text-text font-bold">
              {metrics?.mexc.latencyMs && metrics.mexc.latencyMs > 0
                ? `${metrics.mexc.latencyMs}ms`
                : "Active"}
            </span>
          </div>

          <Link
            href="/watchlist"
            className="btn-ghost px-3 py-1.5 text-xs rounded-xl border border-line"
          >
            ← Exit to App
          </Link>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1.5 border-b border-line pb-2 overflow-x-auto">
        {[
          { id: "overview", label: "System Pulse", icon: "📊" },
          { id: "users", label: `Traders (${users.length})`, icon: "👥" },
          { id: "webhooks", label: "Webhook Lab", icon: "⚡" },
          { id: "storage", label: "Cloud Storage Bucket", icon: "📁" },
          { id: "announcements", label: "Broadcast Banner", icon: "📢" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
              activeTab === tab.id
                ? "bg-accent text-white shadow-md shadow-accent/20"
                : "text-muted hover:text-text hover:bg-panel"
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW & TELEMETRY */}
      {activeTab === "overview" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Top Metric Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="bg-panel border border-line p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                Total Traders
              </span>
              <div className="text-2xl font-extrabold text-text font-mono mt-2">
                {metrics?.users.total ?? users.length}
              </div>
              <span className="text-[10px] text-gain mt-1 font-mono">100% active</span>
            </div>

            <div className="bg-panel border border-line p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                Total Trades
              </span>
              <div className="text-2xl font-extrabold text-text font-mono mt-2">
                {metrics?.trades.total ?? "—"}
              </div>
              <span className="text-[10px] text-muted mt-1 font-mono">
                {metrics?.trades.open ?? 0} open · {metrics?.trades.closed ?? 0} closed
              </span>
            </div>

            <div className="bg-panel border border-line p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                Win Rate
              </span>
              <div className="text-2xl font-extrabold text-gain font-mono mt-2">
                {metrics?.trades.winRate ?? 0}%
              </div>
              <span className="text-[10px] text-muted mt-1 font-mono">Platform average</span>
            </div>

            <div className="bg-panel border border-line p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                Total Net PnL
              </span>
              <div
                className={`text-2xl font-extrabold font-mono mt-2 ${
                  (metrics?.trades.totalPnl || 0) >= 0 ? "text-gain" : "text-loss"
                }`}
              >
                ${metrics?.trades.totalPnl ? fmtPx(metrics.trades.totalPnl) : "0.00"}
              </div>
              <span className="text-[10px] text-muted mt-1 font-mono">Closed positions</span>
            </div>

            <div className="bg-panel border border-line p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                Watchlist Tokens
              </span>
              <div className="text-2xl font-extrabold text-accent font-mono mt-2">
                {metrics?.watchlist.total ?? 0}
              </div>
              <span className="text-[10px] text-muted mt-1 font-mono">Monitored pairs</span>
            </div>

            <div className="bg-panel border border-line p-4 rounded-2xl flex flex-col justify-between">
              <span className="text-[11px] font-mono text-muted uppercase tracking-wider">
                24h Alerts Fired
              </span>
              <div className="text-2xl font-extrabold text-amber-400 font-mono mt-2">
                {metrics?.alerts.last24h ?? 0}
              </div>
              <span className="text-[10px] text-muted mt-1 font-mono">Trigger events</span>
            </div>
          </div>

          {/* Subsystems Health Card */}
          <div className="bg-panel border border-line p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-text uppercase tracking-wider font-mono">
                  Subsystem Health &amp; Ingestion Services
                </h3>
                <p className="text-xs text-muted">
                  Live verification of background workers, exchange endpoints, and cloud storage.
                </p>
              </div>

              <button
                type="button"
                onClick={handlePingMexc}
                disabled={isPingingMexc}
                className="px-3 py-1.5 text-xs font-mono font-semibold rounded-lg bg-canvas border border-line hover:border-accent text-text transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span>{isPingingMexc ? "⏳" : "⚡"}</span>
                <span>{isPingingMexc ? "Pinging..." : "Test MEXC Latency"}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gain/15 text-gain border border-gain/20 flex items-center justify-center text-sm font-bold">
                    ✓
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text">MEXC Futures Contract API</div>
                    <div className="text-[10px] text-muted font-mono">
                      Latency:{" "}
                      {metrics?.mexc.latencyMs && metrics.mexc.latencyMs > 0
                        ? `${metrics.mexc.latencyMs}ms`
                        : "Operational"}
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gain/15 text-gain border border-gain/20">
                  HEALTHY
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent border border-accent/20 flex items-center justify-center text-sm font-bold">
                    📁
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text">Site-Wide Google Drive Bucket</div>
                    <div className="text-[10px] text-muted font-mono">
                      {storageStatus?.siteWideActive
                        ? `${storageStatus.email || "Active"} · 0 KB Supabase`
                        : "Fallback: Supabase"}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                    storageStatus?.siteWideActive
                      ? "bg-gain/15 text-gain border border-gain/20"
                      : "bg-panel text-muted border border-line"
                  }`}
                >
                  {storageStatus?.siteWideActive ? "ACTIVE" : "INACTIVE"}
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-canvas border border-line flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-gain/15 text-gain border border-gain/20 flex items-center justify-center text-sm font-bold">
                    ⚡
                  </div>
                  <div>
                    <div className="text-xs font-bold text-text">TradingView Webhook Engine</div>
                    <div className="text-[10px] text-muted font-mono">
                      Endpoint: /api/webhooks/tradingview
                    </div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-gain/15 text-gain border border-gain/20">
                  READY
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRADERS & USER DIRECTORY */}
      {activeTab === "users" && (
        <div className="bg-panel border border-line rounded-2xl overflow-hidden shadow-xl space-y-4 p-5 animate-in fade-in duration-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text uppercase tracking-wider font-mono">
                Trader Directory ({users.length})
              </h3>
              <p className="text-xs text-muted">
                View registered users, track journal participation, and manage administrator access.
              </p>
            </div>

            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search trader username..."
                className="w-full px-3 py-1.5 rounded-xl bg-canvas border border-line text-xs text-text placeholder:text-muted focus:outline-none focus:border-accent font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-line text-muted font-mono uppercase text-[10px]">
                  <th className="py-2.5 px-3">Trader</th>
                  <th className="py-2.5 px-3">Role</th>
                  <th className="py-2.5 px-3">Trades</th>
                  <th className="py-2.5 px-3">Watchlist</th>
                  <th className="py-2.5 px-3">Last Active</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-panel-soft/40 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-accent/20 text-accent font-bold flex items-center justify-center text-xs">
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-bold text-text flex items-center gap-1.5">
                            <span>{u.displayName}</span>
                            <span className="text-[10px] text-muted font-mono">@{u.username}</span>
                          </div>
                          <div className="text-[10px] text-muted font-mono truncate max-w-xs">
                            {u.id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-3">
                      {u.isAdmin ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-accent/20 text-accent border border-accent/30 font-bold">
                          🛡️ Admin
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-canvas text-muted border border-line">
                          Trader
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-text">
                      {u.tradesCount}
                    </td>

                    <td className="py-3 px-3 font-mono font-bold text-text">
                      {u.watchlistCount}
                    </td>

                    <td className="py-3 px-3 text-muted font-mono text-[11px]">
                      {new Date(u.updatedAt).toLocaleDateString()}
                    </td>

                    <td className="py-3 px-3 text-right space-x-2">
                      <Link
                        href={`/${encodeURIComponent(u.username)}`}
                        target="_blank"
                        className="px-2.5 py-1 rounded-lg bg-canvas border border-line hover:border-accent text-accent transition-colors font-mono text-[11px]"
                      >
                        Public Profile ↗
                      </Link>

                      {u.id !== currentUserId && (
                        <button
                          type="button"
                          onClick={() => handleToggleAdminRole(u.id, u.isAdmin)}
                          className={`px-2.5 py-1 rounded-lg border transition-colors font-mono text-[11px] cursor-pointer ${
                            u.isAdmin
                              ? "border-loss/30 text-loss hover:bg-loss/10"
                              : "border-accent/30 text-accent hover:bg-accent/10"
                          }`}
                        >
                          {u.isAdmin ? "Revoke Admin" : "Make Admin"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TRADINGVIEW WEBHOOK LAB */}
      {activeTab === "webhooks" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          {/* Simulator Form */}
          <div className="bg-panel border border-line p-5 rounded-2xl shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-text uppercase tracking-wider font-mono">
                TradingView Webhook Test Simulator
              </h3>
              <p className="text-xs text-muted">
                Dispatch simulated TradingView webhook payloads to verify alerts, sound alarms, Discord, and Telegram integrations without needing TradingView open.
              </p>
            </div>

            <form onSubmit={handleRunWebhookSimulation} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Symbol (USDT Pair)</span>
                  <input
                    type="text"
                    value={testSymbol}
                    onChange={(e) => setTestSymbol(e.target.value.toUpperCase())}
                    placeholder="BTC_USDT"
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent"
                    required
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Trigger Price</span>
                  <input
                    type="number"
                    step="any"
                    value={testPrice}
                    onChange={(e) => setTestPrice(e.target.value)}
                    placeholder="68500"
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent"
                    required
                  />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Alert Action</span>
                  <select
                    value={testAction}
                    onChange={(e) => setTestAction(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="trigger">⚡ Trigger Level</option>
                    <option value="entry">🎯 Entry Price</option>
                    <option value="tp">🏁 Take Profit</option>
                    <option value="sl">🛑 Stop Loss</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Side / Direction</span>
                  <select
                    value={testSide}
                    onChange={(e) => setTestSide(e.target.value as "long" | "short")}
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="long">↗ LONG</option>
                    <option value="short">↘ SHORT</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Timeframe</span>
                  <select
                    value={testTimeframe}
                    onChange={(e) => setTestTimeframe(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="1m">1m</option>
                    <option value="5m">5m</option>
                    <option value="15m">15m</option>
                    <option value="1h">1h</option>
                    <option value="4h">4h</option>
                    <option value="1d">1d</option>
                  </select>
                </label>
              </div>

              <button
                type="submit"
                disabled={simulatingWebhook}
                className="w-full py-2.5 accent-btn text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <span>{simulatingWebhook ? "⏳" : "🚀"}</span>
                <span>{simulatingWebhook ? "Sending Simulated Webhook..." : "Dispatch Test Alert Webhook"}</span>
              </button>
            </form>
          </div>

          {/* Simulator Response Inspector */}
          <div className="bg-panel border border-line p-5 rounded-2xl shadow-xl flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-text uppercase tracking-wider font-mono">
                  Execution Telemetry &amp; Response
                </h4>
                {simResult && (
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono ${
                      simResult.success
                        ? "bg-gain/15 text-gain border border-gain/20"
                        : "bg-loss/15 text-loss border border-loss/20"
                    }`}
                  >
                    {simResult.statusCode || (simResult.success ? 200 : 400)} {simResult.success ? "OK" : "FAILED"} (
                    {simResult.elapsedMs || 0}ms)
                  </span>
                )}
              </div>

              <div className="rounded-xl bg-canvas border border-line p-3 font-mono text-xs overflow-auto max-h-72 text-text/90">
                {simResult ? (
                  <pre>{JSON.stringify(simResult, null, 2)}</pre>
                ) : (
                  <span className="text-muted text-xs">
                    Ready to test. Select parameters and click &quot;Dispatch Test Alert Webhook&quot; to inspect response headers, matched watchlist items, audio triggers, and notification deliveries.
                  </span>
                )}
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-canvas border border-line text-[11px] text-muted space-y-1">
              <span className="text-text font-bold">ℹ️ TradingView Production Format:</span>
              <p>
                In TradingView alerts, set webhook URL to:{" "}
                <code className="text-accent text-[10px]">https://mochex.com/api/webhooks/tradingview?key=YOUR_SECRET</code>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: CLOUD STORAGE HUB (GOOGLE DRIVE) */}
      {activeTab === "storage" && (
        <div className="bg-panel border border-line rounded-2xl p-6 shadow-xl space-y-6 animate-in fade-in duration-200">
          <div>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider font-mono">
              Centralized Google Drive Cloud Storage Bucket
            </h3>
            <p className="text-xs text-muted">
              Manage the single, site-wide Google Drive bucket where all traders&apos; screenshots are stored with 0 bytes consumed on Supabase.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-canvas border border-line flex flex-col justify-between">
              <span className="text-xs font-mono text-muted uppercase">Bucket Health</span>
              <div className="text-lg font-bold font-mono text-gain mt-2 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-gain animate-pulse" />
                {storageStatus?.siteWideActive ? "CONNECTED" : "INACTIVE"}
              </div>
              <span className="text-[11px] text-muted mt-1">
                {storageStatus?.siteWideActive
                  ? `${storageStatus.email || "Active"} · Free 15GB`
                  : "Falls back to Supabase"}
              </span>
            </div>

            <div className="p-4 rounded-xl bg-canvas border border-line flex flex-col justify-between">
              <span className="text-xs font-mono text-muted uppercase">Google Drive Folder</span>
              <div className="text-base font-bold font-mono text-text mt-2 truncate">
                Mochex Trade Screenshots
              </div>
              <a
                href="https://drive.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-accent hover:underline mt-1 flex items-center gap-1 font-mono"
              >
                <span>Open Google Drive</span>
                <span>↗</span>
              </a>
            </div>

            <div className="p-4 rounded-xl bg-canvas border border-line flex flex-col justify-between">
              <span className="text-xs font-mono text-muted uppercase">Supabase Quota Saved</span>
              <div className="text-lg font-bold font-mono text-gain mt-2">
                100% (0 Bytes on Supabase)
              </div>
              <span className="text-[11px] text-muted mt-1">Served via Google CDN</span>
            </div>
          </div>

          {/* Vercel / Production Deployment Helper */}
          {storageStatus?.refreshToken && (
            <div className="rounded-xl border border-accent/30 bg-accent/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-text">
                  <span>🚀 Production Vercel Token</span>
                  <span className="text-[10px] font-mono text-accent bg-accent/15 px-2 py-0.5 rounded border border-accent/20">
                    Ready
                  </span>
                </div>
                <p className="text-xs text-muted">
                  Set this in your Vercel Environment Variables so <strong>mochex.com</strong> uploads to the same Google Drive account:
                </p>
                <code className="text-xs font-mono text-accent bg-canvas/80 px-2 py-1 rounded border border-line select-all break-all">
                  GOOGLE_DRIVE_REFRESH_TOKEN={storageStatus.refreshToken.slice(0, 16)}...{storageStatus.refreshToken.slice(-6)}
                </code>
              </div>

              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`GOOGLE_DRIVE_REFRESH_TOKEN=${storageStatus.refreshToken}`);
                  setCopiedToken(true);
                  setTimeout(() => setCopiedToken(false), 2500);
                }}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-accent text-white hover:bg-accent/90 transition-colors whitespace-nowrap self-end sm:self-center cursor-pointer shadow-xs"
              >
                {copiedToken ? "Copied ✓" : "Copy Token for Vercel"}
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="accent-btn px-4 py-2 text-xs font-semibold rounded-lg"
            >
              Configure in Settings →
            </Link>
          </div>
        </div>
      )}

      {/* TAB 5: SITE-WIDE BROADCAST BANNER */}
      {activeTab === "announcements" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-200">
          {/* Announcement Editor Form */}
          <div className="bg-panel border border-line p-5 rounded-2xl shadow-xl space-y-4">
            <div>
              <h3 className="text-sm font-bold text-text uppercase tracking-wider font-mono">
                Site-Wide Broadcast Announcement
              </h3>
              <p className="text-xs text-muted">
                Publish a global announcement banner displayed across the top of the app for all logged-in traders.
              </p>
            </div>

            <form onSubmit={handleSaveAnnouncement} className="space-y-3.5">
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>Banner Title</span>
                <input
                  type="text"
                  value={announcement.title}
                  onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}
                  placeholder="e.g. Scheduled Maintenance"
                  className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent"
                  required
                />
              </label>

              <label className="flex flex-col gap-1 text-xs text-muted">
                <span>Message Body</span>
                <textarea
                  rows={3}
                  value={announcement.message}
                  onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
                  placeholder="Explain details of the announcement..."
                  className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs text-text focus:outline-none focus:border-accent"
                  required
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Banner Theme Style</span>
                  <select
                    value={announcement.type}
                    onChange={(e) =>
                      setAnnouncement({
                        ...announcement,
                        type: e.target.value as AnnouncementData["type"],
                      })
                    }
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent cursor-pointer"
                  >
                    <option value="announcement">📢 Announcement (Purple Gradient)</option>
                    <option value="info">ℹ️ Information (Blue)</option>
                    <option value="warning">⚠️ Warning (Amber)</option>
                    <option value="success">✓ Success (Emerald)</option>
                  </select>
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Broadcast Status</span>
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="bannerActive"
                      checked={announcement.is_active}
                      onChange={(e) =>
                        setAnnouncement({ ...announcement, is_active: e.target.checked })
                      }
                      className="w-4 h-4 rounded text-accent cursor-pointer"
                    />
                    <label htmlFor="bannerActive" className="text-xs font-bold text-text cursor-pointer">
                      {announcement.is_active ? "🟢 Active & Visible" : "⚪ Draft / Inactive"}
                    </label>
                  </div>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Call to Action Link (Optional)</span>
                  <input
                    type="text"
                    value={announcement.link_url || ""}
                    onChange={(e) =>
                      setAnnouncement({ ...announcement, link_url: e.target.value })
                    }
                    placeholder="/watchlist or https://..."
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent"
                  />
                </label>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Link Text</span>
                  <input
                    type="text"
                    value={announcement.link_text || ""}
                    onChange={(e) =>
                      setAnnouncement({ ...announcement, link_text: e.target.value })
                    }
                    placeholder="Learn More →"
                    className="px-3 py-2 rounded-xl bg-canvas border border-line text-xs font-mono text-text focus:outline-none focus:border-accent"
                  />
                </label>
              </div>

              <button
                type="submit"
                disabled={savingAnnouncement}
                className="w-full py-2.5 accent-btn text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
              >
                <span>{savingAnnouncement ? "⏳" : "💾"}</span>
                <span>{announcementSaved ? "Announcement Saved ✓" : "Save & Publish Announcement"}</span>
              </button>
            </form>
          </div>

          {/* Live Preview Card */}
          <div className="bg-panel border border-line p-5 rounded-2xl shadow-xl space-y-4">
            <div>
              <h4 className="text-xs font-bold text-text uppercase tracking-wider font-mono">
                Live Banner Preview
              </h4>
              <p className="text-xs text-muted">
                How this announcement will appear to traders at the top of the page.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-canvas border border-line">
              <div
                className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-3 ${
                  {
                    info: "bg-blue-500/10 border-blue-500/25 text-blue-400",
                    warning: "bg-amber-500/10 border-amber-500/25 text-amber-400",
                    success: "bg-gain/10 border-gain/25 text-gain",
                    announcement:
                      "bg-gradient-to-r from-accent/20 via-purple-600/15 to-accent/20 border-accent/30 text-accent",
                  }[announcement.type]
                }`}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span>
                    {
                      {
                        info: "ℹ️",
                        warning: "⚠️",
                        success: "✓",
                        announcement: "📢",
                      }[announcement.type]
                    }
                  </span>
                  <span className="font-bold text-text">{announcement.title}:</span>
                  <span className="text-text/90">{announcement.message}</span>
                  {announcement.link_url && (
                    <span className="underline font-semibold ml-1 cursor-pointer">
                      {announcement.link_text || "Learn More →"}
                    </span>
                  )}
                </div>

                <span className="text-muted text-xs cursor-pointer">✕</span>
              </div>
            </div>

            <div className="text-[11px] text-muted space-y-1">
              <p>• Traders can dismiss the banner for their current browsing session.</p>
              <p>• Setting status to &quot;Draft / Inactive&quot; immediately hides it for everyone.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
