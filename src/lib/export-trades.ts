import * as XLSX from "xlsx";
import type { TradeWithExtras } from "./types";

export interface TradeRowData {
  Date: string;
  Symbol: string;
  Side: string;
  Leverage: string;
  Entry: number | "";
  Exit: number | "";
  Size: number;
  "P&L ($)": number | "";
  "P&L (%)": number | "";
  "R-Multiple": number | "";
  Tags: string;
  Notes: string;
  Screenshot: string;
}

/** Build the SheetJS worksheet data for a set of trades. */
export function tradesToRows(trades: TradeWithExtras[]): TradeRowData[] {
  return trades.map((t) => {
    const exit = t.exit_price ?? "";
    const pnl = t.pnl_dollars ?? 0;
    const pnlPctVal = t.pnl_pct ?? 0;
    const rm = t.r_multiple ?? "";
    const notes = [
      t.notes?.pre_trade_thesis,
      t.notes?.post_trade_review,
    ]
      .filter(Boolean)
      .join(" — ");
    const levStr = t.leverage != null && t.leverage > 0 ? `${t.leverage}x` : "1x";
    return {
      Date: (t.exit_time ?? t.entry_time).slice(0, 10),
      Symbol: t.symbol,
      Side: t.direction,
      Leverage: levStr,
      Entry: t.entry_price,
      Exit: exit,
      Size: t.size,
      "P&L ($)": t.status === "closed" ? Math.round(pnl * 100) / 100 : "",
      "P&L (%)": t.status === "closed" ? Math.round(pnlPctVal * 100) / 100 : "",
      "R-Multiple":
        t.status === "closed" && typeof rm === "number"
          ? Math.round(rm * 100) / 100
          : "",
      Tags: t.tags.map((tg) => tg.name).join(", "),
      Notes: notes,
      Screenshot: t.notes?.screenshot_url ? "Yes" : "No",
    };
  });
}

/** Generate an .xlsx workbook and trigger a browser download. */
export function downloadXlsx(
  trades: TradeWithExtras[],
  filename = "mochex-trades.xlsx"
): void {
  const rows = tradesToRows(trades);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Trades");

  // Light column widths for a readable sheet.
  ws["!cols"] = [
    { wch: 12 }, // Date
    { wch: 10 }, // Symbol
    { wch: 8 },  // Side
    { wch: 10 }, // Leverage
    { wch: 12 }, // Entry
    { wch: 12 }, // Exit
    { wch: 10 }, // Size
    { wch: 12 }, // P&L ($)
    { wch: 12 }, // P&L (%)
    { wch: 12 }, // R
    { wch: 24 }, // Tags
    { wch: 50 }, // Notes
    { wch: 12 }, // Screenshot
  ];

  XLSX.writeFile(wb, filename);
}