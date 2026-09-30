import { sideForTrigger, type TradeSideCandidate } from "./types";

export interface PnlResult {
  realizedPnlUsd: number | null;
  realizedPnlPct: number | null;
  positionSize: number | null;
  notional: number | null;
}

/**
 * Calculates PnL in USD and PnL percentage (return on margin) for a trade position.
 * 
 *   notional  = margin × leverage
 *   position  = notional ÷ entry
 *   P&L USD   = sign × position × (exit - entry)
 *   P&L %     = sign × (exit ÷ entry - 1) × leverage
 */
export function calculateTradePnl(
  entryPrice: number | null,
  exitPrice: number | null,
  triggerDirection: "above" | "below" | null | undefined,
  marginUsd: number | null | undefined,
  leverage: number | null | undefined,
  candidate?: TradeSideCandidate | null
): PnlResult {
  if (
    entryPrice == null ||
    entryPrice <= 0 ||
    exitPrice == null ||
    exitPrice <= 0
  ) {
    return { realizedPnlUsd: null, realizedPnlPct: null, positionSize: null, notional: null };
  }

  const side = sideForTrigger(triggerDirection, candidate ?? { entry_price: entryPrice });
  const margin = marginUsd != null && marginUsd > 0 ? marginUsd : 1;
  const lev = leverage != null && leverage > 0 ? leverage : 1;
  const sign = side === "long" ? 1 : -1;

  const notional = margin * lev;
  const positionSize = notional / entryPrice;
  const realizedPnlUsd = sign * positionSize * (exitPrice - entryPrice);
  const realizedPnlPct = sign * (exitPrice / entryPrice - 1) * lev;

  return {
    realizedPnlUsd,
    realizedPnlPct,
    positionSize,
    notional,
  };
}
