import { deriveTradeSide, type TradeSide, type OrderType } from "./types";
import { fmtPx } from "./format";

export interface RiskRewardResult {
  ratioStr: string | null;
  numericRatio: number | null;
  risk: number | null;
  reward: number | null;
  warning: string | null;
}

/**
 * Calculates Risk/Reward ratio and directional validation warnings.
 */
export function calculateRiskRewardRatio(
  entryPrice: number | null | undefined,
  stopLoss: number | null | undefined,
  takeProfit: number | null | undefined,
  positionOverride?: TradeSide
): RiskRewardResult {
  if (
    entryPrice == null ||
    stopLoss == null ||
    takeProfit == null ||
    isNaN(entryPrice) ||
    isNaN(stopLoss) ||
    isNaN(takeProfit) ||
    entryPrice <= 0 ||
    stopLoss <= 0 ||
    takeProfit <= 0
  ) {
    return { ratioStr: null, numericRatio: null, risk: null, reward: null, warning: null };
  }

  const side = positionOverride ?? deriveTradeSide({ entry_price: entryPrice, stop_loss: stopLoss, take_profit: takeProfit });
  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(takeProfit - entryPrice);

  let ratioStr: string | null = null;
  let numericRatio: number | null = null;
  if (risk > 0) {
    const val = reward / risk;
    numericRatio = val;
    ratioStr = `1:${val.toFixed(2)}`;
  }

  let warning: string | null = null;
  if (side === "long") {
    if (stopLoss >= entryPrice) {
      warning = "For a LONG setup, Stop Loss should be below Entry Price.";
    } else if (takeProfit <= entryPrice) {
      warning = "For a LONG setup, Take Profit should be above Entry Price.";
    }
  } else {
    if (stopLoss <= entryPrice) {
      warning = "For a SHORT setup, Stop Loss should be above Entry Price.";
    } else if (takeProfit >= entryPrice) {
      warning = "For a SHORT setup, Take Profit should be below Entry Price.";
    }
  }

  return { ratioStr, numericRatio, risk, reward, warning };
}

export interface TriggerDistanceResult {
  distance: number | null;
  pct: number | null;
  pctStr: string | null;
  isTriggered: boolean;
}

/**
 * Calculates the distance between the current live price and the trigger price.
 */
export function calculateTriggerDistance(
  lastPrice: number | null | undefined,
  triggerPrice: number | null | undefined,
  triggerDirection: "above" | "below" | null | undefined
): TriggerDistanceResult {
  if (
    lastPrice == null ||
    triggerPrice == null ||
    isNaN(lastPrice) ||
    isNaN(triggerPrice) ||
    lastPrice <= 0 ||
    triggerPrice <= 0
  ) {
    return { distance: null, pct: null, pctStr: null, isTriggered: false };
  }

  const distance = Math.abs(lastPrice - triggerPrice);
  const pct = (distance / lastPrice) * 100;
  const pctStr = `${pct.toFixed(2)}%`;

  const isTriggered =
    triggerDirection === "above"
      ? lastPrice >= triggerPrice
      : triggerDirection === "below"
      ? lastPrice <= triggerPrice
      : false;

  return { distance, pct, pctStr, isTriggered };
}

/**
 * Maps a trade side ("long" | "short") to its canonical trigger direction.
 * - LONG: trigger below entry (buy dip / breakout support)
 * - SHORT: trigger above entry (fade rally / breakout resistance)
 */
export function inferTriggerDirection(side: TradeSide): "above" | "below" {
  return side === "long" ? "below" : "above";
}

/**
 * Standardized order type human-readable labels.
 */
export function getOrderTypeLabel(orderType: OrderType | string | null | undefined): string {
  switch (orderType) {
    case "trigger_limit":
      return "Trigger Limit";
    case "limit":
      return "Limit";
    case "market":
      return "Market";
    default:
      return "—";
  }
}
