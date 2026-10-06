"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  InteractiveCandlestickChart,
  TradeSetupOverlay,
} from "./interactive-candlestick-chart";
import { cleanSymbol, fmtPx, mexcChartUrl } from "@/lib/format";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  setup?: TradeSetupOverlay | null;
  isPublic?: boolean;
  maxLeverage?: number | null;
}

export function ChartModal({ isOpen, onClose, symbol, setup, isPublic = false, maxLeverage }: Props) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!isOpen || !mounted) return null;

  const cleanSym = cleanSymbol(symbol);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`relative w-full bg-panel border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
          isMaximized
            ? "max-w-[96vw] h-[94vh]"
            : "max-w-6xl max-h-[92vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="px-6 py-3.5 bg-panel-soft/80 border-b border-line flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/30 text-accent flex items-center justify-center text-lg font-bold">
              📈
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-extrabold text-text font-mono">
                  {cleanSym} / USDT
                </h3>
                {maxLeverage != null && maxLeverage > 0 && (
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                    <span>⚡</span>
                    <span>{maxLeverage}x</span>
                  </span>
                )}
                {setup?.order_type && (
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-panel text-text border border-line">
                    {setup.order_type}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted">
                Interactive MEXC Candlestick Chart & Trade Plan Overlay
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Open Dedicated Page Link (Private logged-in users only) */}
            {!isPublic && (
              <Link
                href={`/chart/${encodeURIComponent(cleanSym)}`}
                target="_blank"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 rounded-xl transition-colors"
                title="Open dedicated full-screen chart page in new tab"
              >
                <span>↗️ Dedicated Page</span>
              </Link>
            )}

            {/* External MEXC Link */}
            <a
              href={mexcChartUrl(symbol)}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-panel hover:bg-panel-soft text-text border border-line rounded-xl transition-colors"
              title="View on MEXC Exchange"
            >
              <span>MEXC Chart</span>
            </a>

            {/* Maximize / Restore Toggle Button */}
            <button
              onClick={() => setIsMaximized((prev) => !prev)}
              className="p-1.5 text-muted hover:text-text rounded-lg hover:bg-panel-soft border border-line transition-colors"
              title={isMaximized ? "Restore Modal Size" : "Maximize Modal to Full Screen"}
            >
              {isMaximized ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M4 10h6m0 0V4m0 6L3 3m17 7h-6m0 0V4m0 6l7-7" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6m0 0v6m0-6L14 10M9 21H3m0 0v-6m0 6l7-7M3 9V3m0 0h6m-6 0l7 7m11 11v-6m0 6h-6m6 0l-7-7" />
                </svg>
              )}
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-muted hover:text-text rounded-lg hover:bg-panel-soft border border-line transition-colors"
              title="Close Modal"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Setup Level Badges Bar if setup exists */}
        {setup && (
          <div className="px-6 py-2 bg-panel-soft/40 border-b border-line flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="text-muted text-xs font-sans font-medium">Active Setup Levels:</span>
            {setup.trigger_price && setup.trigger_price > 0 && (
              <span className="px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <span>⚡ Trigger:</span>
                <strong>{fmtPx(setup.trigger_price)}</strong>
              </span>
            )}
            {setup.entry_price && setup.entry_price > 0 && (
              <span className="px-2.5 py-1 rounded-md bg-accent/15 text-accent border border-accent/30 flex items-center gap-1">
                <span>🎯 Entry:</span>
                <strong>{fmtPx(setup.entry_price)}</strong>
              </span>
            )}
            {setup.stop_loss && setup.stop_loss > 0 && (
              <span className="px-2.5 py-1 rounded-md bg-loss/15 text-loss border border-loss/30 flex items-center gap-1">
                <span>🛑 SL:</span>
                <strong>{fmtPx(setup.stop_loss)}</strong>
              </span>
            )}
            {setup.take_profit && setup.take_profit > 0 && (
              <span className="px-2.5 py-1 rounded-md bg-gain/15 text-gain border border-gain/30 flex items-center gap-1">
                <span>🏁 TP:</span>
                <strong>{fmtPx(setup.take_profit)}</strong>
              </span>
            )}
          </div>
        )}

        {/* Modal Chart Body */}
        <div className="p-3 sm:p-5 flex-1 overflow-y-auto">
          <InteractiveCandlestickChart
            symbol={symbol}
            setup={setup}
            height={isMaximized ? 700 : 520}
            showOverlayToggle={true}
            maxLeverage={maxLeverage}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
