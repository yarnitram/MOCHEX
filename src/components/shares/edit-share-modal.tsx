"use client";

import { useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import type { PublicShareLink, PublicShareItem } from "@/lib/types";
import { cleanSymbol } from "@/lib/format";

interface Props {
  share: PublicShareLink;
  open: boolean;
  onClose: () => void;
  onSaved: (updated: PublicShareLink) => void;
  username: string | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function EditShareModal({
  share,
  open,
  onClose,
  onSaved,
  username,
}: Props) {
  const [title, setTitle] = useState(share.title);
  const [slug, setSlug] = useState(share.slug);
  const [pageNotes, setPageNotes] = useState(share.notes || "");
  const [isActive, setIsActive] = useState(share.is_active);

  const initialItems: PublicShareItem[] = Array.isArray(share.items) && share.items.length > 0
    ? share.items
    : [
        {
          id: "item-1",
          symbol: share.symbol,
          share_type: share.share_type,
          trigger_price: share.trigger_price,
          trigger_direction: share.trigger_direction,
          order_type: share.order_type,
          entry_price: share.entry_price,
          stop_loss: share.stop_loss,
          take_profit: share.take_profit,
          notes: share.notes,
        },
      ];

  const [items, setItems] = useState<PublicShareItem[]>(initialItems);
  const [customSymbol, setCustomSymbol] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleAddCustomToken = () => {
    const sym = customSymbol.trim().toUpperCase();
    if (!sym) return;
    const formatted = sym.includes("_") ? sym : `${sym}_USDT`;
    const newItem: PublicShareItem = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      symbol: formatted,
      share_type: share.share_type,
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
    if (!title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (items.length === 0) {
      setError("At least 1 coin setup is required on this share page.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/shares/${share.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          is_active: isActive,
          notes: pageNotes.trim() || null,
          items,
        }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save share link");
      }

      const data = await res.json();
      onSaved(data.share);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "hairline bg-panel px-3 py-2 text-xs outline-none focus:border-accent w-full rounded";

  return (
    <ModalShell title={`✏️ Edit ${share.share_type === "watchlist" ? "Watchlist" : "Trade"} Share Page`} onClose={onClose} maxWidth="max-w-2xl" disableClickOutside={true}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-xs max-h-[80vh] overflow-y-auto pr-1">
        {/* Status Active Toggle */}
        <label className="flex items-center justify-between p-3 rounded bg-panel/60 border border-hairline cursor-pointer">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-xs">Public Visibility</span>
            <span className="text-[11px] text-muted">
              {isActive ? "Anyone with the link can view your setup page." : "Page is hidden (Private 404)."}
            </span>
          </div>
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="accent-accent h-4 w-4 cursor-pointer"
          />
        </label>

        {/* Title & Slug */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-muted font-medium">
            Page Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              className={`${inputCls} font-mono`}
              required
            />
          </label>
        </div>

        {/* Live URL Preview */}
        <div className="p-2.5 rounded bg-panel/60 border border-hairline flex flex-col gap-0.5">
          <span className="text-[10px] text-muted">Public Link URL:</span>
          <span className="font-mono text-accent text-xs truncate">
            {typeof window !== "undefined" ? window.location.origin : ""}/{username || "username"}/{slug}
          </span>
        </div>

        {/* Overall Thesis */}
        <label className="flex flex-col gap-1 text-muted font-medium">
          Overall Page Thesis / Description
          <textarea
            rows={2}
            value={pageNotes}
            onChange={(e) => setPageNotes(e.target.value)}
            className={`${inputCls} resize-none`}
          />
        </label>

        {/* Multi-token Items List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-text text-xs">Coins on this Page ({items.length})</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customSymbol}
                onChange={(e) => setCustomSymbol(e.target.value)}
                placeholder="Add coin (e.g. SOL)..."
                className={`${inputCls} font-mono w-36`}
              />
              <button
                type="button"
                onClick={handleAddCustomToken}
                className="px-2.5 py-1.5 bg-panel hover:bg-panel-soft text-text border border-hairline rounded font-semibold text-[11px] whitespace-nowrap cursor-pointer"
              >
                + Add
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {items.map((item, idx) => (
              <div key={item.id} className="p-3 rounded-lg border border-hairline bg-panel/60 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-text">#{idx + 1} {cleanSymbol(item.symbol)}</span>
                    {share.share_type === "watchlist" ? (
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

                {share.share_type === "watchlist" ? (
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
                  placeholder={`Notes/Thesis for ${cleanSymbol(item.symbol)}...`}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
        </div>

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
            disabled={saving || items.length === 0}
            className="accent-btn px-4 py-1.5 text-xs font-semibold rounded cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
