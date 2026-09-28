"use client";

import { useState, useRef } from "react";
import * as htmlToImage from "html-to-image";
import { ModalShell } from "@/components/ui/modal-shell";
import type { PublicShareItem } from "@/lib/types";
import { cleanSymbol, fmtPlanPx } from "@/lib/format";

interface Props {
  open: boolean;
  onClose: () => void;
  username: string | null;
  title: string;
  slug: string;
  shareType: "watchlist" | "trade";
  item: PublicShareItem;
  lastPrice?: number | null;
}

export function SocialCardModal({
  open,
  onClose,
  username,
  title,
  slug,
  shareType,
  item,
  lastPrice,
}: Props) {
  const [theme, setTheme] = useState<"mochex" | "emerald" | "gold" | "space">("mochex");
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  const sym = cleanSymbol(item.symbol);
  const trigDir = (item.trigger_direction || "above").toLowerCase();
  const side = shareType === "watchlist" ? (trigDir === "below" ? "LONG" : "SHORT") : (trigDir === "below" ? "SHORT" : "LONG");
  const orderType = (item.order_type || (shareType === "watchlist" ? "LIMIT" : "MARKET")).replace("_", " ").toUpperCase();
  const trigPrice = item.trigger_price;

  // Check if triggered
  let isTriggered = false;
  let distText: string | null = null;
  if (lastPrice != null && trigPrice != null && trigPrice > 0) {
    if (trigDir === "above") {
      const dist = ((trigPrice - lastPrice) / lastPrice) * 100;
      if (lastPrice >= trigPrice || dist <= 0) {
        isTriggered = true;
        distText = "Target Hit! 🔥";
      } else {
        distText = `${dist.toFixed(2)}% above current price`;
      }
    } else {
      const dist = ((lastPrice - trigPrice) / lastPrice) * 100;
      if (lastPrice <= trigPrice || dist <= 0) {
        isTriggered = true;
        distText = "Target Hit! 🔥";
      } else {
        distText = `${dist.toFixed(2)}% below current price`;
      }
    }
  }

  // Calculate live PnL for trade setup
  let pnlPct: number | null = null;
  if (shareType === "trade" && lastPrice && item.entry_price && item.entry_price > 0) {
    const dir = side === "LONG" ? 1 : -1;
    pnlPct = dir * ((lastPrice / item.entry_price) - 1) * 100;
  }

  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const blob = await htmlToImage.toBlob(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }
    } catch (err) {
      alert("Failed to copy image: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const dataUrl = await htmlToImage.toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });
      const link = document.createElement("a");
      link.download = `${sym}-${shareType}-setup-${username || "mochex"}.png`;
      link.href = dataUrl;
      link.click();
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 3000);
    } catch (err) {
      alert("Failed to download image: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const getThemeClass = () => {
    switch (theme) {
      case "mochex":
        return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-purple-950/90 border-purple-500/50 text-zinc-100";
      case "gold":
        return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/80 border-amber-500/40 text-zinc-100";
      case "space":
        return "bg-gradient-to-br from-zinc-950 via-slate-900 to-indigo-950/80 border-indigo-500/40 text-zinc-100";
      case "emerald":
      default:
        return "bg-gradient-to-br from-zinc-950 via-zinc-900 to-emerald-950/80 border-emerald-500/40 text-zinc-100";
    }
  };

  return (
    <ModalShell title="📸 Export Social Setup Card" onClose={onClose} maxWidth="max-w-xl" disableClickOutside={true}>
      <div className="flex flex-col gap-5 text-xs max-h-[80vh] overflow-y-auto pr-1">
        {/* Theme Selector */}
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-panel-soft/60 border border-line">
          <span className="font-semibold text-text text-xs">Card Theme Preset</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setTheme("mochex")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                theme === "mochex"
                  ? "bg-accent/25 text-accent border border-accent/50 font-bold"
                  : "bg-panel text-muted hover:text-text border border-line"
              }`}
            >
              💜 MOCHEX Violet
            </button>
            <button
              type="button"
              onClick={() => setTheme("emerald")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                theme === "emerald"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold"
                  : "bg-panel text-muted hover:text-text border border-line"
              }`}
            >
              🟢 Cyber Emerald
            </button>
            <button
              type="button"
              onClick={() => setTheme("gold")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                theme === "gold"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold"
                  : "bg-panel text-muted hover:text-text border border-line"
              }`}
            >
              🟡 Radar Gold
            </button>
            <button
              type="button"
              onClick={() => setTheme("space")}
              className={`px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                theme === "space"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold"
                  : "bg-panel text-muted hover:text-text border border-line"
              }`}
            >
              🔵 Deep Space
            </button>
          </div>
        </div>

        {/* Exportable Card Preview DOM Element */}
        <div className="p-1 rounded-2xl bg-zinc-950 border border-zinc-800 shadow-2xl">
          <div
            ref={cardRef}
            className={`p-6 rounded-xl border flex flex-col gap-5 relative overflow-hidden backdrop-blur-xl ${getThemeClass()}`}
          >
            {/* Ambient Background Glow */}
            <div className="absolute -right-20 -top-20 w-56 h-56 rounded-full blur-3xl opacity-30 bg-emerald-400 pointer-events-none" />

            {/* Top Branding Header */}
            <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-200 bg-clip-text text-transparent">
                  MOCHEX
                </span>
                <span className="text-zinc-600 font-mono">/</span>
                <span className="text-xs text-zinc-300 font-mono font-bold">
                  @{username || "trader"}
                </span>
              </div>

              <span className="text-[10px] font-mono uppercase px-2.5 py-0.5 rounded-full border border-zinc-700/60 bg-zinc-900/90 text-zinc-300 font-semibold">
                {shareType === "watchlist" ? "📡 Watchlist Radar" : "🎯 Trade Setup"}
              </span>
            </div>

            {/* Main Symbol & Badges */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl font-black text-zinc-100">{sym}</span>
                <span className="text-xs font-mono text-zinc-400">USDT</span>
                
                <span
                  className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded border uppercase font-mono ${
                    side === "LONG"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                  }`}
                >
                  {side}
                </span>

                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded border border-zinc-700 bg-zinc-900 text-zinc-300 font-mono uppercase">
                  {orderType}
                </span>
              </div>

              {lastPrice != null && (
                <div className="flex flex-col items-end">
                  <span className="text-xs text-zinc-400 font-medium">MEXC Price</span>
                  <span className="text-base font-mono font-bold text-zinc-100 tabular-nums">
                    ${lastPrice}
                  </span>
                </div>
              )}
            </div>

            {/* Feature Banner: Watchlist Distance OR Trade PnL */}
            {shareType === "watchlist" ? (
              <div
                className={`p-3.5 rounded-xl border flex items-center justify-between ${
                  isTriggered
                    ? "border-amber-400/50 bg-gradient-to-r from-amber-500/20 via-orange-500/10 to-amber-500/20 text-amber-200"
                    : "border-amber-500/30 bg-amber-500/10"
                }`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-300">
                    {isTriggered ? "🎯 TARGET LEVEL HIT" : "Alert Trigger Level"}
                  </span>
                  <span className="text-xs font-mono font-bold text-zinc-100">
                    Alert when price goes{" "}
                    <span className="text-amber-300 font-extrabold uppercase">
                      {trigDir}
                    </span>{" "}
                    ${trigPrice != null ? fmtPlanPx(trigPrice) : "N/A"}
                  </span>
                </div>

                {distText && (
                  <span className="text-xs font-mono font-extrabold text-amber-300">
                    {distText}
                  </span>
                )}
              </div>
            ) : (
              pnlPct != null && (
                <div
                  className={`px-4 py-3 rounded-xl border flex items-center justify-between font-mono ${
                    pnlPct >= 0
                      ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                      : "bg-rose-500/15 border-rose-500/30 text-rose-300"
                  }`}
                >
                  <span className="text-xs font-sans font-semibold text-zinc-200">
                    Live Position PnL
                  </span>
                  <span className="text-lg font-black tracking-tight">
                    {pnlPct >= 0 ? "+" : ""}
                    {pnlPct.toFixed(2)}%
                  </span>
                </div>
              )
            )}

            {/* Target Parameters Grid */}
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-zinc-950/70 border border-zinc-800/80">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Entry Price</span>
                <span className="font-mono text-xs font-bold text-zinc-100">
                  {fmtPlanPx(item.entry_price)}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Stop Loss</span>
                <span className="font-mono text-xs font-bold text-rose-400">
                  {fmtPlanPx(item.stop_loss)}
                </span>
              </div>

              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase font-bold text-zinc-400">Take Profit</span>
                <span className="font-mono text-xs font-bold text-emerald-400">
                  {fmtPlanPx(item.take_profit)}
                </span>
              </div>
            </div>

            {/* Setup Commentary Notes */}
            {item.notes && (
              <p className="text-xs text-zinc-300 leading-relaxed bg-zinc-950/50 p-2.5 rounded-lg border border-zinc-800/60 line-clamp-2">
                "{item.notes}"
              </p>
            )}

            {/* Footer Footprint */}
            <div className="flex items-center justify-between pt-2 border-t border-zinc-800/60 text-[10px] text-zinc-400 font-mono">
              <span>View live setup:</span>
              <span className="font-bold text-accent">
                mochex.io/{username || "handle"}/{slug}
              </span>
            </div>
          </div>
        </div>

        {/* Export Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted hover:text-text cursor-pointer transition-colors"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={handleCopyImage}
            disabled={exporting}
            className="px-4 py-1.5 rounded-lg bg-panel hover:bg-panel-soft text-text border border-line font-semibold text-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-colors"
          >
            <span>📋</span>
            <span>{copied ? "Copied PNG! ✓" : "Copy PNG"}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadImage}
            disabled={exporting}
            className="accent-btn px-4 py-1.5 text-xs font-semibold rounded-lg cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
          >
            <span>⬇️</span>
            <span>{downloaded ? "Downloaded! ✓" : "Download PNG"}</span>
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
