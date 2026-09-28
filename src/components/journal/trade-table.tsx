"use client";

import { useState } from "react";
import type { TradeWithExtras } from "@/lib/types";
import { money, r } from "@/lib/format";
import { ImageLightboxModal } from "@/components/ui/image-lightbox-modal";

function CameraIcon({ className = "w-3 h-3" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3" />
    </svg>
  );
}

interface Props {
  trades: TradeWithExtras[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleAll: (ids: string[], value: boolean) => void;
  onRowClick: (t: TradeWithExtras) => void;
  onChart: (t: TradeWithExtras) => void;
  onView: (t: TradeWithExtras) => void;
  onEdit: (t: TradeWithExtras) => void;
  onDelete: (t: TradeWithExtras) => void;
}

export function TradeTable({
  trades,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onRowClick,
  onChart,
  onView,
  onEdit,
  onDelete,
}: Props) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxTitle, setLightboxTitle] = useState("");
  if (trades.length === 0) {
    return (
      <div className="hairline text-muted p-8 text-center text-sm">
        No trades yet — add your first one.
      </div>
    );
  }

  const allSelected = trades.every((t) => selectedIds.has(t.id));
  const someSelected = !allSelected && trades.some((t) => selectedIds.has(t.id));

  function toggleAll() {
    onToggleAll(
      trades.map((t) => t.id),
      !allSelected
    );
  }

  return (
    <div className="hairline overflow-x-auto rounded-xl bg-panel/40">
      <table className="w-full text-sm border-collapse min-w-[820px]">
        <thead>
          <tr className="hairline-b bg-panel-soft/60 font-mono text-[10px] uppercase text-muted tracking-wider">
            <th className="px-3 py-2.5 w-8">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                aria-label="Select all"
                className="accent-accent cursor-pointer"
              />
            </th>
            <th className="px-3 py-2.5">Date</th>
            <th className="px-3 py-2.5">Symbol</th>
            <th className="px-3 py-2.5">Side</th>
            <th className="px-3 py-2.5 text-right">Entry</th>
            <th className="px-3 py-2.5 text-right">Exit</th>
            <th className="px-3 py-2.5 text-right">Size</th>
            <th className="px-3 py-2.5 text-right">P&amp;L</th>
            <th className="px-3 py-2.5 text-right">R</th>
            <th className="px-3 py-2.5">Tags</th>
            <th className="px-3 py-2.5 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const pnl = t.pnl_dollars ?? 0;
            const isGain = pnl > 0;
            const isLoss = pnl < 0;
            const isOpen = t.status === "open";
            const screenshots: string[] = t.notes?.screenshot_urls?.length
              ? t.notes.screenshot_urls
              : t.notes?.screenshot_url
              ? [t.notes.screenshot_url]
              : [];
            return (
              <tr
                key={t.id}
                onClick={() => onRowClick(t)}
                className="cursor-pointer hover:bg-panel-soft/50 transition-colors hairline-b"
              >
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(t.id)}
                    onChange={() => onToggleSelect(t.id)}
                    aria-label={`Select ${t.symbol}`}
                    className="accent-accent cursor-pointer"
                  />
                </td>
                <td className="px-3 py-2.5 num">
                  {formatDate(t.exit_time ?? t.entry_time)}
                </td>
                <td className="px-3 py-2.5 font-medium">
                  <div className="flex items-center gap-2">
                    <span>{t.symbol}</span>
                    {screenshots.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImages(screenshots);
                          setLightboxTitle(`${t.symbol} Screenshots`);
                          setLightboxOpen(true);
                        }}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors cursor-pointer shrink-0"
                        title={`View ${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""}`}
                      >
                        <CameraIcon className="w-3 h-3" />
                        <span>{screenshots.length}</span>
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className={
                      t.direction === "long" ? "text-gain" : "text-loss"
                    }
                  >
                    {t.direction === "long" ? "Long" : "Short"}
                  </span>
                </td>
                <td className="px-3 py-2.5 num">{num(t.entry_price)}</td>
                <td className="px-3 py-2.5 num">
                  {t.exit_price != null ? num(t.exit_price) : null}
                  {isOpen && (
                    <span className="text-muted text-xs ml-1">open</span>
                  )}
                </td>
                <td className="px-3 py-2.5 num">{num(t.size)}</td>
                <td
                  className={`px-3 py-2.5 num font-medium ${
                    isGain ? "text-gain" : isLoss ? "text-loss" : ""
                  }`}
                >
                  {isOpen ? "—" : `${pnl >= 0 ? "+" : "-"}${money(Math.abs(pnl))}`}
                </td>
                <td
                  className={`px-3 py-2.5 num ${
                    isGain ? "text-gain" : isLoss ? "text-loss" : ""
                  }`}
                >
                  {isOpen ? "—" : r(t.r_multiple)}
                </td>
                <td className="px-3 py-2.5">
                  {t.tags.length ? (
                    <div className="flex flex-wrap gap-1">
                      {t.tags.map((tg) => (
                        <span
                          key={tg.id}
                          className="hairline px-1.5 py-0.5 text-xs text-muted"
                        >
                          {tg.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td
                  className="px-3 py-2.5 text-right whitespace-nowrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-end gap-1.5">
                    {/* Chart */}
                    <button
                      type="button"
                      onClick={() => onChart(t)}
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-accent hover:bg-accent/10 border border-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
                      title={`Open ${t.symbol} interactive chart`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18" />
                        <path d="M18 17V9" />
                        <path d="M13 17V5" />
                        <path d="M8 17v-3" />
                      </svg>
                      <span>Chart</span>
                    </button>

                    {/* View */}
                    <button
                      type="button"
                      onClick={() => onView(t)}
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted hover:text-text hover:bg-panel-soft border border-line transition-colors flex items-center gap-1 cursor-pointer"
                      title="View full trade details & screenshot"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      <span>View</span>
                    </button>

                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => onEdit(t)}
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-amber-400 hover:bg-amber-400/10 border border-amber-400/20 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Modify trade"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      <span>Edit</span>
                    </button>

                    {/* Delete / Archive */}
                    <button
                      type="button"
                      onClick={() => onDelete(t)}
                      className="p-1 rounded text-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer"
                      title="Archive trade"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ImageLightboxModal
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={lightboxImages}
        title={lightboxTitle}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function num(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 4 });
}