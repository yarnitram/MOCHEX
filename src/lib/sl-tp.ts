/**
 * Stop-loss / take-profit hit detection for logged trade alerts.
 *
 * A trade plan on the /trades page carries a stop_loss and a take_profit.
 * Both are checked against the live MEXC price on every poll: whichever level
 * the price crosses first notifies the user and writes a journal entry.
 *
 * Direction matters, so it is derived in one place only. There is no stored
 * side column on trade_alerts — `sideForTrigger()` maps the watchlist trigger
 * direction to the side (breaking BELOW the trigger is taken LONG, breaking
 * ABOVE is taken SHORT). That means, for a LONG position:
 *
 *      stop_loss  is BELOW the entry  → price crossing DOWN is a stop-out
 *      take_profit is ABOVE the entry → price crossing UP is a win
 *
 * and for a SHORT position the two are inverted. Getting this backwards would
 * fire the wrong alarm, so the comparison is done here and unit-tested rather
 * than duplicated at each call site.
 */

import { sideForTrigger, type TradeSide } from "./types";

/** Which level of a trade plan was hit. */
export type HitLevel = "sl" | "tp";

/** The subset of a trade_alerts row that SL/TP detection needs. */
export interface SlTpCandidate {
  entry_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  tp1_price?: number | null;
  tp1_hit?: boolean;
  auto_be_on_tp1?: boolean;
  /** Watchlist trigger direction; decides the side (see sideForTrigger). */
  trigger_direction: "above" | "below" | null;
  /** Set once the level has already fired — it must never fire twice. */
  sl_fired_at: string | null;
  tp_fired_at: string | null;
}

/**
 * Has `price` reached `level` from the side that counts as a hit?
 *
 * `direction` is the direction the price must travel in to be a hit:
 *   "down" — hit when price <= level (a long's stop, or a short's target)
 *   "up"   — hit when price >= level (a long's target, or a short's stop)
 */
export function crossed(
  price: number,
  level: number,
  direction: "down" | "up"
): boolean {
  return direction === "down" ? price <= level : price >= level;
}

/**
 * The direction the price must move for the given level to be a hit, for a
 * position on `side`.
 *
 * A LONG is stopped out when price falls to the stop and wins when price rises
 * to the target; a SHORT is stopped out when price rises to the stop and wins
 * when price falls to the target.
 */
export function hitDirectionFor(
  side: TradeSide,
  level: HitLevel
): "down" | "up" {
  if (side === "long") return level === "sl" ? "down" : "up";
  return level === "sl" ? "up" : "down";
}

/**
 * Find which levels of a trade plan the current price has hit.
 *
 * Returns [] when nothing was hit, or when the level was already consumed by
 * an earlier poll (its `*_fired_at` timestamp is set). When the price gaps
 * through BOTH levels in a single poll, the one nearer to the entry wins —
 * that is the level the price would have reached first — so a single poll
 * never reports contradictory alarms.
 */
export function detectHits(
  row: SlTpCandidate,
  price: number
): { level: HitLevel; price: number }[] {
  if (!Number.isFinite(price) || price <= 0) return [];

  const side = sideForTrigger(row.trigger_direction, row);
  const hit: { level: HitLevel; distance: number }[] = [];

  if (
    row.stop_loss != null &&
    row.sl_fired_at == null &&
    crossed(price, row.stop_loss, hitDirectionFor(side, "sl"))
  ) {
    // Overshoot past the level. When a single poll gaps through both levels,
    // the one overshot least is the one the price crossed first.
    hit.push({ level: "sl", distance: Math.abs(price - row.stop_loss) });
  }

  if (
    row.take_profit != null &&
    row.tp_fired_at == null &&
    crossed(price, row.take_profit, hitDirectionFor(side, "tp"))
  ) {
    hit.push({ level: "tp", distance: Math.abs(price - row.take_profit) });
  }

  if (hit.length === 0) return [];

  // Crossed first wins; a tie keeps SL, the protective level.
  hit.sort((a, b) => a.distance - b.distance || (a.level === "sl" ? -1 : 1));

  return [{ level: hit[0].level, price }];
}

/** Human label for a level, used in notifications and journal notes. */
export function levelLabel(level: HitLevel): string {
  return level === "sl" ? "Stop-loss" : "Take-profit";
}
