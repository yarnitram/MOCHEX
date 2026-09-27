"use client";

import { useEffect, useState } from "react";
import type { WatchlistItem, OrderType } from "@/lib/types";
import { ModalShell } from "@/components/ui/modal-shell";
import { SetupRevisionTimeline } from "@/components/revisions/setup-revision-timeline";
import { MultiScreenshotUploader } from "@/components/ui/multi-screenshot-uploader";

interface Props {
  symbol: string;
  item: WatchlistItem | null;
  onClose: () => void;
  onSaved?: () => void;
}

interface Ticker {
  symbol: string;
  lastPrice: number;
  bid1: number;
  ask1: number;
  volume24: number;
  amount24: number;
  holdVol: number;
  lower24Price: number;
  high24Price: number;
  riseFallRate: number;
  riseFallValue: number;
  indexPrice: number;
  fairPrice: number;
  fundingRate: number;
}

interface Detail {
  symbol: string;
  displayNameEn: string;
  baseCoin: string;
  quoteCoin: string;
  contractSize: number;
  minLeverage: number;
  maxLeverage: number;
  baseCoinIconUrl: string;
}

function cleanSymbol(s: string): string {
  return s.replace(/_USDT$/i, "");
}

function toStr(v: number | null | undefined): string {
  return v == null ? "" : String(v);
}

// Selectable order types shown in the modal; aligned with the DB constraint.
const ORDER_TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: "limit", label: "Limit" },
  { value: "trigger_limit", label: "Trigger Limit" },
  { value: "market", label: "Market" },
];

export function CoinDetailModal({ symbol, item, onClose, onSaved }: Props) {
  const [ticker, setTicker] = useState<Ticker | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Position: derive from trigger_direction ("above" is short, "below" is long)
  const initialPosition = item?.trigger_direction === "above" ? "short" : "long";
  const [position, setPosition] = useState<"long" | "short">(initialPosition);

  // Form state for the alert / trade plan.
  const [triggerPrice, setTriggerPrice] = useState(
    toStr(item?.trigger_price ?? item?.alert_price)
  );
  const [entry, setEntry] = useState(toStr(item?.entry_price));
  const [stopLoss, setStopLoss] = useState(toStr(item?.stop_loss));
  const [takeProfit, setTakeProfit] = useState(toStr(item?.take_profit));
  const [orderType, setOrderType] = useState<OrderType | "">(
    item?.order_type ?? "limit"
  );
  const [notes, setNotes] = useState(item?.notes ?? "");

  // Multi-Screenshot state (1 to 5 images)
  const initialScreenshots: string[] = item?.screenshot_urls?.length
    ? item.screenshot_urls
    : item?.screenshot_url
    ? [item.screenshot_url]
    : [];
  const [screenshotUrls, setScreenshotUrls] = useState<string[]>(initialScreenshots);

  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"plan" | "history">("plan");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/mexc/futures?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setTicker(data.ticker ?? null);
        setDetail(data.detail ?? null);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  const changeClass = (v: number | undefined) =>
    v != null && v >= 0 ? "text-gain" : "text-loss";

  function fmtPct(f: number | undefined): string {
    if (f == null) return "…";
    return `${f >= 0 ? "+" : ""}${(f * 100).toFixed(2)}%`;
  }

  function fmtPx(p: number | undefined): string {
    if (p == null) return "…";
    if (p >= 1000)
      return p.toLocaleString("en-US", { maximumFractionDigits: 1 });
    if (p >= 1)
      return p.toLocaleString("en-US", { maximumFractionDigits: 3 });
    return p.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  function compact(v: number | undefined): string {
    if (v == null) return "…";
    const abs = Math.abs(v);
    if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
    return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }

  // Calculate live Risk/Reward ratio & Directional Safety guardrails
  const epNum = entry ? parseFloat(entry) : null;
  const slNum = stopLoss ? parseFloat(stopLoss) : null;
  const tpNum = takeProfit ? parseFloat(takeProfit) : null;

  let rrRatio: string | null = null;
  let riskWarning: string | null = null;

  if (
    epNum != null &&
    slNum != null &&
    tpNum != null &&
    !isNaN(epNum) &&
    !isNaN(slNum) &&
    !isNaN(tpNum)
  ) {
    const risk = Math.abs(epNum - slNum);
    const reward = Math.abs(tpNum - epNum);
    if (risk > 0) {
      rrRatio = (reward / risk).toFixed(2);
    }
    if (position === "long") {
      if (slNum >= epNum) {
        riskWarning = "For a LONG setup, Stop Loss should be below Entry Price.";
      } else if (tpNum <= epNum) {
        riskWarning = "For a LONG setup, Take Profit should be above Entry Price.";
      }
    } else {
      if (slNum <= epNum) {
        riskWarning = "For a SHORT setup, Stop Loss should be above Entry Price.";
      } else if (tpNum >= epNum) {
        riskWarning = "For a SHORT setup, Take Profit should be below Entry Price.";
      }
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!item) {
      setError("This coin isn't saved to your watchlist yet.");
      return;
    }
    setSaving(true);
    setSavedMsg(null);
    setError(null);

    try {
      const triggerPriceNum = triggerPrice ? parseFloat(triggerPrice) : null;
      const lastPrice = ticker?.lastPrice ?? null;

      // Trigger direction is dictated by position (Long = below/pullback, Short = above/rally)
      const triggerDirection = position === "long" ? "below" : "above";

      let firedImmediately = false;
      if (triggerPriceNum !== null && lastPrice !== null) {
        if (position === "long" && lastPrice <= triggerPriceNum) {
          firedImmediately = true;
        } else if (position === "short" && lastPrice >= triggerPriceNum) {
          firedImmediately = true;
        }
      }

      const fireTime = firedImmediately ? new Date().toISOString() : null;

      const prevTrigger = item.trigger_price ?? item.alert_price ?? null;
      const triggerChanged =
        triggerPriceNum !== null && triggerPriceNum !== prevTrigger;

      // Setting a NEW trigger on an already-fired alert: clear the old fired
      // state first so the immediate-fire claim below can succeed.
      if (firedImmediately && triggerChanged) {
        await fetch(`/api/watchlist/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rearm: true }),
        }).catch(() => {});
      }

      const res = await fetch(`/api/watchlist/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_price: triggerPriceNum,
          trigger_direction: triggerDirection,
          order_type: orderType || null,
          entry_price: entry ? parseFloat(entry) : null,
          stop_loss: stopLoss ? parseFloat(stopLoss) : null,
          take_profit: takeProfit ? parseFloat(takeProfit) : null,
          notes: notes.trim() || null,
          screenshot_urls: screenshotUrls,
          screenshot_url: screenshotUrls[0] ?? null,
          alert_fired: firedImmediately,
          alert_fired_at: fireTime ?? undefined,
          rearm: triggerChanged && !firedImmediately,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      const saveResult = await res.json().catch(() => null);

      // Dispatch across all channels immediately when the price is already at
      // the trigger (in-app notification + Discord + desktop).
      if (
        firedImmediately &&
        triggerPriceNum !== null &&
        saveResult?.claimed !== false
      ) {
        await fetch(`/api/alerts/fire`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "watchlist_trigger",
            title: `${cleanSymbol(symbol)} (${position.toUpperCase()}) hit trigger`,
            message: `Last ${lastPrice} reached your ${triggerPriceNum} trigger level.`,
            link: "/watchlist",
          }),
        }).catch(() => {});
      }

      setSavedMsg(
        !triggerPrice
          ? "Alert cleared."
          : firedImmediately
          ? "🚨 Price already at trigger — alert fired!"
          : "Setup & alert saved successfully!"
      );
      onSaved?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const stat = (label: string, value: React.ReactNode, cls = "") => (
    <div className="flex flex-col gap-0.5 items-start">
      <span className="text-xs text-muted">{label}</span>
      <span className={`num font-medium ${cls}`}>{value}</span>
    </div>
  );

  const inputCls = "input-base w-full";

  return (
    <ModalShell
      title={`${cleanSymbol(symbol)} · Modify Setup & Alert`}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      {error ? (
        <div className="text-sm text-loss">{error}</div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Big price + 24h Header */}
          <div className="hairline-b pb-4 flex items-end justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-muted uppercase tracking-wide mb-1">
                Last price
              </div>
              <div className="num text-4xl font-semibold">
                {fmtPx(ticker?.lastPrice)}
              </div>
              <div
                className={`num text-sm mt-1 ${changeClass(
                  ticker?.riseFallRate
                )}`}
              >
                {fmtPct(ticker?.riseFallRate)} 24h
              </div>
            </div>
            {detail?.baseCoinIconUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={detail.baseCoinIconUrl}
                alt={detail.baseCoin}
                className="h-14 w-14 rounded-full object-contain border border-line p-1"
              />
            )}
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-3 gap-4">
            {stat(
              "Funding rate",
              fmtPct(ticker?.fundingRate),
              changeClass(ticker?.fundingRate)
            )}
            {stat("24h volume", compact(ticker?.amount24))}
            {stat(
              "Leverage",
              detail
                ? `${detail.minLeverage}–${detail.maxLeverage}x`
                : "…"
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-line gap-6 text-xs font-semibold pt-1">
            <button
              type="button"
              onClick={() => setActiveTab("plan")}
              className={`pb-2 border-b-2 transition-colors cursor-pointer ${
                activeTab === "plan"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              Plan, Alerts &amp; Screenshots
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("history")}
              className={`pb-2 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeTab === "history"
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-text"
              }`}
            >
              <span>📜 Setup Audit History</span>
            </button>
          </div>

          {activeTab === "history" ? (
            <div className="pt-2">
              <SetupRevisionTimeline itemId={item?.id} symbol={symbol} />
            </div>
          ) : (
            /* Trade alert / plan Form */
            <form onSubmit={handleSave} className="flex flex-col gap-4">
              {/* Position Side (Long vs Short) */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                  Position / Side <span className="text-loss">*</span>
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPosition("long")}
                    className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      position === "long"
                        ? "bg-gain/20 text-gain border-gain shadow-sm"
                        : "bg-panel-soft/60 hover:bg-panel-soft text-muted border-line"
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 17L17 7M17 7H7M17 7V17" />
                    </svg>
                    <span>↗ LONG</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPosition("short")}
                    className={`py-2 px-3 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer border ${
                      position === "short"
                        ? "bg-loss/20 text-loss border-loss shadow-sm"
                        : "bg-panel-soft/60 hover:bg-panel-soft text-muted border-line"
                    }`}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 7l10 10M17 7v10H7" />
                    </svg>
                    <span>↘ SHORT</span>
                  </button>
                </div>
              </div>

              {/* Price Alert Box */}
              <div className="p-3.5 rounded-xl bg-panel/40 border border-line flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted uppercase tracking-wide font-semibold">
                    Price Alert Trigger
                  </span>
                  {ticker?.lastPrice && (
                    <button
                      type="button"
                      onClick={() => setTriggerPrice(String(ticker.lastPrice))}
                      className="text-[11px] font-mono text-accent hover:underline cursor-pointer"
                    >
                      Use Last: {fmtPx(ticker.lastPrice)}
                    </button>
                  )}
                </div>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Trigger price</span>
                  <input
                    type="number"
                    step="any"
                    className={inputCls}
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    placeholder="e.g. 68000"
                  />
                </label>
                <p className="text-[11px] text-muted">
                  When price hits this trigger, you&apos;ll receive an in-app, desktop &amp; Discord alert for your {position.toUpperCase()} setup.
                </p>
              </div>

              {/* Trade Execution Plan */}
              <div className="p-3.5 rounded-xl bg-panel/40 border border-line flex flex-col gap-3">
                <div className="text-xs text-muted uppercase tracking-wide font-semibold">
                  Execution Plan (If Triggered)
                </div>

                <label className="flex flex-col gap-1 text-xs text-muted">
                  <span>Order type</span>
                  <select
                    className={`${inputCls} cursor-pointer`}
                    value={orderType}
                    onChange={(e) =>
                      setOrderType(e.target.value as OrderType | "")
                    }
                  >
                    <option value="">— Choose —</option>
                    {ORDER_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="grid grid-cols-3 gap-2.5">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span className="flex items-center justify-between">
                      <span>Entry (EP)</span>
                      {ticker?.lastPrice && (
                        <button
                          type="button"
                          onClick={() => setEntry(String(ticker.lastPrice))}
                          className="text-[10px] text-accent hover:underline cursor-pointer"
                          title="Use current market price"
                        >
                          Last
                        </button>
                      )}
                    </span>
                    <input
                      type="number"
                      step="any"
                      className={inputCls}
                      value={entry}
                      onChange={(e) => setEntry(e.target.value)}
                      placeholder="—"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span>Stop loss (SL)</span>
                    <input
                      type="number"
                      step="any"
                      className={inputCls}
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      placeholder="—"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    <span>Take profit (TP)</span>
                    <input
                      type="number"
                      step="any"
                      className={inputCls}
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
                      placeholder="—"
                    />
                  </label>
                </div>

                {/* R:R Ratio Badge or Directional Safety Warning */}
                {rrRatio && (
                  <div className="p-2 rounded-lg bg-accent/10 border border-accent/25 flex items-center justify-between text-xs font-mono text-accent">
                    <span className="font-semibold">🎯 Risk : Reward</span>
                    <span>1 : {rrRatio} R:R</span>
                  </div>
                )}
                {riskWarning && (
                  <div className="text-[11px] text-amber-400 font-mono">
                    ⚠️ {riskWarning}
                  </div>
                )}
              </div>

              {/* Strategy Notes / Thesis */}
              <label className="flex flex-col gap-1 text-xs text-muted">
                <span className="text-[10px] font-mono uppercase text-muted tracking-wider">
                  Strategy Notes / Thesis (Optional)
                </span>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. 4H bull flag breakout, tight invalidation below support..."
                  className="w-full px-3 py-2 rounded-xl bg-panel-soft/80 border border-line text-text placeholder:text-muted/60 text-xs focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition-all resize-none font-mono"
                />
              </label>

              {/* Multi-Screenshot Uploader (1–5 images) */}
              <MultiScreenshotUploader
                urls={screenshotUrls}
                onChange={setScreenshotUrls}
                maxFiles={5}
                entityId={`watchlist-${item?.id || symbol}`}
                label="Chart Screenshots (1–5 images)"
                helpText="Paste (Ctrl+V) or upload up to 5 screenshots. Auto-compressed 85–95%."
              />

              {savedMsg && (
                <div className="text-xs text-gain font-medium">{savedMsg}</div>
              )}

              <div className="flex justify-end gap-2 hairline-t pt-3">
                {triggerPrice && (
                  <button
                    type="button"
                    onClick={() => {
                      setTriggerPrice("");
                      setEntry("");
                      setStopLoss("");
                      setTakeProfit("");
                      setNotes("");
                      setScreenshotUrls([]);
                    }}
                    className="px-3 py-2 text-xs btn-ghost cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm accent-btn font-semibold cursor-pointer disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </ModalShell>
  );
}