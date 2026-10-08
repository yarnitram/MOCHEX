"use client";

import { useState } from "react";
import { deriveTradeSide, type TriggeredWatchlistItem, type WatchlistItem, type ArchivedWatchlistItem } from "@/lib/types";
import { cleanSymbol, fmtPx, fmtPlanPx } from "@/lib/format";
import { getOrderTypeLabel } from "@/lib/watchlist-utils";
import { ChartModal } from "@/components/charts/chart-modal";
import { exportTriggeredWatchlistToCsv } from "@/lib/export-watchlist";

const MIGRATION_SQL = `-- Migration 012: triggered_watchlist_items
create table if not exists triggered_watchlist_items (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        references auth.users not null,
  source_item_id    uuid,
  symbol            text        not null,
  trigger_price     numeric(18,7),
  trigger_direction text        check (trigger_direction in ('above','below')),
  fired_price       numeric(18,7),
  entry_price       numeric(18,7),
  stop_loss         numeric(18,7),
  take_profit       numeric(18,7),
  order_type        text        check (order_type in ('limit','trigger_limit','market')),
  notes             text,
  fired_at          timestamptz not null default now(),
  created_at        timestamptz          default now()
);

alter table triggered_watchlist_items enable row level security;

create policy "triggered_watchlist_select_own"
  on triggered_watchlist_items for select
  to authenticated using (auth.uid() = user_id);

create policy "triggered_watchlist_insert_own"
  on triggered_watchlist_items for insert
  to authenticated with check (auth.uid() = user_id);

create policy "triggered_watchlist_delete_own"
  on triggered_watchlist_items for delete
  to authenticated using (auth.uid() = user_id);
`;

interface Props {
  triggeredItems: TriggeredWatchlistItem[];
  isTableMissing?: boolean;
  icons?: Record<string, string>;
  onItemRestored: (item: WatchlistItem, triggeredId: string) => void;
  onItemDeleted: (id: string, archivedItem?: ArchivedWatchlistItem) => void;
  onViewDetails?: (item: TriggeredWatchlistItem) => void;
}

export function WatchlistTriggeredTab({
  triggeredItems,
  isTableMissing = false,
  icons = {},
  onItemRestored,
  onItemDeleted,
  onViewDetails,
}: Props) {
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chartItem, setChartItem] = useState<TriggeredWatchlistItem | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);

  const handleCopySql = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleMoveBack = async (item: TriggeredWatchlistItem) => {
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
        alert(err.error || "Failed to restore watchlist item");
        setRestoringId(null);
        return;
      }

      const { item: restored } = await res.json();

      // 2. Delete from triggered_watchlist_items (if on server)
      if (!item.id.startsWith("local-")) {
        await fetch(`/api/triggered-watchlist/${item.id}`, { method: "DELETE" }).catch(() => {});
      }

      onItemRestored(restored, item.id);
    } catch {
      alert("Network error while restoring item");
    } finally {
      setRestoringId(null);
    }
  };

  const handleDelete = async (item: TriggeredWatchlistItem) => {
    if (deletingId) return;
    setDeletingId(item.id);

    try {
      // 1. Save to archive table
      const archRes = await fetch("/api/archived-watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: item.symbol,
          trigger_price: item.trigger_price,
          trigger_direction: item.trigger_direction,
          fired_price: item.fired_price,
          entry_price: item.entry_price,
          stop_loss: item.stop_loss,
          take_profit: item.take_profit,
          order_type: item.order_type,
          notes: item.notes,
          archive_source: "triggered_deleted",
          fired_at: item.fired_at,
          screenshot_urls: item.screenshot_urls || (item.screenshot_url ? [item.screenshot_url] : []),
          screenshot_url: item.screenshot_url || (item.screenshot_urls?.[0] ?? null),
        }),
      });

      let archivedItem: ArchivedWatchlistItem | undefined = undefined;
      if (archRes.ok) {
        const { item: a } = await archRes.json();
        archivedItem = a;
      }

      // 2. Remove from triggered_watchlist_items (if on server)
      if (!item.id.startsWith("local-")) {
        await fetch(`/api/triggered-watchlist/${item.id}`, {
          method: "DELETE",
        }).catch(() => {});
      }

      onItemDeleted(item.id, archivedItem);
    } finally {
      setDeletingId(null);
    }
  };

  const tableMissingBanner = isTableMissing && (
    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none mt-0.5">⚠️</span>
        <div>
          <p className="font-semibold text-amber-300">
            Supabase Migration Required for Cloud Sync
          </p>
          <p className="text-amber-200/80 text-[11px] mt-0.5 leading-relaxed">
            Triggered items are currently saved safely in your browser storage. Run migration{" "}
            <code className="px-1 py-0.5 rounded bg-black/40 text-amber-300 font-mono">
              012_triggered_watchlist_items
            </code>{" "}
            in your Supabase SQL editor to sync across all devices.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleCopySql}
          className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-mono text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1.5"
        >
          {copiedSql ? (
            <>
              <svg className="w-3.5 h-3.5 text-gain" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Copied SQL!</span>
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>Copy SQL</span>
            </>
          )}
        </button>
        <a
          href="https://supabase.com/dashboard/project/cgsgsvnzysqvzksgapeo/sql/new"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 rounded-lg bg-panel-soft hover:bg-panel border border-line text-muted hover:text-text font-mono text-[11px] transition-colors flex items-center gap-1"
        >
          SQL Editor ↗
        </a>
      </div>
    </div>
  );

  if (triggeredItems.length === 0) {
    return (
      <div className="flex flex-col">
        {tableMissingBanner}
        <div className="py-16 text-center border border-line rounded-xl bg-panel/30">
          <p className="text-sm font-mono text-muted uppercase tracking-wider mb-1">
            No triggered tokens
          </p>
          <p className="text-xs text-muted/70">
            When price alerts hit, triggered items will move here automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {tableMissingBanner}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <span className="text-xs text-muted font-mono">
          {triggeredItems.length} triggered setup{triggeredItems.length > 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => exportTriggeredWatchlistToCsv(triggeredItems)}
          className="hairline bg-panel hover:bg-panel-soft text-text px-2.5 py-1.5 text-xs cursor-pointer rounded-md flex items-center gap-1.5 transition-colors"
          title="Export triggered tokens to CSV"
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
            <th className="py-2.5 px-3">Side</th>
            <th className="py-2.5 px-3">Order Type</th>
            <th className="py-2.5 px-3 text-right">Trigger Px</th>
            <th className="py-2.5 px-3 text-right">Fired Px</th>
            <th className="py-2.5 px-3 text-right">Fired At</th>
            <th className="py-2.5 px-3 text-right">EP / SL / TP</th>
            <th className="py-2.5 px-3">Notes</th>
            <th className="py-2.5 px-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {triggeredItems.map((item) => {
            const sym = cleanSymbol(item.symbol);
            const side = deriveTradeSide(item);
            const isLong = side === "long";

            const orderTypeLabel = getOrderTypeLabel(item.order_type);

            const firedAtFormatted = new Date(item.fired_at).toLocaleString("en-SG", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
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
                <td className="py-3 px-3">
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
                  {firedAtFormatted}
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
                <td className="py-3 px-3 text-muted text-xs max-w-[200px] truncate" title={item.notes ?? ""}>
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
                      onClick={() => handleMoveBack(item)}
                      disabled={restoringId === item.id}
                      title="Move back to Watchlist"
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-amber-400 hover:bg-amber-400/10 border border-amber-400/20 transition-colors flex items-center gap-1 disabled:opacity-50"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 7L3 12L8 17M3 12H21M16 7L21 12L16 17" />
                      </svg>
                      Move back
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.id}
                      title="Delete triggered item"
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
      </div>

      {chartItem && (
        <ChartModal
          isOpen={!!chartItem}
          onClose={() => setChartItem(null)}
          symbol={chartItem.symbol}
          setup={{
            symbol: chartItem.symbol,
            trigger_price: chartItem.trigger_price,
            entry_price: chartItem.entry_price,
            stop_loss: chartItem.stop_loss,
            take_profit: chartItem.take_profit,
            order_type: chartItem.order_type,
          }}
        />
      )}
    </div>
  );
}
