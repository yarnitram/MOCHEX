"use client";

import { useState, type ReactNode } from "react";
import type { WatchlistItem } from "@/lib/types";
import {
  cleanSymbol,
  fmtPct,
  fmtPlanPx,
  fmtPx,
  compact,
  mexcChartUrl,
} from "@/lib/format";
import type { ColKey, Ticker } from "./watchlist-types";
import { ORDER_TYPE_LABELS } from "./watchlist-types";
import { ChartModal } from "@/components/charts/chart-modal";
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

// ---- Prop types ----

export interface WatchlistRowProps {
  item: WatchlistItem;
  /** Live ticker from MEXC, or undefined while loading / unavailable. */
  ticker: Ticker | undefined;
  /** Coin icon URL, or undefined when not yet fetched. */
  iconUrl: string | undefined;
  /** Which columns are currently visible. */
  cols: Record<ColKey, boolean>;
  /** Open the detail/modify modal for this row. */
  onModify: () => void;
  /** Open the remove-confirmation for this row. */
  onRemove: () => void;
}

// ---- JSX render helpers ----

/** Render a plan price (EP / SL / TP) or a muted dash when unset. */
function fmtPlanVal(v: number | null | undefined): ReactNode {
  return v != null ? fmtPlanPx(v) : <span className="text-muted">—</span>;
}

/**
 * Render an ISO timestamp as two stacked lines in SGT (GMT+8):
 * Line 1: `23 Sep 2024`
 * Line 2: `04:12 PM`
 */
function fmtDateTime(iso: string | null | undefined): ReactNode {
  if (!iso) return <span className="text-muted">—</span>;

  const d = new Date(iso);
  if (isNaN(d.getTime())) return <span className="text-muted">—</span>;

  const sgDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);

  const sgTime = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="num">{sgDate}</span>
      <span className="num text-[10px] text-muted">{sgTime}</span>
    </div>
  );
}

// ---- Component ----

export function WatchlistRow({
  item,
  ticker,
  iconUrl,
  cols,
  onModify,
  onRemove,
}: WatchlistRowProps) {
  const [isChartOpen, setIsChartOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const sym = item.symbol.toUpperCase();
  const label = cleanSymbol(sym);
  const colVisible = (key: ColKey) => cols[key] !== false;

  const screenshots: string[] = item.screenshot_urls?.length
    ? item.screenshot_urls
    : item.screenshot_url
    ? [item.screenshot_url]
    : [];

  const side =
    item.entry_price != null && item.stop_loss != null
      ? item.entry_price >= item.stop_loss
        ? "long"
        : "short"
      : item.entry_price != null && item.take_profit != null
      ? item.take_profit >= item.entry_price
        ? "long"
        : "short"
      : item.trigger_direction === "above"
      ? "short"
      : item.trigger_direction === "below"
      ? "long"
      : null;
  const isLong = side === "long";

  return (
    <>
      <tr className="hairline-b hover:bg-panel-soft/50 transition-colors">
        {/* Coin with Icon */}
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
              {iconUrl ? (
                <img
                  src={iconUrl}
                  alt={label}
                  draggable={false}
                  className="size-5 rounded-full object-contain inline-block"
                />
              ) : (
                <span className="flex size-5 items-center justify-center rounded-full bg-panel-soft text-[10px] font-semibold text-muted">
                  {label.charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <button
              type="button"
              onClick={onModify}
              className="text-left group flex flex-col leading-tight"
              title={`View ${label} details`}
            >
              <span className="font-semibold text-text group-hover:text-accent group-hover:underline">
                {label}
              </span>
              <span className="text-[10px] text-muted font-mono">
                {sym.replace("_USDT", "")}
              </span>
            </button>
            {screenshots.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
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

        {/* Position */}
        {colVisible("position") && (
          <td className="px-3 py-2.5">
            {side ? (
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
            ) : (
              <span className="text-muted">—</span>
            )}
          </td>
        )}

        {/* 24 h % change */}
        {colVisible("change") && (
          <td className="px-3 py-2.5 num">
            {ticker ? (
              <span
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono tabular-nums ${
                  ticker.riseFallRate >= 0
                    ? "bg-gain/10 text-gain"
                    : "bg-loss/10 text-loss"
                }`}
              >
                {fmtPct(ticker.riseFallRate)}
              </span>
            ) : (
              "…"
            )}
          </td>
        )}

        {/* Volume (24 h) */}
        {colVisible("volume") && (
          <td className="px-3 py-2.5 num">
            {ticker ? compact(ticker.amount24) : "…"}
          </td>
        )}

        {/* Last price */}
        {colVisible("price") && (
          <td className="px-3 py-2.5 num">
            {ticker ? fmtPx(ticker.lastPrice) : "…"}
          </td>
        )}

        {/* Trigger price */}
        {colVisible("trigger") && (
          <td className="px-3 py-2.5 num text-muted">
            {item.trigger_price != null ? fmtPlanPx(item.trigger_price) : "—"}
          </td>
        )}

        {/* EP / SL / TP */}
        {colVisible("plan") && (
          <td className="px-3 py-2.5">
            <div className="flex flex-col gap-0.5 text-center font-mono tabular-nums leading-tight">
              <span className="whitespace-nowrap">
                <span className="text-[10px] text-muted">EP: </span>
                <span>{fmtPlanVal(item.entry_price)}</span>
              </span>
              <span className="whitespace-nowrap">
                <span className="text-[10px] text-muted">SL: </span>
                <span>{fmtPlanVal(item.stop_loss)}</span>
              </span>
              <span className="whitespace-nowrap">
                <span className="text-[10px] text-muted">TP: </span>
                <span>{fmtPlanVal(item.take_profit)}</span>
              </span>
            </div>
          </td>
        )}

        {/* Order type */}
        {colVisible("orderType") && (
          <td className="px-3 py-2.5 num text-right">
            {item.order_type ? (
              <span className="px-1.5 py-0.5 rounded bg-panel-soft border border-line text-[10px] font-mono text-muted">
                {ORDER_TYPE_LABELS[item.order_type] ?? item.order_type}
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </td>
        )}

        {/* Trigger added timestamp */}
        {colVisible("triggerAdded") && (
          <td className="px-3 py-2.5 num text-muted whitespace-nowrap text-center">
            {item.trigger_price != null
              ? fmtDateTime(item.trigger_created_at)
              : "—"}
          </td>
        )}

        {/* Fired-at timestamp */}
        {colVisible("firedAt") && (
          <td className="px-3 py-2.5 num text-muted whitespace-nowrap text-center">
            {item.alert_fired ? fmtDateTime(item.alert_fired_at) : "—"}
          </td>
        )}

        {/* Status badge */}
        {colVisible("status") && (
          <td className="px-3 py-2.5 text-xs text-center">
            {item.alert_fired ? (
              <span className="inline-flex items-center rounded-md bg-loss/10 px-2 py-0.5 text-xs font-semibold font-mono text-loss">
                ● Triggered
              </span>
            ) : item.trigger_price != null ? (
              <span className="inline-flex items-center rounded-md bg-gain/10 px-2 py-0.5 text-xs font-semibold font-mono text-gain">
                ● Ongoing
              </span>
            ) : (
              <span className="text-muted">—</span>
            )}
          </td>
        )}

        {/* Actions */}
        <td
          className="px-3 py-2.5 text-right whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setIsChartOpen(true)}
              className="px-2 py-1 rounded text-[11px] font-mono font-medium text-accent hover:bg-accent/10 border border-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
              title={`Open ${label} interactive chart with trade setup`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M18 17V9" />
                <path d="M13 17V5" />
                <path d="M8 17v-3" />
              </svg>
              <span>Chart</span>
            </button>

            <button
              type="button"
              onClick={onModify}
              className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted hover:text-text hover:bg-panel-soft border border-line transition-colors flex items-center gap-1 cursor-pointer"
              title={`Modify ${label} alert & plan`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              <span>Modify</span>
            </button>

            <button
              type="button"
              onClick={onRemove}
              className="p-1 rounded text-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer"
              title={`Archive ${label}`}
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
              </svg>
            </button>
          </div>
        </td>
      </tr>

      <ChartModal
        isOpen={isChartOpen}
        onClose={() => setIsChartOpen(false)}
        symbol={item.symbol}
        setup={{
          symbol: item.symbol,
          side: null,
          trigger_price: item.trigger_price,
          entry_price: item.entry_price,
          stop_loss: item.stop_loss,
          take_profit: item.take_profit,
          order_type: item.order_type,
        }}
      />

      <ImageLightboxModal
        images={screenshots}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        title={`${label} Setup Screenshots`}
      />
    </>
  );
}
