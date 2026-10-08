"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { deriveTradeSide, type WatchlistItem, type TriggeredWatchlistItem, type ArchivedWatchlistItem } from "@/lib/types";
import { cleanSymbol, fmtPx, fmtPct, fmtPlanPx } from "@/lib/format";
import { useMexcMarketData } from "@/hooks/use-mexc-market-data";
import { playTriggerSound } from "@/lib/audio";
import { CoinDetailModal } from "./coin-detail-modal";
import { AddTokenModal, type AddSetupPayload } from "./add-token-modal";
import { ModalShell } from "@/components/ui/modal-shell";
import { WatchlistToolbar } from "./watchlist-toolbar";
import { WatchlistTable } from "./watchlist-table";
import { WatchlistTriggeredTab } from "./watchlist-triggered-tab";
import { WatchlistArchiveTab } from "./watchlist-archive-tab";
import { exportWatchlistToCsv } from "@/lib/export-watchlist";
import type { ColKey, SortConfig, Ticker } from "./watchlist-types";
import {
  DEFAULT_COLS,
  DEFAULT_SORT,
  loadCols,
  loadSort,
  saveCols,
  saveSort,
} from "./watchlist-types";

// ---- Component props ----

interface Props {
  initialItems: WatchlistItem[];
  initialTriggeredItems?: TriggeredWatchlistItem[];
  initialArchivedItems?: ArchivedWatchlistItem[];
  initialTriggeredTableMissing?: boolean;
  refreshIntervalSec?: number;
}

// ---- Main component ----

export function WatchlistClient({
  initialItems,
  initialTriggeredItems = [],
  initialArchivedItems = [],
  initialTriggeredTableMissing = false,
  refreshIntervalSec = 10,
}: Props) {
  const [items, setItems] = useState<WatchlistItem[]>(initialItems);
  const [triggeredItems, setTriggeredItems] = useState<TriggeredWatchlistItem[]>(
    initialTriggeredItems
  );
  const [archivedItems, setArchivedItems] = useState<ArchivedWatchlistItem[]>(
    initialArchivedItems
  );
  const [isTriggeredTableMissing, setIsTriggeredTableMissing] = useState<boolean>(
    initialTriggeredTableMissing
  );
  const [activeTab, setActiveTab] = useState<"active" | "triggered" | "archive">(
    "active"
  );

  // ---- Add Token Modal state ----
  const [addModalOpen, setAddModalOpen] = useState(false);

  // ---- Sort ----
  // NOTE: always initialized to the default so the server and client render
  // rows in the same order. The saved preference is applied AFTER hydration.
  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);

  const totalActiveItems = items.length;

  // ---- Filter (client-side coin search within saved items) ----
  const [filter, setFilter] = useState("");

  // ---- Column visibility ----
  // NOTE: always initialized to DEFAULT_COLS (all visible) for the same
  // hydration-safety reason as sort above.
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);

  // ---- Live data + icons ----
  // ---- UI state ----
  const [note, setNote] = useState<string | null>(null);
  const [details, setDetails] = useState<{
    symbol: string;
    item: WatchlistItem | TriggeredWatchlistItem | ArchivedWatchlistItem | null;
    isReadOnly?: boolean;
  } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  // ---- Pagination ----
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);

  // ---- Multi-selection state ----
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  function handleTabChange(tab: "active" | "triggered" | "archive") {
    setActiveTab(tab);
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }

  // ---- Derived data ----

  const symbolsToTrack = useMemo(
    () =>
      Array.from(
        new Set([
          ...items.map((i) => i.symbol.toUpperCase()),
          ...triggeredItems.map((i) => i.symbol.toUpperCase()),
          ...archivedItems.map((i) => i.symbol.toUpperCase()),
        ])
      ),
    [items, triggeredItems, archivedItems]
  );

  // ---- Unified MEXC Market Data Hook ----
  const mexcMarketData = useMexcMarketData({
    symbols: symbolsToTrack,
    refreshIntervalSec,
    enableDetails: true,
  });

  const live = useMemo(() => {
    const map: Record<string, Ticker> = {};
    for (const t of mexcMarketData.tickers) {
      map[t.symbol.toUpperCase()] = t as Ticker;
    }
    return map;
  }, [mexcMarketData.tickers]);

  const icons = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [sym, d] of Object.entries(mexcMarketData.details)) {
      if (d?.baseCoinIconUrl) {
        map[sym] = d.baseCoinIconUrl;
      }
    }
    return map;
  }, [mexcMarketData.details]);

  const existingSymbols = useMemo(
    () => new Set(items.map((i) => i.symbol.toUpperCase())),
    [items]
  );

  const sortedItems = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const aSym = a.symbol.toUpperCase();
      const bSym = b.symbol.toUpperCase();
      const aT = live[aSym];
      const bT = live[bSym];
      switch (sort.field) {
        case "status": {
          // Triggered → Ongoing (trigger set, not fired) → None.
          const rank = (x: WatchlistItem) =>
            x.alert_fired ? 0 : x.trigger_price != null ? 1 : 2;
          const byStatus = rank(a) - rank(b);
          return byStatus !== 0 ? byStatus : aSym.localeCompare(bSym);
        }
        case "coin":
          return aSym.localeCompare(bSym) * dir;
        case "change":
          return ((aT?.riseFallRate ?? 0) - (bT?.riseFallRate ?? 0)) * dir;
        case "volume":
          return ((aT?.amount24 ?? 0) - (bT?.amount24 ?? 0)) * dir;
        case "price":
          return ((aT?.lastPrice ?? 0) - (bT?.lastPrice ?? 0)) * dir;
        case "trigger": {
          const aV = a.trigger_price ?? Number.NEGATIVE_INFINITY;
          const bV = b.trigger_price ?? Number.NEGATIVE_INFINITY;
          return (aV - bV) * dir;
        }
        default:
          return 0;
      }
    });
  }, [items, sort, live]);

  const filteredItems = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return sortedItems;
    return sortedItems.filter((i) => i.symbol.toUpperCase().includes(q));
  }, [sortedItems, filter]);

  const total = filteredItems.length;
  const hasPaging = Number.isFinite(pageSize);
  const pageCount = hasPaging ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = hasPaging ? Math.min(page, pageCount - 1) : 0;

  const pageItems = useMemo(() => {
    if (!hasPaging) return filteredItems;
    return filteredItems.slice(safePage * pageSize, (safePage + 1) * pageSize);
  }, [filteredItems, pageSize, safePage, hasPaging]);

  // ---- Effects: hydrate preferences after mounting ----

  // Apply the saved column visibility ONLY after hydration to avoid a
  // server/client mismatch when the saved value differs from the default.
  useEffect(() => {
    const t = setTimeout(() => setCols(loadCols()), 0);
    return () => clearTimeout(t);
  }, []);

  // Apply the saved sort AFTER hydration for the same reason.
  useEffect(() => {
    const t = setTimeout(() => setSort(loadSort()), 0);
    return () => clearTimeout(t);
  }, []);

  // Hydrate local triggered cache (for resilience if remote table is missing)
  useEffect(() => {
    try {
      const cached = localStorage.getItem("mochex_triggered_items_cache");
      if (cached) {
        const parsed = JSON.parse(cached) as TriggeredWatchlistItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTriggeredItems((prev) => {
            const existingIds = new Set(prev.map((x) => x.id));
            const toAdd = parsed.filter((x) => !existingIds.has(x.id));
            return [...toAdd, ...prev];
          });
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Sync triggered items to local cache whenever state changes
  useEffect(() => {
    try {
      if (triggeredItems.length > 0) {
        localStorage.setItem(
          "mochex_triggered_items_cache",
          JSON.stringify(triggeredItems.slice(0, 100))
        );
      } else {
        localStorage.removeItem("mochex_triggered_items_cache");
      }
    } catch {
      /* ignore */
    }
  }, [triggeredItems]);

  // ---- Effect: sync triggered list only when opening triggered tab ----
  const hasLoadedTriggeredRef = useRef(false);
  useEffect(() => {
    if (activeTab === "triggered" && !hasLoadedTriggeredRef.current) {
      hasLoadedTriggeredRef.current = true;
      fetch("/api/triggered-watchlist")
        .then((r) => r.json())
        .then((data) => {
          if (data?.tableMissing) {
            setIsTriggeredTableMissing(true);
          } else if (Array.isArray(data?.items)) {
            setIsTriggeredTableMissing(false);
            setTriggeredItems(data.items as TriggeredWatchlistItem[]);
          }
        })
        .catch(() => {});
    }
  }, [activeTab]);

  // ---- Effect: background trigger checking (active tabs only) ----
  useEffect(() => {
    if (typeof document !== "undefined" && document.hidden) return;
    if (symbolsToTrack.length === 0 || Object.keys(live).length === 0) return;

    let cancelled = false;

    async function checkTriggers() {
      if (typeof document !== "undefined" && document.hidden) return;
      const toFire = items.filter((i) => {
        if (i.alert_fired) return false;
        if (i.trigger_price == null || i.trigger_direction == null) return false;
        const t = live[i.symbol.toUpperCase()];
        if (!t) return false;
        const tp = i.trigger_price;
        if (i.trigger_direction === "above" && t.lastPrice >= tp) return true;
        if (i.trigger_direction === "below" && t.lastPrice <= tp) return true;
        return false;
      });

      for (const item of toFire) {
        const nowIso = new Date().toISOString();
        const sym = item.symbol.toUpperCase();
        const triggerPrice = item.trigger_price as number;
        const lastPrice = live[sym]?.lastPrice ?? 0;
        try {
          // Atomic claim on watchlist row
          const res = await fetch(`/api/watchlist/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              alert_fired: true,
              alert_fired_at: nowIso,
            }),
          });
          const claimed = await res
            .json()
            .then((j) => j?.claimed !== false)
            .catch(() => false);

          if (claimed) {
            playTriggerSound();

            const itemScreenshots = item.screenshot_urls || (item.screenshot_url ? [item.screenshot_url] : []);
            const itemScreenshot = item.screenshot_url || (item.screenshot_urls?.[0] ?? null);

            let spawnedLimitItem: WatchlistItem | null = null;

            // 1. Send notification + log trade alert for /trades page FIRST while watchlist item still exists
            if (item.order_type === "trigger_limit") {
              // Trigger Limit: spawn new watchlist item with trigger = EP, order_type = Limit
              if (item.entry_price != null) {
                const epDirection: "above" | "below" =
                  lastPrice > 0
                    ? item.entry_price > lastPrice
                      ? "above"
                      : "below"
                    : item.trigger_direction ?? "below";

                try {
                  const spawnRes = await fetch("/api/watchlist", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      symbol: sym,
                      trigger_price: item.entry_price,
                      trigger_direction: epDirection,
                      entry_price: item.entry_price,
                      stop_loss: item.stop_loss,
                      take_profit: item.take_profit,
                      order_type: "limit",
                      notes: item.notes,
                      screenshot_urls: itemScreenshots,
                      screenshot_url: itemScreenshot,
                    }),
                  });
                  if (spawnRes.ok) {
                    const spawnData = await spawnRes.json();
                    if (spawnData?.item) {
                      spawnedLimitItem = spawnData.item;
                    }
                  }
                } catch {
                  // ignore spawn network failure
                }
              }

              // Send notification without creating a /trades alert row
              await fetch(`/api/alerts/fire`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "watchlist_trigger",
                  title: `${cleanSymbol(sym)} TL trigger hit — Limit order armed`,
                  message: `Trigger ${fmtPlanPx(triggerPrice)} fired. New watchlist item created at EP ${fmtPlanPx(item.entry_price ?? 0)}.`,
                  link: "/watchlist",
                }),
              }).catch(() => {});
            } else {
              // Limit or Market: send notification + log trade alert for /trades page
              await fetch(`/api/alerts/fire`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  type: "watchlist_trigger",
                  title: `${cleanSymbol(sym)} hit your trigger`,
                  message: `Last ${fmtPx(lastPrice)} reached your ${fmtPlanPx(triggerPrice)} trigger.`,
                  link: "/trades",
                  symbol: sym,
                  trigger_price: triggerPrice,
                  trigger_direction: item.trigger_direction,
                  fired_price: lastPrice,
                  entry_price: item.entry_price,
                  stop_loss: item.stop_loss,
                  take_profit: item.take_profit,
                  tp1_price: item.tp1_price,
                  tp2_price: item.tp2_price,
                  tp3_price: item.tp3_price,
                  auto_be_on_tp1: item.auto_be_on_tp1,
                  order_type: item.order_type,
                  notes: item.notes,
                  watchlist_item_id: item.id,
                  screenshot_urls: itemScreenshots,
                  screenshot_url: itemScreenshot,
                }),
              }).catch(() => {});
            }

            // 2. Move to triggered archive table
            let trigItem: TriggeredWatchlistItem | null = null;
            try {
              const trigRes = await fetch("/api/triggered-watchlist", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  source_item_id: item.id,
                  symbol: sym,
                  trigger_price: triggerPrice,
                  trigger_direction: item.trigger_direction,
                  fired_price: lastPrice,
                  entry_price: item.entry_price,
                  stop_loss: item.stop_loss,
                  take_profit: item.take_profit,
                  order_type: item.order_type,
                  notes: item.notes,
                  fired_at: nowIso,
                  screenshot_urls: itemScreenshots,
                  screenshot_url: itemScreenshot,
                }),
              });

              if (trigRes.ok) {
                const resData = await trigRes.json();
                if (resData?.tableMissing) {
                  setIsTriggeredTableMissing(true);
                }
                if (resData?.item) {
                  trigItem = resData.item;
                }
              }
            } catch {
              // ignore network failure
            }

            // Fallback: If remote API failed or unmigrated, synthesize item so user NEVER loses it
            if (!trigItem) {
              trigItem = {
                id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                user_id: "",
                source_item_id: item.id,
                symbol: sym,
                trigger_price: triggerPrice,
                trigger_direction: item.trigger_direction,
                fired_price: lastPrice,
                entry_price: item.entry_price,
                stop_loss: item.stop_loss,
                take_profit: item.take_profit,
                order_type: item.order_type,
                notes: item.notes,
                fired_at: nowIso,
                created_at: nowIso,
                screenshot_urls: itemScreenshots,
                screenshot_url: itemScreenshot,
              };
            }

            setTriggeredItems((prev) => [
              trigItem!,
              ...prev.filter((x) => x.id !== trigItem!.id),
            ]);

            // 3. Remove from active watchlist and add spawned limit item if present
            await fetch(`/api/watchlist/${item.id}`, { method: "DELETE" }).catch(() => {});
            setItems((prev) => {
              const remaining = prev.filter((x) => x.id !== item.id);
              return spawnedLimitItem ? [spawnedLimitItem, ...remaining] : remaining;
            });
          }
        } catch {
          // ignore per-item failures
        }
      }
    }

    checkTriggers();

    return () => {
      cancelled = true;
    };
  }, [mexcMarketData.lastRefreshed, items, symbolsToTrack, live]);

  // ---- Column helpers ----

  function toggleCol(key: ColKey, on: boolean) {
    setCols((prev) => {
      const next = { ...prev, [key]: on };
      saveCols(next);
      return next;
    });
  }

  function showAllCols() {
    setCols(() => {
      saveCols({ ...DEFAULT_COLS });
      return { ...DEFAULT_COLS };
    });
  }

  // ---- CRUD operations ----

  async function addWatchlistSetup(
    payload: AddSetupPayload
  ): Promise<WatchlistItem | void> {
    setNote(null);
    const sym = payload.symbol.toUpperCase();

    try {
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          symbol: sym,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to add setup");
      }
      const { item } = await res.json();
      setItems((prev) => [...prev, item]);
      setNote(`Added ${cleanSymbol(sym)} to watchlist.`);
      return item as WatchlistItem;
    } catch (err) {
      setNote((err as Error).message);
      throw err;
    }
  }

  async function addCoin(symbol: string): Promise<WatchlistItem | void> {
    return addWatchlistSetup({ symbol });
  }

  async function removeCoin(id: string) {
    const pending = items.find((x) => x.id === id);
    if (pending) {
      try {
        const archRes = await fetch("/api/archived-watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol: pending.symbol,
            trigger_price: pending.trigger_price,
            trigger_direction: pending.trigger_direction,
            entry_price: pending.entry_price,
            stop_loss: pending.stop_loss,
            take_profit: pending.take_profit,
            order_type: pending.order_type,
            notes: pending.notes,
            archive_source: "active_deleted",
          }),
        });
        if (archRes.ok) {
          const { item: archived } = await archRes.json();
          setArchivedItems((prev) => [archived, ...prev]);
        }
      } catch {
        /* ignore */
      }
    }

    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
    setConfirmRemove(null);
  }

  // Reload the list after an alert/trade-plan save so the row reflects
  // the updated trigger state.
  async function reloadItems() {
    try {
      const res = await fetch(`/api/watchlist`);
      if (!res.ok) return;
      const data = await res.json();
      setItems((data.items ?? []) as WatchlistItem[]);
    } catch {
      /* ignore */
    }
  }

  // ---- Multi-selection & Bulk Export / Delete handlers ----

  function handleToggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleSelectAllPage() {
    const pageIds = pageItems.map((item) => item.id);
    const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function handleSelectAllFiltered() {
    const allFilteredIds = filteredItems.map((item) => item.id);
    setSelectedIds(new Set(allFilteredIds));
  }

  function handleClearSelection() {
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
  }

  function handleExportWatchlistCsv(targetItems?: WatchlistItem[]) {
    let itemsToExport: WatchlistItem[] = [];
    if (targetItems && targetItems.length > 0) {
      itemsToExport = targetItems;
    } else if (selectedIds.size > 0) {
      itemsToExport = items.filter((item) => selectedIds.has(item.id));
    } else {
      itemsToExport = filteredItems;
    }

    if (itemsToExport.length === 0) {
      setNote("No coins to export.");
      return;
    }

    const count = itemsToExport.length;
    exportWatchlistToCsv(itemsToExport, live);
    setNote(`Exported ${count} coin${count > 1 ? "s" : ""} to CSV.`);
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setIsBulkDeleting(true);

    const itemsToArchive = items.filter((item) => selectedIds.has(item.id));
    const count = itemsToArchive.length;

    try {
      for (const pending of itemsToArchive) {
        try {
          const archRes = await fetch("/api/archived-watchlist", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbol: pending.symbol,
              trigger_price: pending.trigger_price,
              trigger_direction: pending.trigger_direction,
              entry_price: pending.entry_price,
              stop_loss: pending.stop_loss,
              take_profit: pending.take_profit,
              order_type: pending.order_type,
              notes: pending.notes,
              archive_source: "active_deleted",
            }),
          });
          if (archRes.ok) {
            const { item: archived } = await archRes.json();
            if (archived) {
              setArchivedItems((prev) => [archived, ...prev]);
            }
          }
        } catch {
          /* ignore */
        }

        await fetch(`/api/watchlist/${pending.id}`, { method: "DELETE" });
      }

      setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      setNote(`Archived and removed ${count} coin${count > 1 ? "s" : ""} from Watchlist.`);
    } catch (err) {
      console.error("Bulk delete error:", err);
    } finally {
      setIsBulkDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---- Header + Add Token Button ---- */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">Market radar</p>
          <h1 className="text-2xl font-semibold mb-1">Futures watchlist</h1>
          <p className="text-sm text-muted">
            MEXC USDT-perpetual coins · live data · {items.length} saved
          </p>
        </div>

        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="accent-btn px-4 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <span>+ Add Token</span>
        </button>
      </div>

      {/* ---- Status messages ---- */}
      {note && (
        <div className="p-3 rounded-lg bg-gain/10 border border-gain/20 text-gain text-xs flex items-center justify-between">
          <span>{note}</span>
          <button
            type="button"
            onClick={() => setNote(null)}
            className="text-muted hover:text-text cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ---- Tab Navigation ---- */}
      <div className="flex items-center gap-1 border-b border-line pb-0 font-mono text-xs">
        <button
          type="button"
          onClick={() => handleTabChange("active")}
          className={`px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "active"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          Watchlist
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-panel-soft border border-line font-mono">
            {items.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("triggered")}
          className={`px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "triggered"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          Triggered
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-panel-soft border border-line font-mono">
            {triggeredItems.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("archive")}
          className={`px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "archive"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          Archive
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-panel-soft border border-line font-mono">
            {archivedItems.length}
          </span>
        </button>
      </div>

      {/* ---- Tab Content ---- */}
      {activeTab === "triggered" ? (
        <WatchlistTriggeredTab
          triggeredItems={triggeredItems}
          isTableMissing={isTriggeredTableMissing}
          icons={icons}
          onItemRestored={(restored, triggeredId) => {
            setItems((prev) => [...prev, restored]);
            setTriggeredItems((prev) =>
              prev.filter((x) => x.id !== triggeredId)
            );
            setNote(`Moved ${cleanSymbol(restored.symbol)} back to active Watchlist.`);
          }}
          onItemDeleted={(id, archivedItem) => {
            setTriggeredItems((prev) => prev.filter((x) => x.id !== id));
            if (archivedItem) {
              setArchivedItems((prev) => [archivedItem, ...prev]);
            }
          }}
          onViewDetails={(item) =>
            setDetails({ symbol: item.symbol.toUpperCase(), item, isReadOnly: true })
          }
        />
      ) : activeTab === "archive" ? (
        <WatchlistArchiveTab
          archivedItems={archivedItems}
          icons={icons}
          onItemRestored={(restored, archivedId) => {
            setItems((prev) => [...prev, restored]);
            setArchivedItems((prev) => prev.filter((x) => x.id !== archivedId));
            setNote(`Restored ${cleanSymbol(restored.symbol)} to Watchlist.`);
          }}
          onItemDeleted={(id) => {
            setArchivedItems((prev) => prev.filter((x) => x.id !== id));
          }}
          onViewDetails={(item) =>
            setDetails({ symbol: item.symbol.toUpperCase(), item, isReadOnly: true })
          }
        />
      ) : items.length === 0 ? (
        <div className="hairline text-muted p-12 text-center text-sm rounded-xl bg-panel/30 flex flex-col items-center gap-3">
          <p className="font-mono text-muted uppercase tracking-wider text-xs">Watchlist is empty</p>
          <p className="text-xs text-muted/70 max-w-sm">
            Track MEXC futures contracts with real-time pricing, audio proximity alerts, and trade execution plans.
          </p>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="accent-btn px-4 py-2 text-xs font-semibold rounded-lg cursor-pointer"
          >
            + Add Your First Token
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 bg-panel border border-line rounded-xl p-4 shadow-sm flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted uppercase font-semibold tracking-wide">
                Total Active Setups
              </span>
              <span className="text-2xl font-black text-text mt-1">
                {totalActiveItems}
              </span>
            </div>
          </div>
          <WatchlistToolbar
            filter={filter}
            onFilterChange={(v) => {
              setFilter(v);
              setPage(0);
            }}
            sort={sort}
            onSortChange={(next) => {
              setSort(next);
              saveSort(next);
            }}
            cols={cols}
            onToggleCol={toggleCol}
            onShowAllCols={showAllCols}
            pageSize={pageSize}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(0);
            }}
            selectedCount={selectedIds.size}
            onExportCsv={() => handleExportWatchlistCsv()}
          />

          {/* ---- Selection Action Bar ---- */}
          {selectedIds.size > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-2.5 rounded-xl bg-panel border border-accent/40 shadow-sm animate-in fade-in duration-150">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-accent text-xs">
                  ✓ {selectedIds.size} coin{selectedIds.size > 1 ? "s" : ""} selected
                </span>
                {filteredItems.length > pageItems.length && selectedIds.size < filteredItems.length && (
                  <button
                    type="button"
                    onClick={handleSelectAllFiltered}
                    className="text-xs text-muted hover:text-accent underline cursor-pointer ml-1"
                  >
                    Select all {filteredItems.length} matching coins
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleExportWatchlistCsv()}
                  className="accent-btn px-3 py-1.5 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  title="Export selected coins to CSV"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  <span>Export Selected ({selectedIds.size}) to CSV</span>
                </button>

                {confirmBulkDelete ? (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-muted">Delete {selectedIds.size}?</span>
                    <button
                      type="button"
                      disabled={isBulkDeleting}
                      onClick={handleBulkDelete}
                      className="px-2.5 py-1.5 rounded-lg border border-loss text-loss hover:bg-loss/10 font-semibold cursor-pointer disabled:opacity-50"
                    >
                      {isBulkDeleting ? "Deleting…" : "Confirm"}
                    </button>
                    <button
                      type="button"
                      disabled={isBulkDeleting}
                      onClick={() => setConfirmBulkDelete(false)}
                      className="px-2 py-1.5 text-muted hover:text-text cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmBulkDelete(true)}
                    className="px-3 py-1.5 text-xs rounded-lg border border-loss/40 text-loss hover:bg-loss/10 flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>Delete Selected</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClearSelection}
                  className="px-2.5 py-1.5 text-xs text-muted hover:text-text cursor-pointer"
                  title="Clear selection"
                >
                  ✕ Clear
                </button>
              </div>
            </div>
          )}

          {filteredItems.length === 0 ? (
            <div className="hairline text-muted p-10 text-center text-sm">
              No saved coins match &ldquo;{filter}&rdquo;. Try a different
              search.
            </div>
          ) : (
            <WatchlistTable
              pageItems={pageItems}
              live={live}
              icons={icons}
              cols={cols}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
              onToggleSelectAll={handleToggleSelectAllPage}
              onModify={(item) =>
                setDetails({ symbol: item.symbol.toUpperCase(), item })
              }
              onRemove={(id) => setConfirmRemove(id)}
              hasPaging={hasPaging}
              safePage={safePage}
              pageCount={pageCount}
              onPrevPage={() => setPage((p) => Math.max(0, p - 1))}
              onNextPage={() =>
                setPage((p) => Math.min(pageCount - 1, p + 1))
              }
            />
          )}
        </>
      )}

      {/* ---- Footer note ---- */}
      <p className="text-xs text-muted">
        Live data refreshes every {refreshIntervalSec}s from the MEXC contract
        (futures) API. Rows default to Status sort (Triggered â†’ Ongoing â†’
        None). Use the Sort by dropdown to reorder by coin, 24h %, volume,
        price, trigger, or change text â€” or toggle visible columns from the
        &ldquo;Columns&rdquo; button.
      </p>

      {/* ---- Coin detail modal ---- */}
      {details && (
        <CoinDetailModal
          symbol={details.symbol}
          item={details.item}
          isReadOnly={details.isReadOnly}
          onClose={() => setDetails(null)}
          onSaved={reloadItems}
        />
      )}

      {/* ---- Remove confirmation modal ---- */}
      {confirmRemove &&
        (() => {
          const pending = items.find((x) => x.id === confirmRemove);
          if (!pending) return null;
          const sym = cleanSymbol(pending.symbol.toUpperCase());
          return (
            <ModalShell
              title={`Remove ${sym}?`}
              onClose={() => setConfirmRemove(null)}
              maxWidth="max-w-sm"
              center
            >
              <p className="text-sm">
                Remove <span className="font-medium">{sym}</span> from your
                watchlist? This won&apos;t affect any live alert status.
              </p>
              <div className="flex justify-end gap-2 hairline-t pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setConfirmRemove(null)}
                  className="px-3 py-2 text-sm btn-ghost cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => removeCoin(pending.id)}
                  className="px-4 py-2 text-sm font-semibold bg-loss text-panel rounded-md cursor-pointer"
                >
                  Remove
                </button>
              </div>
            </ModalShell>
          );
        })()}

      <AddTokenModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAddSetup={addWatchlistSetup}
        onAddCoin={addCoin}
        existingSymbols={existingSymbols}
        icons={icons}
        onConfigurePlan={(item) =>
          setDetails({ symbol: item.symbol.toUpperCase(), item })
        }
      />
    </div>
  );
}

