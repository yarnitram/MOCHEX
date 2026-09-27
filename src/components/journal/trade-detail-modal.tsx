"use client";

import { useEffect, useState } from "react";
import type { TradeWithExtras } from "@/lib/types";
import { money, percent, r, fmtPx } from "@/lib/format";
import { ModalShell } from "@/components/ui/modal-shell";
import { normalizeScreenshotUrl, getImageFromClipboard } from "@/lib/screenshot-helpers";

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

  const [screenshot, setScreenshot] = useState<string | null>(
    trade.notes?.screenshot_url ? normalizeScreenshotUrl(trade.notes.screenshot_url) : null
  );
  const [lightbox, setLightbox] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInput, setUrlInput] = useState("");

  // Upload a screenshot file (automatically routes to Google Drive if connected!)
  async function handleUploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tradeId", trade.id);

      const res = await fetch("/api/trades/screenshot", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to upload screenshot");
      }

      const data = await res.json();
      setScreenshot(data.url);
      setShowUrlInput(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
    e.target.value = "";
  }

  // Save a Google Drive or external image URL
  async function handleSaveUrl() {
    if (!urlInput.trim()) return;
    setUploading(true);
    setError(null);
    try {
      const normalized = normalizeScreenshotUrl(urlInput);
      const res = await fetch("/api/trades/screenshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tradeId: trade.id, url: normalized }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save screenshot URL");
      }

      setScreenshot(normalized);
      setUrlInput("");
      setShowUrlInput(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  // Listen for Ctrl+V paste anywhere while the modal is open
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;

      const file = getImageFromClipboard(e);
      if (file) {
        e.preventDefault();
        handleUploadFile(file);
      }
    }
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [trade.id]);

  async function handleRemoveScreenshot() {
    await fetch("/api/trades/screenshot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tradeId: trade.id, url: null }),
    });
    setScreenshot(null);
  }

  const stat = (label: string, value: React.ReactNode) => (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-medium font-mono">{value}</span>
    </div>
  );

  return (
    <>
      <ModalShell title={`${trade.symbol} · ${trade.direction.toUpperCase()}`} onClose={onClose}>
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
                {percent(pct)} · {r(trade.r_multiple)}
              </div>
            )}
          </div>

          {/* Stat grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {stat("Entry", fmtPx(trade.entry_price))}
            {stat("Exit", trade.exit_price != null ? fmtPx(trade.exit_price) : "—")}
            {stat("Size", trade.size)}
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

          {/* Screenshot Section */}
          <div className="hairline-t pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono uppercase text-muted">Chart Screenshot</span>
              <span className="text-[10px] text-muted">
                Tip: Press <kbd className="px-1 py-0.5 rounded bg-canvas border border-line text-[9px] font-mono">Ctrl+V</kbd> to paste from clipboard
              </span>
            </div>

            {screenshot ? (
              <div className="flex flex-col gap-2 items-start">
                <div className="relative group rounded-lg overflow-hidden border border-line max-w-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screenshot}
                    alt={`${trade.symbol} chart screenshot`}
                    onClick={() => setLightbox(true)}
                    className="max-w-full max-h-56 object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                  />
                  <div className="absolute bottom-2 right-2 bg-canvas/90 text-[10px] px-2 py-0.5 rounded border border-line font-mono text-muted">
                    Click to zoom
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs btn-ghost px-2.5 py-1 rounded cursor-pointer border border-line">
                    {uploading ? "Updating…" : "Replace Image"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="text-xs btn-ghost px-2.5 py-1 rounded cursor-pointer border border-line"
                  >
                    Google Drive Link
                  </button>
                  <button
                    type="button"
                    onClick={handleRemoveScreenshot}
                    className="text-xs text-loss hover:underline cursor-pointer ml-1"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="inline-flex items-center gap-1.5 text-xs btn-ghost px-3 py-2 rounded-lg cursor-pointer border border-line hover:border-accent transition-colors">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>{uploading ? "Uploading…" : "+ Upload File / Image"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileInputChange}
                      className="hidden"
                      disabled={uploading}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setShowUrlInput(!showUrlInput)}
                    className="inline-flex items-center gap-1.5 text-xs btn-ghost px-3 py-2 rounded-lg cursor-pointer border border-line hover:border-accent transition-colors"
                  >
                    <span>🔗</span>
                    <span>Paste Google Drive / Web Link</span>
                  </button>
                </div>
              </div>
            )}

            {/* Google Drive / Web URL input drawer */}
            {showUrlInput && (
              <div className="mt-3 p-3 rounded-lg border border-line bg-panel-soft/60 flex flex-col gap-2">
                <span className="text-[11px] font-semibold text-text">
                  Paste Google Drive or Image URL
                </span>
                <p className="text-[10px] text-muted">
                  Paste any public Google Drive share link (<code className="text-accent">drive.google.com/file/d/...</code>) or TradingView snapshot. Mochex will automatically convert it into a direct image.
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    className="flex-1 px-2.5 py-1.5 rounded bg-panel border border-line text-xs font-mono text-text outline-none focus:border-accent"
                  />
                  <button
                    type="button"
                    onClick={handleSaveUrl}
                    disabled={uploading || !urlInput.trim()}
                    className="accent-btn px-3 py-1.5 text-xs font-semibold rounded cursor-pointer whitespace-nowrap disabled:opacity-50"
                  >
                    {uploading ? "Saving…" : "Save Link"}
                  </button>
                </div>
              </div>
            )}

            {error && <div className="text-xs text-loss mt-2">{error}</div>}
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

      {lightbox && screenshot && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center p-6 cursor-zoom-out"
          onClick={() => setLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot}
            alt="Screenshot full view"
            className="max-h-full max-w-full object-contain rounded border border-line"
          />
        </div>
      )}
    </>
  );
}