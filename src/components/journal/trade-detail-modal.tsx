"use client";

import { useEffect, useState } from "react";
import type { TradeWithExtras } from "@/lib/types";
import { money, percent, r, fmtPx } from "@/lib/format";
import { ModalShell } from "@/components/ui/modal-shell";
import { normalizeScreenshotUrl } from "@/lib/screenshot-helpers";
import { MultiScreenshotUploader } from "@/components/ui/multi-screenshot-uploader";

interface Props {
  trade: TradeWithExtras;
  onClose: () => void;
  onDelete: (id: string) => Promise<void>;
  onEdit: (t: TradeWithExtras) => void;
  onChart?: (t: TradeWithExtras) => void;
}

export function TradeDetailModal({ trade, onClose, onDelete, onEdit, onChart }: Props) {
  const pnl = trade.pnl_dollars ?? 0;
  const pct = trade.pnl_pct ?? 0;
  const isGain = pnl > 0;
  const isLoss = pnl < 0;
  const isOpen = trade.status === "open";

  const initialScreenshots: string[] = trade.notes?.screenshot_urls?.length
    ? trade.notes.screenshot_urls
    : trade.notes?.screenshot_url
    ? [normalizeScreenshotUrl(trade.notes.screenshot_url)]
    : [];
  const [screenshots, setScreenshots] = useState<string[]>(initialScreenshots);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleScreenshotsChange = async (nextUrls: string[]) => {
    setScreenshots(nextUrls);
    try {
      await fetch(`/api/trades/${trade.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          screenshot_url: nextUrls[0] ?? null,
          screenshot_urls: nextUrls,
        }),
      });
    } catch (err) {
      console.error("Failed to update screenshots:", err);
    }
  };

  const notional = (trade.entry_price ?? 0) * (trade.size ?? 0);
  const lev = trade.leverage != null && trade.leverage > 0 ? trade.leverage : 1;
  const margin = notional / lev;

  const stat = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium font-mono">{value}</span>
    </div>
  );

  return (
    <>
      <ModalShell title={`${trade.symbol} · ${trade.direction.toUpperCase()}${lev > 1 ? ` · ${lev}x` : ""}`} onClose={onClose} disableClickOutside={true}>
        <div className="flex flex-col gap-5">
          {/* Big P&L */}
          <div className="hairline-b pb-4">
            <div className="text-xs text-muted uppercase tracking-wide mb-1 font-mono">
              Realized P&amp;L
            </div>
            <div
              className={`num text-4xl font-semibold font-mono ${
                isGain ? "text-gain" : isLoss ? "text-loss" : "text-text"
              }`}
            >
              {isOpen ? "— · open" : pnl >= 0 ? "+" : ""}
              {isOpen ? "" : money(Math.abs(pnl))}
            </div>
            {!isOpen && (
              <div
                className={`num text-sm mt-1 font-mono ${
                  isGain ? "text-gain" : isLoss ? "text-loss" : "text-muted"
                }`}
              >
                {percent(pct)} ROE · {r(trade.r_multiple)}
              </div>
            )}
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {stat("Entry", fmtPx(trade.entry_price))}
            {stat("Exit", trade.exit_price != null ? fmtPx(trade.exit_price) : "— (Open)")}
            {stat("Size", trade.size)}
            {stat("Position Value", money(notional))}
            {stat("Leverage", lev > 1 ? `${lev}x` : "1x (Spot)")}
            {stat("Margin", money(margin))}
            {stat("Stop", trade.stop_price != null ? fmtPx(trade.stop_price) : "—")}
            {stat("Fees", money(trade.fees))}
            {stat(
              "R-Multiple",
              trade.r_multiple != null ? r(trade.r_multiple) : "—"
            )}
          </div>

          {/* Tags */}
          <div>
            <div className="text-xs text-muted mb-1 font-mono uppercase">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {trade.tags.length ? (
                trade.tags.map((tg) => (
                  <span key={tg.id} className="hairline px-2 py-0.5 text-xs rounded bg-panel-soft">
                    {tg.name}
                  </span>
                ))
              ) : (
                <span className="text-muted text-xs">—</span>
              )}
            </div>
          </div>

          {/* Notes */}
          {(trade.notes?.pre_trade_thesis ||
            trade.notes?.post_trade_review ||
            trade.notes?.discipline_score != null) && (
            <div className="flex flex-col gap-3">
              {trade.notes?.pre_trade_thesis && (
                <div>
                  <div className="text-xs text-muted mb-1 font-mono uppercase">
                    Pre-trade thesis
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap bg-panel-soft/40 p-2.5 rounded border border-line">
                    {trade.notes.pre_trade_thesis}
                  </p>
                </div>
              )}
              {trade.notes?.post_trade_review && (
                <div>
                  <div className="text-xs text-muted mb-1 font-mono uppercase">
                    Post-trade review
                  </div>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap bg-panel-soft/40 p-2.5 rounded border border-line">
                    {trade.notes.post_trade_review}
                  </p>
                </div>
              )}
              {trade.notes?.discipline_score != null && (
                <div>
                  <div className="text-xs text-muted mb-1 font-mono uppercase">Discipline</div>
                  <div className="text-base text-amber-400">
                    {"★".repeat(trade.notes.discipline_score)}
                    <span className="text-muted/40">
                      {"★".repeat(5 - trade.notes.discipline_score)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Screenshot Section (1–5 images with auto-compression) */}
          <div className="hairline-t pt-4">
            <MultiScreenshotUploader
              urls={screenshots}
              onChange={handleScreenshotsChange}
              maxFiles={5}
              entityId={`trade-${trade.id}`}
              label="Chart Screenshots (1–5 images)"
              helpText="Paste (Ctrl+V) or upload up to 5 screenshots. Auto-compressed 85–95%."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center pt-3 hairline-t">
            {confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted">Delete this trade?</span>
                <button
                  type="button"
                  className="px-2.5 py-1 border border-loss text-loss rounded text-xs cursor-pointer hover:bg-loss/10"
                  onClick={() => onDelete(trade.id)}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  className="py-1 text-muted hover:text-text text-xs cursor-pointer"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-loss hover:underline cursor-pointer"
                onClick={() => setConfirmDelete(true)}
              >
                Archive Trade
              </button>
            )}

            <div className="flex items-center gap-2">
              {onChart && (
                <button
                  type="button"
                  onClick={() => onChart(trade)}
                  className="px-3 py-1.5 text-xs font-mono font-medium text-accent hover:bg-accent/10 border border-accent/25 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 3v18h18" />
                    <path d="M18 17V9" />
                    <path d="M13 17V5" />
                    <path d="M8 17v-3" />
                  </svg>
                  <span>Chart</span>
                </button>
              )}

              <button
                type="button"
                className="px-4 py-1.5 text-xs accent-btn font-semibold rounded-lg cursor-pointer"
                onClick={() => onEdit(trade)}
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      </ModalShell>
    </>
  );
}