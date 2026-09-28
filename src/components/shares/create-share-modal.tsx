"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import type { WatchlistItem, TradeAlert, PublicShareLink, PublicShareItem } from "@/lib/types";
import { cleanSymbol, fmtPlanPx } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (share: PublicShareLink) => void;
  username: string | null;
  watchlistItems: WatchlistItem[];
  tradeAlerts: TradeAlert[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function CreateShareModal({
  open,
  onClose,
  onCreated,
  username,
  watchlistItems,
  tradeAlerts,
}: Props) {
  const [shareType, setShareType] = useState<"watchlist" | "trade">("watchlist");
  const [title, setTitle] = useState<string>("");
  const [slug, setSlug] = useState<string>("");
  const [pageNotes, setPageNotes] = useState<string>("");
  const [items, setItems] = useState<PublicShareItem[]>([]);
  const [customSymbol, setCustomSymbol] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  // Filter Watchlist items to ONLY ONGOING (untriggered, alert_fired !== true) AND HAVE A TRIGGER PRICE
  const ongoingWatchlistItems = watchlistItems.filter((w) => {
    const hasTriggerPrice = w.trigger_price != null || w.alert_price != null;
    return !w.alert_fired && hasTriggerPrice;
  });

  const handleShareTypeChange = (type: "watchlist" | "trade") => {
    setShareType(type);
    setItems([]);
    setTitle("");
    setSlug("");
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setSlug(slugify(val));
  };

  const handleToggleImportWatchlist = (w: WatchlistItem, checked: boolean) => {
    if (checked) {
      if (items.some((i) => i.id === w.id)) return;
      const newItem: PublicShareItem = {
        id: w.id,
        symbol: w.symbol,
        share_type: "watchlist",
        trigger_price: w.trigger_price ?? w.alert_price ?? null,
        trigger_direction: w.trigger_direction || "above",
        order_type: w.order_type || "limit",
        entry_price: w.entry_price,
        stop_loss: w.stop_loss,
        take_profit: w.take_profit,
        notes: w.notes || "",
      };
      setItems((prev) => [...prev, newItem]);
      if (!title) {
        const sym = cleanSymbol(w.symbol);
        setTitle(`${sym} Watchlist Radar`);
        setSlug(slugify(`${sym}-watchlist`));
      }
    } else {
      setItems((prev) => prev.filter((i) => i.id !== w.id));
    }
  };

  const handleToggleImportTrade = (t: TradeAlert, checked: boolean) => {
    if (checked) {
      if (items.some((i) => i.id === t.id)) return;
      const newItem: PublicShareItem = {
        id: t.id,
        symbol: t.symbol,
        share_type: "trade",
        trigger_direction: t.trigger_direction,
        entry_price: t.entry_price ?? t.fired_price,
        stop_loss: t.stop_loss,
        take_profit: t.take_profit,
        notes: t.notes || "",
      };
      setItems((prev) => [...prev, newItem]);
      if (!title) {
        const sym = cleanSymbol(t.symbol);
        setTitle(`${sym} Trade Setup`);
        setSlug(slugify(`${sym}-trade-setup`));
      }
    } else {
      setItems((prev) => prev.filter((i) => i.id !== t.id));
    }
  };

  const handleAddCustomToken = () => {
    const sym = customSymbol.trim().toUpperCase();
    if (!sym) return;
    const formatted = sym.includes("_") ? sym : `${sym}_USDT`;
    const newItem: PublicShareItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      symbol: formatted,
      share_type: shareType,
      trigger_price: null,
      trigger_direction: "above",
      entry_price: null,
      stop_loss: null,
      take_profit: null,
      notes: "",
    };
    setItems((prev) => [...prev, newItem]);
    setCustomSymbol("");
  };

  const handleRemoveItem = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleUpdateItem = (id: string, updates: Partial<PublicShareItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...updates } : i))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username) {
      setError("You must set a Username Handle in Settings before publishing share links.");
      return;
    }
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (items.length === 0) {
      setError("Please select or add at least 1 coin setup to this share page.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          share_type: shareType,
          symbol: items.map((i) => i.symbol).join(", "),
          items,
          notes: pageNotes.trim() || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to create share link");
      }

      const data = await res.json();
      onCreated(data.share);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    "hairline bg-panel px-3 py-2 text-xs outline-none focus:border-accent w-full rounded";

  return (
    <ModalShell title="🔗 Create Public Share Page" onClose={onClose} maxWidth="max-w-2xl" disableClickOutside={true}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5 text-xs max-h-[80vh] overflow-y-auto pr-1">
        {!username && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            ⚠️ You need to set a Username Handle in Settings first to generate public URLs.
          </div>
        )}

        {/* 1. Page Share Type Selector (Watchlist vs Trades) */}
        <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-panel/60 border border-hairline">
          <span className="font-semibold text-text text-xs">Select Share Page Type</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleShareTypeChange("watchlist")}
              className={`p-3 rounded-lg border flex flex-col gap-1 text-left cursor-pointer transition-colors ${
                shareType === "watchlist"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-300"
                  : "bg-panel border-hairline text-muted hover:text-text"
              }`}
            >
              <div className="flex items-center justify-between font-bold text-xs">
                <span>📡 Public Watchlist Page</span>
                {shareType === "watchlist" && <span>✓</span>}
              </div>
              <span className="text-[11px] opacity-80">
                Share ongoing radar tokens with trigger levels, distance to alert, and pre-trade thesis.
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleShareTypeChange("trade")}
              className={`p-3 rounded-lg border flex flex-col gap-1 text-left cursor-pointer transition-colors ${
                shareType === "trade"
                  ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                  : "bg-panel border-hairline text-muted hover:text-text"
              }`}
            >
              <div className="flex items-center justify-between font-bold text-xs">
                <span>🎯 Public Trades Page</span>
                {shareType === "trade" && <span>✓</span>}
              </div>
              <span className="text-[11px] opacity-80">
                Share active/closed trade positions with live PnL %, targets, R:R ratio, and post-entry review.
              </span>
            </button>
          </div>
        </div>

        {/* Title & Slug */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-muted font-medium">
            Page Title *
            <input
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder={shareType === "watchlist" ? "e.g. Solana Ecosystem Watchlist Radar" : "e.g. SOL & BTC Active Trade Setups"}
              className={inputCls}
              required
            />
          </label>

          <label className="flex flex-col gap-1 text-muted font-medium">
            URL Slug
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              placeholder="e.g. solana-watchlist-radar"
              className={`${inputCls} font-mono`}
              required
            />
          </label>
        </div>

        {/* Live URL Preview */}
        <div className="p-2.5 rounded bg-panel/60 border border-hairline flex flex-col gap-0.5">
          <span className="text-[10px] text-muted">Public Link Preview:</span>
          <span className="font-mono text-accent text-xs truncate">
            {typeof window !== "undefined" ? window.location.origin : ""}/{username || "username"}/{slug || "slug"}
          </span>
        </div>

        {/* Overall Page Thesis */}
        <label className="flex flex-col gap-1 text-muted font-medium">
          Overall Page Commentary / Intro Thesis (Optional)
          <textarea
            rows={2}
            value={pageNotes}
            onChange={(e) => setPageNotes(e.target.value)}
            placeholder="Share your general market outlook for this list..."
            className={`${inputCls} resize-none`}
          />
        </label>

        {/* Import Coins Checklist Section */}
        <div className="flex flex-col gap-3 p-3.5 rounded-xl bg-panel/40 border border-hairline">
          <span className="font-semibold text-text text-xs">
            Select {shareType === "watchlist" ? "Ongoing Watchlist Tokens" : "Trade Alerts"} ({items.length} selected)
          </span>

          {/* Quick Add Custom Token */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={customSymbol}
              onChange={(e) => setCustomSymbol(e.target.value)}
              placeholder="Or enter coin symbol (e.g. SOL, BTC)..."
              className={`${inputCls} font-mono max-w-xs`}
            />
            <button
              type="button"
              onClick={handleAddCustomToken}
              className="px-3 py-2 bg-panel hover:bg-panel-soft text-text border border-hairline rounded font-semibold text-xs whitespace-nowrap cursor-pointer"
            >
              + Add Custom Coin
            </button>
          </div>

          {/* Items Checklist Grid */}
          <div className="max-h-40 overflow-y-auto p-2.5 border border-hairline rounded bg-panel/20 flex flex-col gap-2">
            {shareType === "watchlist" ? (
              ongoingWatchlistItems.length === 0 ? (
                <span className="text-[11px] text-muted p-2 text-center">
                  {watchlistItems.length > 0
                    ? "No ongoing watchlist tokens with a Trigger Price set. Please set a Trigger Price on your watchlist items to include them!"
                    : "No active ongoing watchlist coins available. Add coins to your Watchlist first!"}
                </span>
              ) : (
                ongoingWatchlistItems.map((w) => {
                  const isChecked = items.some((i) => i.id === w.id);
                  return (
                    <label key={w.id} className="flex items-center justify-between p-1.5 rounded hover:bg-panel/60 cursor-pointer text-xs">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleImportWatchlist(w, e.target.checked)}
                          className="accent-accent h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="font-bold text-text">{cleanSymbol(w.symbol)}</span>
                        <span className="text-[10px] text-amber-400 font-mono">
                          Trigger: {w.trigger_direction?.toUpperCase() || "ABOVE"} ${w.trigger_price ?? w.alert_price ?? "N/A"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted font-mono uppercase">Ongoing</span>
                    </label>
                  );
                })
              )
            ) : (
              tradeAlerts.length === 0 ? (
                <span className="text-[11px] text-muted p-2 text-center">
                  No active trade alerts available.
                </span>
              ) : (
                tradeAlerts.map((t) => {
                  const isChecked = items.some((i) => i.id === t.id);
                  return (
                    <label key={t.id} className="flex items-center justify-between p-1.5 rounded hover:bg-panel/60 cursor-pointer text-xs">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleToggleImportTrade(t, e.target.checked)}
                          className="accent-accent h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className="font-bold text-text">{cleanSymbol(t.symbol)}</span>
                        <span className="text-[10px] text-emerald-400 font-mono">
                          {t.trigger_direction?.toUpperCase() || "LONG"} · EP ${t.entry_price ?? t.fired_price ?? "N/A"}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted font-mono uppercase">{t.status}</span>
                    </label>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Selected Items Config Editor */}
        {items.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="font-semibold text-text text-xs">Configure Selected {shareType === "watchlist" ? "Watchlist Radar Levels" : "Trade Positions"}</span>
            <div className="flex flex-col gap-3">
              {items.map((item, idx) => (
                <div key={item.id} className="p-3 rounded-lg border border-hairline bg-panel/60 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-text">#{idx + 1} {cleanSymbol(item.symbol)}</span>
                      {shareType === "watchlist" ? (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateItem(item.id, {
                              trigger_direction: item.trigger_direction === "below" ? "above" : "below",
                            })
                          }
                          className="text-[10px] font-bold px-2 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-300 cursor-pointer"
                        >
                          ALERT WHEN {item.trigger_direction === "below" ? "BELOW" : "ABOVE"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateItem(item.id, {
                              trigger_direction: item.trigger_direction === "below" ? "above" : "below",
                            })
                          }
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border cursor-pointer ${
                            item.trigger_direction === "below"
                              ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {item.trigger_direction === "below" ? "SHORT" : "LONG"}
                        </button>
                      )}

                      {/* Order Type Selector */}
                      <select
                        value={item.order_type || "limit"}
                        onChange={(e) => handleUpdateItem(item.id, { order_type: e.target.value })}
                        className="hairline bg-panel px-2 py-0.5 text-[10px] font-mono outline-none rounded text-muted focus:text-text cursor-pointer"
                      >
                        <option value="limit">LIMIT</option>
                        <option value="trigger_limit">TRIGGER LIMIT</option>
                        <option value="market">MARKET</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.id)}
                      className="text-xs text-muted hover:text-rose-400 cursor-pointer"
                    >
                      ✕ Remove
                    </button>
                  </div>

                  {shareType === "watchlist" ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Trigger Price ($)
                        <input
                          type="number"
                          step="any"
                          value={item.trigger_price != null ? String(item.trigger_price) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              trigger_price: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Planned Entry ($)
                        <input
                          type="number"
                          step="any"
                          value={item.entry_price != null ? String(item.entry_price) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              entry_price: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Stop Loss ($)
                        <input
                          type="number"
                          step="any"
                          value={item.stop_loss != null ? String(item.stop_loss) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              stop_loss: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Take Profit ($)
                        <input
                          type="number"
                          step="any"
                          value={item.take_profit != null ? String(item.take_profit) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              take_profit: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Entry Price ($)
                        <input
                          type="number"
                          step="any"
                          value={item.entry_price != null ? String(item.entry_price) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              entry_price: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Stop Loss ($)
                        <input
                          type="number"
                          step="any"
                          value={item.stop_loss != null ? String(item.stop_loss) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              stop_loss: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>

                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Take Profit ($)
                        <input
                          type="number"
                          step="any"
                          value={item.take_profit != null ? String(item.take_profit) : ""}
                          onChange={(e) =>
                            handleUpdateItem(item.id, {
                              take_profit: e.target.value ? Number(e.target.value) : null,
                            })
                          }
                          className={`${inputCls} font-mono`}
                          placeholder="0.00"
                        />
                      </label>
                    </div>
                  )}

                  <input
                    type="text"
                    value={item.notes || ""}
                    onChange={(e) => handleUpdateItem(item.id, { notes: e.target.value })}
                    placeholder={`Pre-trade thesis / notes for ${cleanSymbol(item.symbol)}...`}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-hairline">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted hover:text-text cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !username || items.length === 0}
            className="accent-btn px-4 py-1.5 text-xs font-semibold rounded cursor-pointer disabled:opacity-50"
          >
            {submitting ? "Publishing…" : `🚀 Publish ${items.length} ${shareType === "watchlist" ? "Watchlist" : "Trade"} Page`}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
