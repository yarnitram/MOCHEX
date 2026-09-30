"use client";

import { useState } from "react";
import { sideForTrigger, type TradeAlert } from "@/lib/types";
import { ChartModal } from "@/components/charts/chart-modal";
import { ImageLightboxModal } from "@/components/ui/image-lightbox-modal";
import { getContractDetail, type ContractDetail } from "./trades-client";
import type { FuturesDetail } from "@/app/api/mexc/futures/route";

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
  closedAlerts: TradeAlert[];
  details?: Record<string, FuturesDetail | ContractDetail>;
  onEdit: (alert: TradeAlert) => void;
  onArchive: (alert: TradeAlert) => void;
}

function formatSymbol(sym: string): string {
  return sym.replace(/_USDT$/i, "");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ClosedTradesTab({ closedAlerts, details, onEdit, onArchive }: Props) {
  const [chartItem, setChartItem] = useState<TradeAlert | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [lightboxTitle, setLightboxTitle] = useState("");

  if (closedAlerts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-line rounded-xl bg-panel/30">
        <span className="text-3xl mb-2">🏁</span>
        <h3 className="text-sm font-semibold text-text">No Closed Trades</h3>
        <p className="text-xs text-muted max-w-sm mt-1">
          When trades hit their Stop-Loss/Take-Profit target or are closed manually, they will appear here in your history.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl hairline bg-panel/40 striped">
      <table className="w-full text-left text-xs">
        <thead className="hairline-b bg-panel-soft/60 font-mono text-[10px] uppercase text-muted tracking-wider">
          <tr>
            <th className="py-3 px-4">Coin</th>
            <th className="py-3 px-4">Side</th>
            <th className="py-3 px-4">Leverage</th>
            <th className="py-3 px-4">Entry</th>
            <th className="py-3 px-4">Exit</th>
            <th className="py-3 px-4">Realized PnL ($)</th>
            <th className="py-3 px-4">Realized PnL (%)</th>
            <th className="py-3 px-4">Exit Reason</th>
            <th className="py-3 px-4">Closed Date</th>
            <th className="py-3 px-4 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {closedAlerts.map((row) => {
            const side = sideForTrigger(row.trigger_direction, row);
            const entry = row.entry_price ?? row.fired_price;
            const detail = getContractDetail(details, row.symbol);
            const maxLev = detail?.maxLeverage ?? null;
            const effectiveLeverage =
              row.leverage != null && row.leverage > 0
                ? row.leverage
                : maxLev ?? 1;
            const isMaxLev = row.leverage == null && maxLev != null;
            const margin = row.margin_usd ?? 1;
            const sign = side === "long" ? 1 : -1;

            // Compute or resolve leveraged PnL
            let pnlUsd = row.realized_pnl_usd;
            let pnlPct = row.realized_pnl_pct;

            // If stored realized_pnl_pct was unleveraged or missing (stored with lev = 1 or null),
            // and effectiveLeverage > 1, recalculate based on the effective leverage
            if (entry != null && row.exit_price != null && entry > 0) {
              const notional = margin * effectiveLeverage;
              const posSize = notional / entry;
              pnlUsd = sign * posSize * (row.exit_price - entry);
              pnlPct = sign * (row.exit_price / entry - 1) * effectiveLeverage;
            }

            const isWin = (pnlUsd ?? 0) >= 0;

            const reasonBadge =
              row.closed_reason === "tp_hit"
                ? "bg-gain/15 text-gain border-gain/20"
                : row.closed_reason === "sl_hit"
                ? "bg-loss/15 text-loss border-loss/20"
                : "bg-panel-soft text-muted border-line";

            const reasonLabel =
              row.closed_reason === "tp_hit"
                ? "TP Hit"
                : row.closed_reason === "sl_hit"
                ? "SL Hit"
                : "Manual Close";

            const screenshots: string[] = row.screenshot_urls?.length
              ? row.screenshot_urls
              : row.screenshot_url
              ? [row.screenshot_url]
              : [];

            return (
              <tr key={row.id} className="hover:bg-panel-soft/50 transition-colors">
                <td className="py-3 px-4 font-semibold text-text">
                  <div className="flex items-center gap-2">
                    <span>{formatSymbol(row.symbol)}</span>
                    {screenshots.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLightboxImages(screenshots);
                          setLightboxTitle(`${formatSymbol(row.symbol)} Screenshots`);
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
                <td className="py-3 px-4">
                  <span
                    className={`inline-block font-semibold px-2 py-0.5 rounded text-[11px] border ${
                      side === "long"
                        ? "bg-gain/15 text-gain border-gain/20"
                        : "bg-loss/15 text-loss border-loss/20"
                    }`}
                  >
                    {side.toUpperCase()}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono">
                  <span className="inline-flex items-center text-[11px] font-semibold text-text">
                    {effectiveLeverage}x
                    {isMaxLev && (
                      <span className="text-[10px] text-muted font-normal ml-1">
                        max
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-muted">{entry != null ? entry : "—"}</td>
                <td className="py-3 px-4 font-mono text-text">
                  {row.exit_price != null ? row.exit_price : "—"}
                </td>
                <td
                  className={`py-3 px-4 font-mono font-semibold ${
                    isWin ? "text-gain" : "text-loss"
                  }`}
                >
                  {pnlUsd != null
                    ? `${isWin ? "+" : ""}$${pnlUsd.toFixed(2)}`
                    : "—"}
                </td>
                <td
                  className={`py-3 px-4 font-mono font-semibold ${
                    isWin ? "text-gain" : "text-loss"
                  }`}
                >
                  {pnlPct != null
                    ? `${isWin ? "+" : ""}${(pnlPct * 100).toFixed(2)}%`
                    : "—"}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${reasonBadge}`}
                  >
                    {reasonLabel}
                  </span>
                </td>
                <td className="py-3 px-4 text-muted text-[11px]">{formatDate(row.closed_at)}</td>
                <td className="py-3 px-4 text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setChartItem(row)}
                      title={`Open ${formatSymbol(row.symbol)} interactive chart`}
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-accent hover:bg-accent/10 border border-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 3v18h18" />
                        <path d="M18 17V9" />
                        <path d="M13 17V5" />
                        <path d="M8 17v-3" />
                      </svg>
                      Chart
                    </button>
                    <button
                      type="button"
                      onClick={() => onEdit(row)}
                      title="Edit Trade"
                      className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted hover:text-text hover:bg-panel-soft border border-line transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => onArchive(row)}
                      title="Archive Trade"
                      className="p-1 rounded text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
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

      {chartItem && (
        <ChartModal
          isOpen={!!chartItem}
          onClose={() => setChartItem(null)}
          symbol={chartItem.symbol}
          setup={{
            symbol: chartItem.symbol,
            side: sideForTrigger(chartItem.trigger_direction, chartItem) === "long" ? "LONG" : "SHORT",
            trigger_price: chartItem.trigger_price,
            entry_price: chartItem.entry_price ?? chartItem.fired_price,
            stop_loss: chartItem.stop_loss,
            take_profit: chartItem.take_profit,
            order_type: chartItem.order_type,
          }}
        />
      )}

      <ImageLightboxModal
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        images={lightboxImages}
        title={lightboxTitle}
      />
    </div>
  );
}
