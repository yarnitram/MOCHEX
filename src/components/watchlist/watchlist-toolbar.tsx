"use client";

import { useEffect, useRef, useState } from "react";
import type { ColKey, SortConfig } from "./watchlist-types";
import { COLUMNS, SORT_OPTIONS, sortConfigKey } from "./watchlist-types";

// ---- Prop types ----

export interface WatchlistToolbarProps {
  /** Current filter text for the saved-coins search box. */
  filter: string;
  /** Called when the user types in the filter box. Parent must reset page to 0. */
  onFilterChange: (value: string) => void;
  /** Current sort configuration. */
  sort: SortConfig;
  /** Called when the user picks a new sort option. */
  onSortChange: (next: SortConfig) => void;
  /** Column visibility map. */
  cols: Record<ColKey, boolean>;
  onToggleCol: (key: ColKey, on: boolean) => void;
  onShowAllCols: () => void;
  /** Current page size (use Number.POSITIVE_INFINITY for "All"). */
  pageSize: number;
  /** Called when the user picks a new page size. Parent must reset page to 0. */
  onPageSizeChange: (next: number) => void;
  /** Number of currently selected items (if any). */
  selectedCount?: number;
  /** Trigger export to CSV. */
  onExportCsv?: () => void;
}

const inputCls =
  "hairline bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent";

export function WatchlistToolbar({
  filter,
  onFilterChange,
  sort,
  onSortChange,
  cols,
  onToggleCol,
  onShowAllCols,
  pageSize,
  onPageSizeChange,
  selectedCount = 0,
  onExportCsv,
}: WatchlistToolbarProps) {
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  const hasPaging = Number.isFinite(pageSize);
  const colVisible = (key: ColKey) => cols[key] !== false;

  // Close the column picker when clicking outside of it.
  useEffect(() => {
    if (!colsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) {
        setColsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [colsOpen]);

  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      {/* ---- Filter input ---- */}
      <label className="flex items-center gap-2 text-xs text-muted">
        <span>Search</span>
        <input
          className={`${inputCls} w-44`}
          value={filter}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter saved coins…"
        />
      </label>

      <div className="flex items-center gap-3 flex-wrap">
        {/* ---- Column picker ---- */}
        <div className="relative" ref={colsRef}>
          <button
            type="button"
            onClick={() => setColsOpen((o) => !o)}
            aria-expanded={colsOpen}
            aria-haspopup="true"
            className={`hairline bg-panel px-2 py-1.5 text-xs cursor-pointer rounded-md flex items-center gap-1.5 ${
              colsOpen
                ? "border-accent text-accent"
                : "text-muted hover:text-text"
            }`}
          >
            Columns
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path
                d="M2 3.5l3 3 3-3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          {colsOpen && (
            <div
              className="absolute right-0 top-full mt-1 z-30 w-52 hairline bg-panel shadow-lg rounded-lg p-2"
              role="menu"
            >
              <div className="flex items-center justify-between px-2 pb-1.5 mb-1 hairline-b">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Show columns
                </span>
                <button
                  type="button"
                  onClick={onShowAllCols}
                  className="text-[11px] text-accent hover:underline cursor-pointer"
                >
                  Show all
                </button>
              </div>

              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 px-2 py-1.5 text-xs text-text rounded hover:bg-panel-soft cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={colVisible(c.key)}
                    onChange={(e) => onToggleCol(c.key, e.target.checked)}
                    className="accent-accent cursor-pointer"
                  />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* ---- Sort select ---- */}
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Sort by</span>
          <select
            className={`${inputCls} cursor-pointer`}
            value={sortConfigKey(sort)}
            onChange={(e) => {
              const next = SORT_OPTIONS.find(
                (o) => sortConfigKey(o.value) === e.target.value
              );
              if (next) onSortChange(next.value);
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option
                key={sortConfigKey(o.value)}
                value={sortConfigKey(o.value)}
              >
                {o.label}
              </option>
            ))}
          </select>
        </label>

        {/* ---- Rows-per-page select ---- */}
        <label className="flex items-center gap-2 text-xs text-muted">
          <span>Rows per page</span>
          <select
            className={`${inputCls} cursor-pointer`}
            value={hasPaging ? String(pageSize) : "all"}
            onChange={(e) => {
              const v = e.target.value;
              onPageSizeChange(
                v === "all" ? Number.POSITIVE_INFINITY : Number(v)
              );
            }}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </label>

        {/* ---- Export CSV button ---- */}
        {onExportCsv && (
          <button
            type="button"
            onClick={onExportCsv}
            className="hairline bg-panel hover:bg-panel-soft text-text px-2.5 py-1.5 text-xs cursor-pointer rounded-md flex items-center gap-1.5 transition-colors"
            title={selectedCount > 0 ? `Export ${selectedCount} selected coin(s) to CSV` : "Export active coins to CSV"}
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
            <span>
              {selectedCount > 0 ? `Export CSV (${selectedCount})` : "Export CSV"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
