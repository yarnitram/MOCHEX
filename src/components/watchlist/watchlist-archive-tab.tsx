"use client";

import { useState } from "react";
import { deriveTradeSide, type ArchivedWatchlistItem, type WatchlistItem } from "@/lib/types";
import { cleanSymbol, fmtPx, fmtPlanPx } from "@/lib/format";
import { getOrderTypeLabel } from "@/lib/watchlist-utils";
import { ChartModal } from "@/components/charts/chart-modal";
import { exportArchivedWatchlistToCsv } from "@/lib/export-watchlist";

interface Props {
  archivedItems: ArchivedWatchlistItem[];
  icons?: Record<string, string>;
  onItemRestored: (item: WatchlistItem, archivedId: string) => void;
  onItemDeleted: (id: string) => void;
  onViewDetails?: (item: ArchivedWatchlistItem) => void;
}

export function WatchlistArchiveTab({
  archivedItems,
  icons = {},
  onItemRestored,
  onItemDeleted,
  onViewDetails,
}: Props) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chartItem, setChartItem] = useState<ArchivedWatchlistItem | null>(null);

  const handleRestore = async (item: ArchivedWatchlistItem) => {
    if (restoringId) return;
    setRestoringId(item.id);

    try {
      // 1. Re-create in active watchlist
      const res = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: item.symbol,
          trigger_price: item.trigger_price,
          trigger_direction: item.trigger_direction,
          order_type: item.order_type,
          entry_price: item.entry_price,
          stop_loss: item.stop_loss,
          take_profit: item.take_profit,
          notes: item.notes,
          screenshot_urls: item.screenshot_urls || (item.screenshot_url ? [item.screenshot_url] : []),
          screenshot_url: item.screenshot_url || (item.screenshot_urls?.[0] ?? null),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Failed to restore item to watchlist");
        setRestoringId(null);
        return;
      }

      const { item: restored } = await res.json();

      // 2. Delete from archived_watchlist_items
      await fetch(`/api/archived-watchlist/${item.id}`, { method: "DELETE" });

      onItemRestored(restored, item.id);
    } catch {
      alert("Network error while restoring archived item");
    } finally {
      setRestoringId(null);
    }
  };

  const handlePermanentDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);

    try {
      const res = await fetch(`/api/archived-watchlist/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        onItemDeleted(id);
      }
    } finally {
      setDeletingId(null);
    }
  };

  if (archivedItems.length === 0) {
    return (
      <div className="py-16 text-center border border-line rounded-xl bg-panel/30">
        <p className="text-sm font-mono text-muted uppercase tracking-wider mb-1">
          Archive is empty
        </p>
        <p className="text-xs text-muted/70">
          When you delete active or triggered watchlist items, they will be archived here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-xs text-muted font-mono">
          {archivedItems.length} archived setup{archivedItems.length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => exportArchivedWatchlistToCsv(archivedItems)}
          className="hairline bg-panel hover:bg-panel-soft text-text px-2.5 py-1.5 text-xs cursor-pointer rounded-md flex items-center gap-1.5 transition-colors"
          title="Export archived tokens to CSV"
        >
          <svg
            className="w-3.5 h-3.5 text-muted"
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
          <span>Export to CSV</span>
        </button>
      </div>
      <div className="overflow-x-auto border border-line rounded-xl bg-panel/40">
      <table className="w-full text-left border-collapse text-xs">
        <thead>
          <tr className="hairline-b bg-panel-soft/60 font-mono text-[10px] uppercase text-muted tracking-wider">
            <th className="py-2.5 px-3">Coin</th>
            <th className="py-2.5 px-3">Source</th>
            <th className="py-2.5 px-3">Side</th>
            <th className="py-2.5 px-3">Order Type</th>
            <th className="py-2.5 px-3 text-right">Trigger Px</th>
            <th className="py-2.5 px-3 text-right">Fired Px</th>
            <th className="py-2.5 px-3 text-right">EP / SL / TP</th>
            <th className="py-2.5 px-3 text-right">Archived At</th>
            <th className="py-2.5 px-3">Notes</th>
            <th className="py-2.5 px-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {archivedItems.map((item) => {
            const sym = cleanSymbol(item.symbol);
            const side = deriveTradeSide(item);
            const isLong = side === "long";

            const orderTypeLabel = getOrderTypeLabel(item.order_type);

            const isFromTriggered = item.archive_source === "triggered_deleted";
            const archivedAtFormatted = new Date(item.archived_at).toLocaleString("en-SG", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });

            const iconUrl = icons[item.symbol.toUpperCase()] || icons[sym];

            return (
              <tr key={item.id} className="hover:bg-panel-soft/50 transition-colors">
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                      {iconUrl ? (
                        <img
                          src={iconUrl}
                          alt={sym}
                          draggable={false}
                          className="size-5 rounded-full object-contain inline-block"
                        />
                      ) : (
                        <span className="flex size-5 items-center justify-center rounded-full bg-panel-soft text-[10px] font-semibold text-muted">
                          {sym.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="font-semibold font-mono text-text">
                      {sym}
                      <span className="text-[10px] font-normal text-muted ml-1">USDT</span>
                    </span>
                  </div>
                </td>
                <td className="py-3 px-3 font-mono">
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${
                      isFromTriggered
                        ? "bg-accent/15 text-accent border border-accent/25"
                        : "bg-panel-soft text-muted border border-line"
                    }`}
                  >
                    {isFromTriggered ? "Triggered" : "Watchlist"}
                  </span>
                </td>
                <td className="py-3 px-3">
                  {side ? (
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${
                        isLong
                          ? "bg-gain/15 text-gain border border-gain/20"
                          : "bg-loss/15 text-loss border border-loss/20"
                      }`}
                    >
                      {isLong ? (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 7l10 10M17 7v10H7" />
                        </svg>
                      )}
                      {side.toUpperCase()}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-3 px-3 font-mono text-muted">
                  <span className="px-1.5 py-0.5 rounded bg-panel-soft border border-line text-[10px]">
                    {orderTypeLabel}
                  </span>
                </td>
                <td className="py-3 px-3 text-right font-mono text-text font-medium">
                  {item.trigger_price != null ? fmtPlanPx(Number(item.trigger_price)) : "—"}
                </td>
                <td className="py-3 px-3 text-right font-mono text-gain font-medium">
                  {item.fired_price != null ? fmtPx(Number(item.fired_price)) : "—"}
                </td>
                <td className="py-3 px-3 text-right font-mono text-muted text-[11px]">
                  {item.entry_price != null ? (
                    <div>
                      <span>EP: {fmtPlanPx(Number(item.entry_price))}</span>
                      {(item.stop_loss != null || item.take_profit != null) && (
                        <div className="text-[10px] text-muted/70">
                          {item.stop_loss != null ? `SL ${fmtPlanPx(Number(item.stop_loss))}` : ""}
                          {item.stop_loss != null && item.take_profit != null ? " · " : ""}
                          {item.take_profit != null ? `TP ${fmtPlanPx(Number(item.take_profit))}` : ""}
                        </div>
                      )}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="py-3 px-3 text-right font-mono text-muted text-[11px]">
                  {archivedAtFormatted}
                </td>
                <td className="py-3 px-3 text-muted text-xs max-w-[180px] truncate" title={item.notes ?? ""}>
                  {item.notes || "—"}
                </td>
                <td className="py-3 px-3 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onViewDetails?.(item)}
                      title="View token details"
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-text bg-panel hover:bg-panel-soft border border-line transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      View
                    </button>
                    <button
                      type="button"
                      onClick={() => setChartItem(item)}
                      title={`Open ${cleanSymbol(item.symbol)} interactive chart`}
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-accent hover:bg-accent/10 border border-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18" />
                        <path d="M18 17V9" />
                        <path d="M13 17V5" />
                        <path d="M8 17v-3" />
                      </svg>
                      Chart
                    </button>
                    <button
                      onClick={() => handleRestore(item)}
                      disabled={restoringId === item.id}
                      title="Restore to active Watchlist"
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-amber-400 hover:bg-amber-400/10 border border-amber-400/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 7L3 12L8 17M3 12H21M16 7L21 12L16 17" />
                      </svg>
                      Restore
                    </button>
                    <button
                      onClick={() => handlePermanentDelete(item.id)}
                      disabled={deletingId === item.id}
                      title="Permanently Delete"
                      className="p-1 rounded text-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors disabled:opacity-50"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {chartItem && (
        <ChartModal
          isOpen={!!chartItem}
          onClose={() => setChartItem(null)}
          symbol={chartItem.symbol}
          setup={{
            symbol: chartItem.symbol,
            side: deriveTradeSide(chartItem) === "long" ? "LONG" : "SHORT",
            trigger_price: chartItem.trigger_price,
            entry_price: chartItem.entry_price,
            stop_loss: chartItem.stop_loss,
            take_profit: chartItem.take_profit,
            order_type: chartItem.order_type,
          }}
        />
      )}
      </div>
    </div>
  );
}
