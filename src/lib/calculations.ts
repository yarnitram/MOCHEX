import type {
  AnalyticsSummary,
  Direction,
  Trade,
  TradeWithExtras,
} from "./types";

/** Signed absolute-risk dollars for a trade = |entry - stop| * size. */
function riskDollars(entry: number, stop: number | null, size: number): number {
  if (stop == null) return 0;
  return Math.abs(entry - stop) * size;
}

/**
 * Realized P&L in dollars for a trade.
 * Open trades (no exit) have no realized pnl → returns 0.
 */
export function pnlDollars(t: Partial<Trade>): number {
  if (t.exit_price == null) return 0;
  const entry = t.entry_price ?? 0;
  const exit = t.exit_price;
  const size = t.size ?? 0;
  const fees = t.fees ?? 0;
  const gross =
    t.direction === "short" ? (entry - exit) * size : (exit - entry) * size;
  return gross - fees;
}

/**
 * Extract leverage from post_trade_review text if available.
 * Matches patterns like "Leverage: 20x", "· 100x", "Leverage: 10", etc.
 */
export function resolveLeverageFromNotes(review?: string | null): number | null {
  if (!review || typeof review !== "string") return null;
  const m = review.match(/(?:Leverage:\s*|·\s*)([0-9.]+)\s*x/i);
  if (m) {
    const val = parseFloat(m[1]);
    if (Number.isFinite(val) && val > 0) return val;
  }
  return null;
}

/**
 * P&L as a percentage of margin (Return on Investment / ROE).
 * Incorporates leverage: Margin = Notional / Leverage.
 * PnL % = (pnlDollars / Margin) * 100 = (pnlDollars / Notional) * Leverage * 100.
 */
export function pnlPct(t: Partial<Trade>): number {
  const notional = (t.entry_price ?? 0) * (t.size ?? 0);
  if (notional === 0) return 0;
  const lev = t.leverage != null && t.leverage > 0 ? t.leverage : 1;
  return (pnlDollars(t) / notional) * lev * 100;
}

/**
 * R-multiple: realized P&L divided by the dollar amount risked at the stop.
 * Null when there is no stop or the trade is still open.
 */
export function rMultiple(t: Partial<Trade>): number | null {
  if (t.exit_price == null) return null;
  const risked = riskDollars(
    t.entry_price ?? 0,
    t.stop_price ?? null,
    t.size ?? 0
  );
  if (risked === 0) return null;
  return pnlDollars(t) / risked;
}

/** Attach the computed fields to a trade. Used in lists/details. */
export function enrichTrade<T extends Partial<Trade> & { notes?: { post_trade_review?: string | null } | null }>(t: T): T & {
  pnl_dollars: number;
  pnl_pct: number;
  r_multiple: number | null;
  leverage: number | null;
} {
  const lev =
    t.leverage != null && Number(t.leverage) > 0
      ? Number(t.leverage)
      : resolveLeverageFromNotes(t.notes?.post_trade_review);

  const tradeWithLev = { ...t, leverage: lev };

  return {
    ...tradeWithLev,
    pnl_dollars: pnlDollars(tradeWithLev),
    pnl_pct: pnlPct(tradeWithLev),
    r_multiple: rMultiple(tradeWithLev),
  };
}

function isClosed(t: Trade): boolean {
  return t.status === "closed" && t.exit_price != null;
}

function safeDiv(n: number, d: number): number {
  return d === 0 ? NaN : n / d;
}

function finiteOrNull(v: number): number | null {
  return Number.isFinite(v) ? v : null;
}

/**
 * Build the analytics summary for a set of trades.
 * Only closed trades contribute to performance aggregates.
 */
export function summarizeTrades(trades: TradeWithExtras[]): AnalyticsSummary {
  const closed = trades.filter(isClosed).map(enrichTrade);
  const closedR = closed.filter(
    (t) => t.r_multiple != null && t.exit_time != null
  );

  const winners = closed.filter((t) => t.pnl_dollars > 0);
  const losers = closed.filter((t) => t.pnl_dollars < 0);
  const grossProfit = winners.reduce((s, t) => s + t.pnl_dollars, 0);
  const grossLoss = Math.abs(losers.reduce((s, t) => s + t.pnl_dollars, 0));

  const winRate = closed.length ? winners.length / closed.length : null;

  const profitFactor =
    grossLoss === 0
      ? grossProfit > 0
        ? grossProfit / 1 // all winners → treat as profit factor = profit
        : null
      : grossProfit / grossLoss;

  const rValues = closedR
    .map((t) => t.r_multiple!)
    .filter((r) => r != null && Number.isFinite(r));
  const averageR = rValues.length
    ? rValues.reduce((s, r) => s + r, 0) / rValues.length
    : null;

  const netPnl = closed.reduce((s, t) => s + t.pnl_dollars, 0);
  const expectancy = closed.length ? netPnl / closed.length : null;

  // Performance by tag.
  const byTag: AnalyticsSummary["byTag"] = {};
  const tagWins: Record<string, number> = {};
  for (const trade of closed) {
    for (const tag of trade.tags) {
      const meta = (byTag[tag.name] ??= { count: 0, winRate: null, netPnl: 0 });
      meta.count += 1;
      meta.netPnl += trade.pnl_dollars;
      if (trade.pnl_dollars > 0) tagWins[tag.name] = (tagWins[tag.name] ?? 0) + 1;
    }
  }
  for (const name of Object.keys(byTag)) {
    byTag[name].winRate = byTag[name].count
      ? tagWins[name] / byTag[name].count
      : null;
  }

  // Equity curve (closed, ordered by exit time), cumulative.
  const sorted = closedR
    .slice()
    .sort((a, b) => a.exit_time!.localeCompare(b.exit_time!));
  const equityCurve: AnalyticsSummary["equityCurve"] = [];
  let cumulative = 0;
  for (const t of sorted) {
    cumulative += t.pnl_dollars;
    equityCurve.push({
      date: (t.exit_time as string).slice(0, 10),
      cumulative: Math.round(cumulative * 100) / 100,
    });
  }

  return {
    tradeCount: closed.length,
    winners: winners.length,
    losers: losers.length,
    winRate: winRate == null ? null : Math.round(winRate * 10000) / 10000,
    profitFactor: finiteOrNull(profitFactor == null ? NaN : profitFactor),
    averageR:
      averageR == null ? null : Math.round(averageR * 1000) / 1000,
    expectancy:
      expectancy == null ? null : Math.round(expectancy * 100) / 100,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossLoss: Math.round(grossLoss * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
    byTag,
    equityCurve,
  };
}

/** Direction signed delta used for display only. */
export const directionSign = (d: Direction): 1 | -1 =>
  d === "long" ? 1 : -1;

export { safeDiv };