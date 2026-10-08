import type { WatchlistItem, TriggeredWatchlistItem, ArchivedWatchlistItem } from "./types";
import { deriveTradeSide } from "./types";
import { cleanSymbol } from "./format";
import { getOrderTypeLabel, calculateRiskRewardRatio } from "./watchlist-utils";
import type { Ticker } from "@/components/watchlist/watchlist-types";

/**
 * Escapes a single CSV cell value according to RFC-4180:
 * - Wrap with double quotes if it contains commas, double quotes, or newlines.
 * - Escape existing double quotes by doubling them ("").
 */
function escapeCsv(val: unknown): string {
  if (val == null) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Formats an ISO string into Singapore Time (SGT, GMT+8). */
function fmtSgt(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(d) + " SGT";
}

/** Triggers a browser download of a CSV string with UTF-8 BOM. */
function triggerDownload(csvContent: string, filename: string): void {
  // UTF-8 BOM (\uFEFF) ensures Excel and other spreadsheet apps render UTF-8 characters properly
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getTimestampStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${y}${m}${d}_${h}${min}`;
}

/**
 * Export active Watchlist items to a CSV file.
 */
export function exportWatchlistToCsv(
  items: WatchlistItem[],
  live: Record<string, Ticker> = {},
  customFilename?: string
): void {
  if (items.length === 0) return;

  const headers = [
    "Symbol",
    "Coin",
    "Position",
    "Order Type",
    "Trigger Price",
    "Trigger Condition",
    "Entry Price",
    "Stop Loss",
    "Take Profit",
    "TP1 Price",
    "TP2 Price",
    "TP3 Price",
    "Auto BE on TP1",
    "Risk:Reward (R:R)",
    "Current Price",
    "24h Change (%)",
    "24h Volume (USDT)",
    "Status",
    "Notes",
    "Added At (UTC)",
    "Added At (SGT)",
  ];

  const rows = items.map((item) => {
    const sym = item.symbol.toUpperCase();
    const ticker = live[sym];
    const side = deriveTradeSide(item);
    const posStr = side === "long" ? "LONG" : side === "short" ? "SHORT" : "—";
    const rr = calculateRiskRewardRatio(item.entry_price, item.stop_loss, item.take_profit, side);

    const triggerCondition =
      item.trigger_direction === "below"
        ? "Drops to or below (≤)"
        : item.trigger_direction === "above"
        ? "Rises to or above (≥)"
        : "";

    const status = item.alert_fired
      ? "Triggered"
      : item.trigger_price != null
      ? "Armed"
      : "Active";

    const changePct =
      ticker?.riseFallRate != null
        ? `${(ticker.riseFallRate * 100 >= 0 ? "+" : "")}${(ticker.riseFallRate * 100).toFixed(2)}%`
        : "";

    return [
      escapeCsv(item.symbol),
      escapeCsv(cleanSymbol(item.symbol)),
      escapeCsv(posStr),
      escapeCsv(getOrderTypeLabel(item.order_type)),
      escapeCsv(item.trigger_price ?? ""),
      escapeCsv(triggerCondition),
      escapeCsv(item.entry_price ?? ""),
      escapeCsv(item.stop_loss ?? ""),
      escapeCsv(item.take_profit ?? ""),
      escapeCsv(item.tp1_price ?? ""),
      escapeCsv(item.tp2_price ?? ""),
      escapeCsv(item.tp3_price ?? ""),
      escapeCsv(item.auto_be_on_tp1 ? "Yes" : "No"),
      escapeCsv(rr.ratioStr ?? ""),
      escapeCsv(ticker?.lastPrice ?? ""),
      escapeCsv(changePct),
      escapeCsv(ticker?.amount24 ?? ticker?.volume24 ?? ""),
      escapeCsv(status),
      escapeCsv(item.notes ?? ""),
      escapeCsv(item.added_at ?? ""),
      escapeCsv(fmtSgt(item.added_at)),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");
  const filename = customFilename || `mochex_watchlist_${getTimestampStr()}.csv`;
  triggerDownload(csv, filename);
}

/**
 * Export triggered Watchlist items to a CSV file.
 */
export function exportTriggeredWatchlistToCsv(
  items: TriggeredWatchlistItem[],
  customFilename?: string
): void {
  if (items.length === 0) return;

  const headers = [
    "Symbol",
    "Coin",
    "Position",
    "Order Type",
    "Trigger Price",
    "Trigger Condition",
    "Fired Price",
    "Entry Price",
    "Stop Loss",
    "Take Profit",
    "Risk:Reward (R:R)",
    "Fired At (UTC)",
    "Fired At (SGT)",
    "Notes",
  ];

  const rows = items.map((item) => {
    const side = deriveTradeSide(item);
    const posStr = side === "long" ? "LONG" : side === "short" ? "SHORT" : "—";
    const rr = calculateRiskRewardRatio(item.entry_price, item.stop_loss, item.take_profit, side);

    const triggerCondition =
      item.trigger_direction === "below"
        ? "Drops to or below (≤)"
        : item.trigger_direction === "above"
        ? "Rises to or above (≥)"
        : "";

    return [
      escapeCsv(item.symbol),
      escapeCsv(cleanSymbol(item.symbol)),
      escapeCsv(posStr),
      escapeCsv(getOrderTypeLabel(item.order_type)),
      escapeCsv(item.trigger_price ?? ""),
      escapeCsv(triggerCondition),
      escapeCsv(item.fired_price ?? ""),
      escapeCsv(item.entry_price ?? ""),
      escapeCsv(item.stop_loss ?? ""),
      escapeCsv(item.take_profit ?? ""),
      escapeCsv(rr.ratioStr ?? ""),
      escapeCsv(item.fired_at ?? ""),
      escapeCsv(fmtSgt(item.fired_at)),
      escapeCsv(item.notes ?? ""),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");
  const filename = customFilename || `mochex_triggered_${getTimestampStr()}.csv`;
  triggerDownload(csv, filename);
}

/**
 * Export archived Watchlist items to a CSV file.
 */
export function exportArchivedWatchlistToCsv(
  items: ArchivedWatchlistItem[],
  customFilename?: string
): void {
  if (items.length === 0) return;

  const headers = [
    "Symbol",
    "Coin",
    "Archive Source",
    "Position",
    "Order Type",
    "Trigger Price",
    "Trigger Condition",
    "Fired Price",
    "Entry Price",
    "Stop Loss",
    "Take Profit",
    "Risk:Reward (R:R)",
    "Archived At (UTC)",
    "Archived At (SGT)",
    "Notes",
  ];

  const rows = items.map((item) => {
    const side = deriveTradeSide(item);
    const posStr = side === "long" ? "LONG" : side === "short" ? "SHORT" : "—";
    const rr = calculateRiskRewardRatio(item.entry_price, item.stop_loss, item.take_profit, side);

    const triggerCondition =
      item.trigger_direction === "below"
        ? "Drops to or below (≤)"
        : item.trigger_direction === "above"
        ? "Rises to or above (≥)"
        : "";

    const sourceLabel =
      item.archive_source === "active_deleted"
        ? "Active Watchlist"
        : item.archive_source === "triggered_deleted"
        ? "Triggered"
        : item.archive_source;

    return [
      escapeCsv(item.symbol),
      escapeCsv(cleanSymbol(item.symbol)),
      escapeCsv(sourceLabel),
      escapeCsv(posStr),
      escapeCsv(getOrderTypeLabel(item.order_type)),
      escapeCsv(item.trigger_price ?? ""),
      escapeCsv(triggerCondition),
      escapeCsv(item.fired_price ?? ""),
      escapeCsv(item.entry_price ?? ""),
      escapeCsv(item.stop_loss ?? ""),
      escapeCsv(item.take_profit ?? ""),
      escapeCsv(rr.ratioStr ?? ""),
      escapeCsv(item.archived_at ?? ""),
      escapeCsv(fmtSgt(item.archived_at)),
      escapeCsv(item.notes ?? ""),
    ].join(",");
  });

  const csv = [headers.join(","), ...rows].join("\r\n");
  const filename = customFilename || `mochex_archived_${getTimestampStr()}.csv`;
  triggerDownload(csv, filename);
}
