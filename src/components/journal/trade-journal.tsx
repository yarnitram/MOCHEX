"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account, ArchivedJournalTrade, RiskSettings, Tag, TradeWithExtras } from "@/lib/types";
import { TradeTable } from "./trade-table";
import { TradeFormModal } from "./trade-form-modal";
import { TradeDetailModal } from "./trade-detail-modal";
import { ArchivedJournalTab } from "./archived-journal-tab";
import { ChartModal } from "@/components/charts/chart-modal";
import { ExportBar } from "./export-bar";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { PnlCalendar } from "@/components/analytics/pnl-calendar";
import { EquityCurveChart } from "@/components/analytics/equity-curve-chart";
import type { TradeAlert } from "@/lib/types";

interface Props {
  accounts: Account[];
  activeAccount: Account | null;
  initialTrades: TradeWithExtras[];
  initialTags: Tag[];
  riskSettings: RiskSettings | null;
}

const ARCHIVE_CACHE_KEY = "mochex_archived_journal_cache";

export function TradeJournal({
  activeAccount,
  initialTrades,
  initialTags,
  riskSettings,
}: Props) {
  const [activeTab, setActiveTab] = useState<"active" | "archive">("active");
  const [trades, setTrades] = useState<TradeWithExtras[]>(initialTrades);
  const [archivedTrades, setArchivedTrades] = useState<ArchivedJournalTrade[]>([]);
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [selected, setSelected] = useState<TradeWithExtras | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TradeWithExtras | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [chartTrade, setChartTrade] = useState<TradeWithExtras | null>(null);

  // Initialize and load archived journal trades from local cache and remote API
  useEffect(() => {
    // 1. Read cached archives immediately
    try {
      const cached = localStorage.getItem(ARCHIVE_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setArchivedTrades(parsed);
        }
      }
    } catch {}

    // 2. Fetch remote archives if available
    async function fetchArchived() {
      try {
        const query = activeAccount ? `?account_id=${activeAccount.id}` : "";
        const res = await fetch(`/api/archived-journal${query}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.archivedTrades) && data.archivedTrades.length > 0) {
            setArchivedTrades((prev) => {
              // Merge remote and local cached items by id
              const map = new Map<string, ArchivedJournalTrade>();
              prev.forEach((item) => map.set(item.id, item));
              data.archivedTrades.forEach((item: ArchivedJournalTrade) => map.set(item.id, item));
              const merged = Array.from(map.values()).sort(
                (a, b) => new Date(b.archived_at).getTime() - new Date(a.archived_at).getTime()
              );
              try {
                localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(merged));
              } catch {}
              return merged;
            });
          }
        }
      } catch (err) {
        console.warn("Could not fetch remote archived journal trades:", err);
      }
    }
    fetchArchived();
  }, [activeAccount]);

  const refreshTags = useCallback(async () => {
    const res = await fetch("/api/tags");
    if (res.ok) {
      const data = await res.json();
      setTags(data.tags ?? []);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!activeAccount) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trades?account=${activeAccount.id}`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [activeAccount]);

  const mutation = useCallback(
    async (url: string, method: string, body?: unknown): Promise<boolean> => {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Request failed");
      }
      return true;
    },
    []
  );

  const handleSave = useCallback(
    async (values: unknown, id?: string) => {
      const body = { account_id: activeAccount!.id, ...(values as object) };
      if (id) {
        await mutation(`/api/trades/${id}`, "PUT", body);
      } else {
        await mutation("/api/trades", "POST", body);
      }
      await Promise.all([refresh(), refreshTags()]);
      setFormOpen(false);
      setEditing(null);
    },
    [activeAccount, mutation, refresh, refreshTags]
  );

  // Soft-delete to archive
  const handleSoftDelete = useCallback(
    async (trade: TradeWithExtras) => {
      let archivedItem: ArchivedJournalTrade | null = null;
      try {
        const res = await fetch("/api/archived-journal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            original_trade_id: trade.id,
            account_id: trade.account_id,
            symbol: trade.symbol,
            direction: trade.direction,
            entry_price: trade.entry_price,
            exit_price: trade.exit_price,
            size: trade.size,
            stop_price: trade.stop_price,
            fees: trade.fees,
            entry_time: trade.entry_time,
            exit_time: trade.exit_time,
            status: trade.status,
            pnl_dollars: trade.pnl_dollars,
            pnl_pct: trade.pnl_pct,
            notes: trade.notes?.pre_trade_thesis || trade.notes?.post_trade_review || null,
            discipline_score: trade.notes?.discipline_score ?? null,
            tags: trade.tags?.map((t) => t.name) || [],
            archived_reason: "user_soft_delete",
          }),
        });

        if (res.ok) {
          const data = await res.json();
          archivedItem = data.archivedTrade;
        }
      } catch (err) {
        console.warn("Remote archive POST failed, using local fallback:", err);
      }

      if (!archivedItem) {
        archivedItem = {
          id: `local-archived-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          original_trade_id: trade.id,
          account_id: trade.account_id,
          symbol: trade.symbol,
          direction: trade.direction,
          entry_price: trade.entry_price,
          exit_price: trade.exit_price ?? null,
          size: trade.size,
          stop_price: trade.stop_price ?? null,
          fees: trade.fees ?? 0,
          entry_time: trade.entry_time ?? new Date().toISOString(),
          exit_time: trade.exit_time ?? null,
          status: trade.status,
          pnl_dollars: trade.pnl_dollars ?? null,
          pnl_pct: trade.pnl_pct ?? null,
          notes: trade.notes ?? null,
          discipline_score: trade.notes?.discipline_score ?? null,
          tags: trade.tags ?? [],
          archived_at: new Date().toISOString(),
          archived_reason: "user_soft_delete",
          created_at: trade.created_at,
        };
      }

      // Delete from active trades in DB
      await fetch(`/api/trades/${trade.id}`, { method: "DELETE" }).catch(() => {});

      // Update active trades
      setTrades((prev) => prev.filter((t) => t.id !== trade.id));
      setSelected((curr) => (curr?.id === trade.id ? null : curr));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(trade.id);
        return next;
      });

      // Update archived state and localStorage cache
      setArchivedTrades((prev) => {
        const next = [
          archivedItem!,
          ...prev.filter(
            (x) =>
              (x.original_trade_id ? x.original_trade_id !== trade.id : true) &&
              x.id !== archivedItem!.id
          ),
        ];
        try {
          localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    },
    []
  );

  // Restore trade from archive back to active ledger
  const handleRestore = useCallback(
    async (archived: ArchivedJournalTrade) => {
      try {
        const res = await fetch(`/api/archived-journal/${archived.id}/restore`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archivedTrade: archived }),
        });

        if (!res.ok) {
          // Fallback: insert directly via /api/trades
          const preThesis =
            typeof archived.notes === "object" && archived.notes
              ? archived.notes.pre_trade_thesis ?? undefined
              : typeof archived.notes === "string"
              ? archived.notes
              : undefined;
          const postReview =
            typeof archived.notes === "object" && archived.notes
              ? archived.notes.post_trade_review ?? undefined
              : undefined;
          const disciplineScore =
            archived.discipline_score ??
            (typeof archived.notes === "object" && archived.notes
              ? archived.notes.discipline_score
              : null);
          const tagNames = Array.isArray(archived.tags)
            ? archived.tags.map((t) => (typeof t === "string" ? t : t.name))
            : [];

          await fetch("/api/trades", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              account_id: archived.account_id || activeAccount?.id,
              symbol: archived.symbol,
              direction: archived.direction,
              entry_price: archived.entry_price,
              exit_price: archived.exit_price,
              size: archived.size,
              stop_price: archived.stop_price,
              fees: archived.fees,
              entry_time: archived.entry_time,
              exit_time: archived.exit_time,
              status: archived.status,
              pre_trade_thesis: preThesis,
              post_trade_review: postReview,
              discipline_score: disciplineScore,
              tags: tagNames,
            }),
          }).catch(() => {});

          await fetch(`/api/archived-journal/${archived.id}`, { method: "DELETE" }).catch(() => {});
        }

        // Refresh active trades list
        await refresh();

        // Remove from archived state and localStorage
        setArchivedTrades((prev) => {
          const next = prev.filter(
            (x) =>
              x.id !== archived.id &&
              (!archived.original_trade_id || x.original_trade_id !== archived.original_trade_id)
          );
          try {
            localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      } catch (err) {
        console.error("Failed to restore trade:", err);
        alert("Failed to restore trade. Please try again.");
      }
    },
    [activeAccount, refresh]
  );

  // Permanently delete trade from archive
  const handleDeletePermanent = useCallback(
    async (archived: ArchivedJournalTrade) => {
      try {
        await fetch(`/api/archived-journal/${archived.id}`, { method: "DELETE" }).catch(() => {});
        setArchivedTrades((prev) => {
          const next = prev.filter((x) => x.id !== archived.id);
          try {
            localStorage.setItem(ARCHIVE_CACHE_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      } catch (err) {
        console.error("Failed to delete trade permanently:", err);
      }
    },
    []
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const trade = trades.find((t) => t.id === id);
      if (trade) {
        await handleSoftDelete(trade);
      } else {
        await mutation(`/api/trades/${id}`, "DELETE");
        await refresh();
      }
      setSelected(null);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    },
    [trades, handleSoftDelete, mutation, refresh]
  );

  const handleBulkDelete = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const tradesToArchive = trades.filter((t) => selectedIds.has(t.id));
    for (const t of tradesToArchive) {
      await handleSoftDelete(t);
    }
    setSelectedIds(new Set());
  }, [selectedIds, trades, handleSoftDelete]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((ids: string[], value: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (value) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const openAdd = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((t: TradeWithExtras) => {
    setSelected(null);
    setEditing(t);
    setFormOpen(true);
  }, []);

  const uniqueSymbols = useMemo(
    () => Array.from(new Set(trades.map((t) => t.symbol))).sort(),
    [trades]
  );

  const closedTradeAlerts = useMemo(() => {
    return trades
      .filter((t) => t.status === "closed" || t.exit_price != null)
      .map((t) => ({
        id: t.id,
        user_id: "",
        symbol: t.symbol,
        trigger_direction: (t.direction === "long" ? "below" : "above") as "above" | "below",
        trigger_price: t.entry_price,
        fired_price: t.entry_price,
        entry_price: t.entry_price,
        stop_loss: t.stop_price ?? null,
        take_profit: null,
        margin_usd: t.size ?? 1,
        leverage: 1,
        order_type: "market" as const,
        status: "closed" as const,
        closed_reason: "manual_close" as const,
        exit_price: t.exit_price,
        closed_at: t.exit_time || t.created_at,
        realized_pnl_usd: t.pnl_dollars ?? null,
        realized_pnl_pct: t.pnl_pct ?? null,
        fired_at: t.entry_time || t.created_at,
      })) as TradeAlert[];
  }, [trades]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-2">Trade review</p>
          <h1 className="text-2xl font-semibold mb-1">Journal</h1>
          <p className="text-sm text-muted">
            {trades.length} active trade{trades.length === 1 ? "" : "s"} ·{" "}
            {archivedTrades.length} archived ·{" "}
            {activeAccount?.name ?? "No account"}
            {loading ? " · refreshing…" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="accent-btn px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
        >
          <span>+</span>
          <span>Add Trade</span>
        </button>
      </div>

      <section aria-labelledby="performance-heading">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="eyebrow">Performance snapshot</p>
            <h2 id="performance-heading" className="text-lg font-semibold">How the book is behaving</h2>
          </div>
          <span className="text-xs text-muted">{loading ? "Refreshing data…" : "Updated from journal"}</span>
        </div>
        <AnalyticsDashboard
          trades={trades}
          riskSettings={riskSettings}
          accountName={activeAccount?.name ?? "No account"}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <PnlCalendar closedTrades={closedTradeAlerts} />
          <EquityCurveChart closedTrades={closedTradeAlerts} />
        </div>
      </section>

      <section aria-labelledby="ledger-heading">
        {/* Ledger Navigation Tabs */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("active")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === "active"
                  ? "bg-accent/15 text-accent border border-accent/30 shadow-xs"
                  : "text-muted hover:text-text hover:bg-panel-soft border border-line/60"
              }`}
            >
              <span>Active Trades</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-canvas/80 text-text font-mono">
                {trades.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("archive")}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                activeTab === "archive"
                  ? "bg-accent/15 text-accent border border-accent/30 shadow-xs"
                  : "text-muted hover:text-text hover:bg-panel-soft border border-line/60"
              }`}
            >
              <span>Archive</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  archivedTrades.length > 0 ? "bg-amber-400/20 text-amber-300" : "bg-canvas/80 text-muted"
                }`}
              >
                {archivedTrades.length}
              </span>
            </button>
          </div>

          {activeTab === "active" && (
            <ExportBar
              trades={trades}
              selectedIds={selectedIds}
              symbolOptions={uniqueSymbols}
              onDeleteSelected={handleBulkDelete}
            />
          )}
        </div>

        {activeTab === "active" ? (
          <TradeTable
            trades={trades}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onToggleAll={toggleAll}
            onRowClick={setSelected}
            onChart={(trade) => setChartTrade(trade)}
            onView={(trade) => setSelected(trade)}
            onEdit={openEdit}
            onDelete={handleSoftDelete}
          />
        ) : (
          <ArchivedJournalTab
            archivedTrades={archivedTrades}
            onRestore={handleRestore}
            onDeletePermanent={handleDeletePermanent}
          />
        )}
      </section>

      {formOpen && (
        <TradeFormModal
          trade={editing}
          tags={tags}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
        />
      )}

      {selected && (
        <TradeDetailModal
          trade={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onEdit={openEdit}
          onChart={(t) => setChartTrade(t)}
        />
      )}

      {chartTrade && (
        <ChartModal
          isOpen={!!chartTrade}
          onClose={() => setChartTrade(null)}
          symbol={chartTrade.symbol}
          setup={{
            symbol: chartTrade.symbol,
            side: chartTrade.direction === "long" ? "LONG" : "SHORT",
            entry_price: chartTrade.entry_price,
            stop_loss: chartTrade.stop_price,
            take_profit: chartTrade.exit_price,
            order_type: "market",
          }}
        />
      )}
    </div>
  );
}