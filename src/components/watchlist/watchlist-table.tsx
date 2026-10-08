"use client";

import type { WatchlistItem } from "@/lib/types";
import type { ColKey, Ticker } from "./watchlist-types";
import { WatchlistRow } from "./watchlist-row";

// ---- Prop types ----

export interface WatchlistTableProps {
  /** Items to render on the current page. */
  pageItems: WatchlistItem[];
  /** Live tickers keyed by uppercased symbol (e.g. "BTC_USDT"). */
  live: Record<string, Ticker>;
  /** Coin icon URLs keyed by uppercased symbol. */
  icons: Record<string, string>;
  /** Which columns are currently visible. */
  cols: Record<ColKey, boolean>;
  /** Set of selected item ids for bulk actions. */
  selectedIds: Set<string>;
  /** Toggle a single item's selection. */
  onToggleSelect: (id: string) => void;
  /** Toggle all items on this page. */
  onToggleSelectAll: () => void;
  /** Open the modify modal for a given item. */
  onModify: (item: WatchlistItem) => void;
  /** Open the remove-confirmation for a given item id. */
  onRemove: (id: string) => void;
  // ---- Pagination ----
  hasPaging: boolean;
  safePage: number;
  pageCount: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

export function WatchlistTable({
  pageItems,
  live,
  icons,
  cols,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  onModify,
  onRemove,
  hasPaging,
  safePage,
  pageCount,
  onPrevPage,
  onNextPage,
}: WatchlistTableProps) {
  const colVisible = (key: ColKey) => cols[key] !== false;
  const allSelected = pageItems.length > 0 && pageItems.every((item) => selectedIds.has(item.id));
  const someSelected = !allSelected && pageItems.some((item) => selectedIds.has(item.id));

  return (
    <>
      <div className="hairline overflow-x-auto rounded-xl bg-panel/40 striped">
        <table className="w-full text-sm border-collapse min-w-[1240px]">
          <thead>
            <tr className="hairline-b bg-panel-soft/60 font-mono text-[10px] uppercase text-muted tracking-wider">
              <th className="px-3 py-2.5 w-8 text-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={onToggleSelectAll}
                  aria-label="Select all coins on this page"
                  className="accent-accent cursor-pointer size-3.5 rounded align-middle"
                />
              </th>
              <th className="px-3 py-2.5 text-left">Coin</th>
              {colVisible("position") && (
                <th className="px-3 py-2.5">Position</th>
              )}
              {colVisible("change") && (
                <th className="px-3 py-2.5 text-right">24h %</th>
              )}
              {colVisible("volume") && (
                <th className="px-3 py-2.5 text-right">Volume (24h)</th>
              )}
              {colVisible("price") && (
                <th className="px-3 py-2.5 text-right">Last Price</th>
              )}
              {colVisible("trigger") && (
                <th className="px-3 py-2.5 text-right">Trigger</th>
              )}
              {colVisible("plan") && (
                <th className="px-3 py-2.5 text-center">EP / SL / TP</th>
              )}
              {colVisible("orderType") && (
                <th className="px-3 py-2.5 text-right">Order type</th>
              )}
              {colVisible("triggerAdded") && (
                <th className="px-3 py-2.5 text-center">Trigger added</th>
              )}
              {colVisible("firedAt") && (
                <th className="px-3 py-2.5 text-center">Fired at</th>
              )}
              {colVisible("status") && (
                <th className="px-3 py-2.5 text-center">Status</th>
              )}
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>

          <tbody>
            {pageItems.map((item) => {
              const sym = item.symbol.toUpperCase();
              return (
                <WatchlistRow
                  key={item.id}
                  item={item}
                  ticker={live[sym]}
                  iconUrl={icons[sym]}
                  cols={cols}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelect={() => onToggleSelect(item.id)}
                  onModify={() => onModify(item)}
                  onRemove={() => onRemove(item.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {hasPaging && (
        <div className="flex items-center justify-center gap-4 text-xs text-muted mt-3">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={onPrevPage}
            className="btn-ghost px-3 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="num">
            Page {safePage + 1} of {pageCount}
          </span>
          <button
            type="button"
            disabled={safePage >= pageCount - 1}
            onClick={onNextPage}
            className="btn-ghost px-3 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </>
  );
}
