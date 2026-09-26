"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sideForTrigger, type TradeAlert, type ArchivedTradeAlert, type TradeSide } from "@/lib/types";
import { ModalShell } from "@/components/ui/modal-shell";
import { TradeEditModal } from "./trade-edit-modal";
import { ManualTradeModal } from "./manual-trade-modal";
import { CloseTradeModal } from "./close-trade-modal";
import { ClosedTradesTab } from "./closed-trades-tab";
import { ArchivedTradesTab } from "./archived-trades-tab";
import { useLivePrices, formatLastRefreshed } from "./use-live-prices";
import { PositionCalculatorModal } from "@/components/calculator/position-calculator-modal";
import { ChartModal } from "@/components/charts/chart-modal";

interface Props {
  initialAlerts: TradeAlert[];
  refreshIntervalSec?: number;
}

const SORT_KEY = "mochex:trades-sort";
const COLS_KEY = "mochex:trades-cols";

type SortField =
  | "firedAt"
  | "symbol"
  | "position"
  | "leverage"
  | "pnl"
  | "margin"
  | "lastPrice"
  | "trigger"
  | "firedPrice"
  | "entry"
  | "stop"
  | "target";

interface SortConfig {
  field: SortField;
  dir: "asc" | "desc";
}

const DEFAULT_SORT: SortConfig = { field: "firedAt", dir: "desc" };

const SORT_OPTIONS: { value: SortConfig; label: string }[] = [
  { value: { field: "firedAt", dir: "desc" }, label: "Fired at (new → old)" },
  { value: { field: "firedAt", dir: "asc" }, label: "Fired at (old → new)" },
  { value: { field: "symbol", dir: "asc" }, label: "Coin (A–Z)" },
  { value: { field: "symbol", dir: "desc" }, label: "Coin (Z–A)" },
  { value: { field: "pnl", dir: "desc" }, label: "UPNL (high → low)" },
  { value: { field: "pnl", dir: "asc" }, label: "UPNL (low → high)" },
  { value: { field: "position", dir: "desc" }, label: "Position (high → low)" },
  { value: { field: "position", dir: "asc" }, label: "Position (low → high)" },
  { value: { field: "margin", dir: "desc" }, label: "Margin (high → low)" },
  { value: { field: "margin", dir: "asc" }, label: "Margin (low → high)" },
  { value: { field: "leverage", dir: "desc" }, label: "Leverage (high → low)" },
  { value: { field: "leverage", dir: "asc" }, label: "Leverage (low → high)" },
  { value: { field: "lastPrice", dir: "desc" }, label: "LP (high → low)" },
  { value: { field: "lastPrice", dir: "asc" }, label: "LP (low → high)" },
  { value: { field: "trigger", dir: "desc" }, label: "Trigger (high → low)" },
  { value: { field: "trigger", dir: "asc" }, label: "Trigger (low → high)" },
  { value: { field: "firedPrice", dir: "desc" }, label: "FP (high → low)" },
  { value: { field: "firedPrice", dir: "asc" }, label: "FP (low → new)" },
  { value: { field: "entry", dir: "desc" }, label: "Entry (high → low)" },
  { value: { field: "entry", dir: "asc" }, label: "Entry (low → high)" },
  { value: { field: "stop", dir: "desc" }, label: "Stop-loss (high → low)" },
  { value: { field: "stop", dir: "asc" }, label: "Stop-loss (low → high)" },
  { value: { field: "target", dir: "desc" }, label: "Take-profit (high → low)" },
  { value: { field: "target", dir: "asc" }, label: "Take-profit (low → high)" },
];

function sortConfigKey(c: SortConfig): string {
  return `${c.field}:${c.dir}`;
}

function loadSort(): SortConfig {
  try {
    const raw = localStorage.getItem(SORT_KEY);
    if (!raw) return DEFAULT_SORT;
    const parsed = JSON.parse(raw) as SortConfig;
    if (
      SORT_OPTIONS.some((o) => sortConfigKey(o.value) === sortConfigKey(parsed))
    ) {
      return parsed;
    }
    return DEFAULT_SORT;
  } catch {
    return DEFAULT_SORT;
  }
}

function saveSort(c: SortConfig) {
  try {
    localStorage.setItem(SORT_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

function cleanSymbol(s: string): string {
  return s.replace(/_USDT$/i, "");
}

interface ContractDetail {
  symbol: string;
  contractSize: number;
  maxLeverage: number;
  baseCoinIconUrl: string;
}

const DEFAULT_MARGIN_USD = 1;

interface TradeRow extends TradeAlert {
  entryUsed: number | null;
  marginUsd: number;
  leverage: number | null;
  leverageIsMax: boolean;
  positionSize: number | null;
  notional: number | null;
  lastPrice: number | null;
  pnl: number | null;
  pnlPct: number | null;
  side: TradeSide;
}

function buildRow(
  a: TradeAlert,
  lastPrice: number | null,
  maxLeverage: number | null
): TradeRow {
  const side = sideForTrigger(a.trigger_direction);
  const entryUsed = a.entry_price ?? a.fired_price;

  const marginUsd =
    a.margin_usd != null && a.margin_usd > 0 ? a.margin_usd : DEFAULT_MARGIN_USD;

  const savedLev = a.leverage != null && a.leverage > 0 ? a.leverage : null;
  const maxLev = maxLeverage != null && maxLeverage > 0 ? maxLeverage : null;
  const leverage = savedLev ?? maxLev;
  const leverageIsMax = savedLev == null && maxLev != null;

  const sign = side === "long" ? 1 : -1;

  let notional: number | null = null;
  let positionSize: number | null = null;
  let pnl: number | null = null;
  let pnlPct: number | null = null;
  if (leverage != null && entryUsed != null && entryUsed > 0) {
    notional = marginUsd * leverage;
    positionSize = notional / entryUsed;
    if (lastPrice != null) {
      pnl = sign * positionSize * (lastPrice - entryUsed);
      pnlPct = sign * (lastPrice / entryUsed - 1) * leverage;
    }
  }

  return {
    ...a,
    entryUsed,
    marginUsd,
    leverage,
    leverageIsMax,
    positionSize,
    notional,
    lastPrice,
    pnl,
    pnlPct,
    side,
  };
}

type ColKey =
  | "position"
  | "leverage"
  | "pnl"
  | "margin"
  | "lastPrice"
  | "trigger"
  | "firedPrice"
  | "plan"
  | "orderType"
  | "notes"
  | "firedAt";

const COLUMNS: { key: ColKey; label: string }[] = [
  { key: "position", label: "Position" },
  { key: "leverage", label: "Leverage" },
  { key: "pnl", label: "UPNL" },
  { key: "margin", label: "Margin" },
  { key: "lastPrice", label: "LP" },
  { key: "trigger", label: "Trigger" },
  { key: "firedPrice", label: "FP" },
  { key: "plan", label: "EP / SL / TP" },
  { key: "orderType", label: "Order type" },
  { key: "notes", label: "Notes" },
  { key: "firedAt", label: "Fired at" },
];

const DEFAULT_COLS: Record<ColKey, boolean> = {
  position: true,
  leverage: true,
  pnl: true,
  margin: true,
  lastPrice: true,
  trigger: true,
  firedPrice: true,
  plan: true,
  orderType: true,
  notes: true,
  firedAt: true,
};

function loadCols(): Record<ColKey, boolean> {
  try {
    const raw = localStorage.getItem(COLS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<ColKey, boolean>>;
      return { ...DEFAULT_COLS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_COLS };
}

function saveCols(cols: Record<ColKey, boolean>) {
  try {
    localStorage.setItem(COLS_KEY, JSON.stringify(cols));
  } catch {
    /* ignore */
  }
}

export function TradesClient({ initialAlerts, refreshIntervalSec = 10 }: Props) {
  const [alerts, setAlerts] = useState<TradeAlert[]>(initialAlerts);
  const [archivedAlerts, setArchivedAlerts] = useState<ArchivedTradeAlert[]>([]);
  const [activeTab, setActiveTab] = useState<"active" | "closed" | "archive">("active");

  const [sort, setSort] = useState<SortConfig>(DEFAULT_SORT);
  const [filter, setFilter] = useState("");
  const [cols, setCols] = useState<Record<ColKey, boolean>>(DEFAULT_COLS);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  const colVisible = (key: ColKey) => cols[key] !== false;

  function toggleCol(key: ColKey, on: boolean) {
    setCols((prev) => {
      const next = { ...prev, [key]: on };
      saveCols(next);
      return next;
    });
  }

  function showAllCols() {
    setCols(() => {
      saveCols({ ...DEFAULT_COLS });
      return { ...DEFAULT_COLS };
    });
  }

  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(20);

  // Live prices and contract details
  const {
    prices: live,
    details,
    loading: pricesLoading,
    error: pricesError,
    lastRefreshed,
    refreshIntervalSec: pricesRefreshInterval,
  } = useLivePrices(alerts.map((a) => a.symbol.toUpperCase()), refreshIntervalSec);

  // Modals & Action states
  const [editing, setEditing] = useState<TradeAlert | ArchivedTradeAlert | null>(null);
  const [editingIsArchived, setEditingIsArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TradeAlert | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [closingAlert, setClosingAlert] = useState<TradeAlert | null>(null);
  const [chartAlert, setChartAlert] = useState<TradeRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const icons = useMemo(() => {
    const map: Record<string, string> = {};
    if (details) {
      for (const [sym, d] of Object.entries(details)) {
        if (d?.baseCoinIconUrl) {
          map[sym] = d.baseCoinIconUrl;
        }
      }
    }
    return map;
  }, [details]);

  // Split active and closed trade alerts
  const activeAlerts = useMemo(
    () => alerts.filter((a) => a.status !== "closed"),
    [alerts]
  );

  const closedAlerts = useMemo(
    () => alerts.filter((a) => a.status === "closed"),
    [alerts]
  );

  // Fetch archived alerts when tab opens
  const fetchArchived = async () => {
    try {
      const res = await fetch("/api/archived-trades");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.archivedAlerts)) {
        setArchivedAlerts(data.archivedAlerts as ArchivedTradeAlert[]);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (activeTab === "archive") {
      fetchArchived();
    }
  }, [activeTab]);

  useEffect(() => {
    const t = setTimeout(() => setSort(loadSort()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setCols(loadCols()), 0);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!colsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) {
        setColsOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [colsOpen]);

  // Poll for active alert updates & TP/SL checks
  const refreshAllAlerts = async () => {
    try {
      await fetch("/api/trade-alerts/check", { method: "POST" }).catch(() => {});
      const res = await fetch("/api/trade-alerts");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.alerts)) {
        setAlerts(data.alerts as TradeAlert[]);
      }
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    let cancelled = false;
    const intervalMs = Math.max(
      3000,
      (Number(refreshIntervalSec) || 10) * 1000
    );

    const run = async () => {
      if (cancelled) return;
      await refreshAllAlerts();
    };

    run();
    const id = setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshIntervalSec]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  // Active Rows
  const rows = useMemo(
    () =>
      activeAlerts.map((a) => {
        const sym = a.symbol.toUpperCase();
        return buildRow(a, live[sym] ?? null, details[sym]?.maxLeverage ?? null);
      }),
    [activeAlerts, live, details]
  );

  const sortedAlerts = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmpNum = (a: number | null, b: number | null) => {
      if (a == null && b == null) return 0;
      if (a == null) return 1;
      if (b == null) return -1;
      return (a - b) * dir;
    };

    return [...rows].sort((a, b) => {
      const aSym = a.symbol.toUpperCase();
      const bSym = b.symbol.toUpperCase();
      switch (sort.field) {
        case "firedAt": {
          const aT = new Date(a.fired_at).getTime();
          const bT = new Date(b.fired_at).getTime();
          if (Number.isNaN(aT) && Number.isNaN(bT)) return aSym.localeCompare(bSym);
          if (Number.isNaN(aT)) return 1;
          if (Number.isNaN(bT)) return -1;
          return (aT - bT) * dir;
        }
        case "symbol":
          return aSym.localeCompare(bSym) * dir;
        case "trigger":
          return cmpNum(a.trigger_price, b.trigger_price);
        case "firedPrice":
          return cmpNum(a.fired_price, b.fired_price);
        case "entry":
          return cmpNum(a.entry_price, b.entry_price);
        case "stop":
          return cmpNum(a.stop_loss, b.stop_loss);
        case "target":
          return cmpNum(a.take_profit, b.take_profit);
        case "position":
          return cmpNum(a.positionSize, b.positionSize);
        case "leverage":
          return cmpNum(a.leverage, b.leverage);
        case "pnl":
          return cmpNum(a.pnl, b.pnl);
        case "margin":
          return cmpNum(a.marginUsd, b.marginUsd);
        case "lastPrice":
          return cmpNum(a.lastPrice, b.lastPrice);
        default:
          return 0;
      }
    });
  }, [rows, sort]);

  const filteredAlerts = useMemo(() => {
    const q = filter.trim().toUpperCase();
    if (!q) return sortedAlerts;
    return sortedAlerts.filter((a) => a.symbol.toUpperCase().includes(q));
  }, [sortedAlerts, filter]);

  const total = filteredAlerts.length;
  const hasPaging = Number.isFinite(pageSize);
  const pageCount = hasPaging ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage = hasPaging ? Math.min(page, pageCount - 1) : 0;
  const pageAlerts = useMemo(() => {
    if (!hasPaging) return filteredAlerts;
    return filteredAlerts.slice(safePage * pageSize, (safePage + 1) * pageSize);
  }, [filteredAlerts, pageSize, safePage, hasPaging]);

  function fmtPx(p: number): string {
    const s = p.toLocaleString("en-US", { maximumFractionDigits: 7 });
    return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
  }

  function fmtPxVal(v: number | null | undefined): ReactNode {
    return v != null ? fmtPx(v) : <span className="text-muted">—</span>;
  }

  function fmtUsd(v: number | null | undefined, digits = 2): string {
    if (v == null || !Number.isFinite(v)) return "—";
    const abs = Math.abs(v).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    return `${v < 0 ? "-" : "+"}$${abs}`;
  }

  function fmtMoney(v: number | null | undefined, digits = 2): string {
    if (v == null || !Number.isFinite(v)) return "—";
    return `$${v.toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    })}`;
  }

  function fmtLev(v: number | null): string {
    if (v == null || !Number.isFinite(v)) return "—";
    return `${v % 1 === 0 ? v : v.toFixed(2)}×`;
  }

  const ORDER_TYPE_LABELS: Record<string, string> = {
    limit: "Limit",
    trigger_limit: "Trigger Limit",
    market: "Market",
  };

  function fmtDateTime(iso: string | null | undefined): ReactNode {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const sgTime = d.toLocaleTimeString("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const sgDate = d.toLocaleDateString("en-SG", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return (
      <div className="flex flex-col items-center leading-tight">
        <span className="num">{sgDate}</span>
        <span className="num text-[10px] text-muted">{sgTime}</span>
      </div>
    );
  }

  // Row Action Handlers
  async function archiveTradeAlert(alertId: string) {
    try {
      const res = await fetch("/api/archived-trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trade_alert_id: alertId }),
      });
      if (!res.ok) throw new Error("Failed to archive trade");
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      if (activeTab === "archive") fetchArchived();
      setNotice("Trade archived.");
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Error archiving trade");
    }
  }

  async function restoreArchivedTradeAlert(archivedAlert: ArchivedTradeAlert) {
    try {
      const res = await fetch(`/api/archived-trades/${archivedAlert.id}/restore`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to restore trade");
      setArchivedAlerts((prev) => prev.filter((a) => a.id !== archivedAlert.id));
      await refreshAllAlerts();
      setNotice("Trade restored.");
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Error restoring trade");
    }
  }

  async function deleteArchivedPermanent(archivedAlert: ArchivedTradeAlert) {
    try {
      const res = await fetch(`/api/archived-trades/${archivedAlert.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete archived trade");
      setArchivedAlerts((prev) => prev.filter((a) => a.id !== archivedAlert.id));
      setNotice("Trade permanently deleted.");
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : "Error deleting archived trade");
    }
  }

  async function deleteTrade(id: string) {
    setConfirmDelete(null);
    try {
      const res = await fetch(`/api/trade-alerts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Delete failed");
      }
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setNotice("Trade deleted.");
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  async function handleEditSaved() {
    setEditing(null);
    setNotice("Trade updated.");
    await refreshAllAlerts();
    if (activeTab === "archive" || editingIsArchived) {
      await fetchArchived();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="eyebrow mb-1">Alert log & Management</p>
          <h1 className="text-2xl font-semibold mb-1">Trades</h1>
          <p className="text-sm text-muted">
            Manage active position alerts, view closed trade history, or archive trades.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCalcModalOpen(true)}
            className="px-3.5 py-2 rounded-lg bg-panel hover:bg-panel-soft text-text text-xs font-semibold flex items-center gap-1.5 border border-line transition-colors cursor-pointer"
          >
            <span>🧮</span> Calculator
          </button>
          <button
            type="button"
            onClick={() => setManualModalOpen(true)}
            className="accent-btn px-3.5 py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <span>+</span> Manual Trade
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center gap-1 border-b border-line pb-0 font-mono text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("active")}
          className={`px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "active"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          Active Trades
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-panel-soft border border-line font-mono">
            {activeAlerts.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("closed")}
          className={`px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "closed"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          Closed History
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-panel-soft border border-line font-mono">
            {closedAlerts.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("archive")}
          className={`px-3 py-2 border-b-2 font-medium transition-colors cursor-pointer flex items-center gap-2 ${
            activeTab === "archive"
              ? "border-accent text-accent font-semibold"
              : "border-transparent text-muted hover:text-text"
          }`}
        >
          Archive
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-panel-soft border border-line font-mono">
            {archivedAlerts.length}
          </span>
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === "active" && (
        <>
          {activeAlerts.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                <span>Search</span>
                <input
                  className="hairline bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent w-44"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Filter by coin…"
                />
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="relative" ref={colsRef}>
                  <button
                    type="button"
                    onClick={() => setColsOpen((o) => !o)}
                    aria-expanded={colsOpen}
                    className={`hairline bg-panel px-2 py-1.5 text-xs cursor-pointer rounded-md flex items-center gap-1.5 ${
                      colsOpen ? "border-accent text-accent" : "text-muted hover:text-text"
                    }`}
                  >
                    Columns
                  </button>
                  {colsOpen && (
                    <div className="absolute right-0 top-full mt-1 z-30 w-52 hairline bg-panel shadow-lg rounded-lg p-2">
                      <div className="flex items-center justify-between px-2 pb-1.5 mb-1 hairline-b">
                        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                          Show columns
                        </span>
                        <button
                          type="button"
                          onClick={showAllCols}
                          className="text-[11px] text-accent hover:underline cursor-pointer"
                        >
                          Show all
                        </button>
                      </div>
                      {COLUMNS.map((c) => (
                        <label
                          key={c.key}
                          className="flex items-center gap-2 px-2 py-1.5 text-xs text-text rounded hover:bg-panel-soft cursor-pointer select-none"
                        >
                          <input
                            type="checkbox"
                            checked={colVisible(c.key)}
                            onChange={(e) => toggleCol(c.key, e.target.checked)}
                            className="accent-accent cursor-pointer"
                          />
                          {c.label}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span>Sort by</span>
                  <select
                    className="hairline bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent cursor-pointer"
                    value={sortConfigKey(sort)}
                    onChange={(e) => {
                      const next = SORT_OPTIONS.find(
                        (o) => sortConfigKey(o.value) === e.target.value
                      );
                      if (next) {
                        setSort(next.value);
                        saveSort(next.value);
                      }
                    }}
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={sortConfigKey(o.value)} value={sortConfigKey(o.value)}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span>Rows per page</span>
                  <select
                    className="hairline bg-panel px-2 py-1.5 text-xs outline-none focus:border-accent cursor-pointer"
                    value={hasPaging ? String(pageSize) : "all"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPageSize(v === "all" ? Number.POSITIVE_INFINITY : Number(v));
                      setPage(0);
                    }}
                  >
                    <option value="10">10</option>
                    <option value="20">20</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="all">All</option>
                  </select>
                </label>
              </div>
            </div>
          )}

          {activeAlerts.length === 0 ? (
            <div className="hairline text-muted p-10 text-center text-sm rounded-xl">
              No active trades. Arm a price trigger on the Watchlist page or click "+ Manual Trade" above.
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="hairline text-muted p-10 text-center text-sm rounded-xl">
              No active trades match “{filter}”. Try a different search.
            </div>
          ) : (
            <>
              <div className="hairline overflow-x-auto rounded-xl bg-panel/40 striped">
                <table className="w-full text-sm border-collapse min-w-[1240px]">
                  <thead>
                    <tr className="hairline-b bg-panel-soft/60 font-mono text-[10px] uppercase text-muted tracking-wider">
                      <th className="px-3 py-2 text-left">Coin</th>
                      {colVisible("position") && <th className="px-2 py-1.5 text-left">Position</th>}
                      {colVisible("leverage") && <th className="px-2 py-1.5 text-left">Leverage</th>}
                      {colVisible("pnl") && <th className="px-2 py-1.5 text-left">UPNL</th>}
                      {colVisible("margin") && <th className="px-2 py-1.5 text-left">Margin</th>}
                      {colVisible("lastPrice") && <th className="px-2 py-1.5 text-left">LP</th>}
                      {colVisible("trigger") && <th className="px-2 py-1.5 text-left">Trigger</th>}
                      {colVisible("firedPrice") && <th className="px-2 py-1.5 text-left">FP</th>}
                      {colVisible("plan") && <th className="px-2 py-1.5 text-left">EP / SL / TP</th>}
                      {colVisible("orderType") && <th className="px-2 py-1.5 text-left">Order type</th>}
                      {colVisible("notes") && <th className="px-2 py-1.5 text-left">Notes</th>}
                      {colVisible("firedAt") && <th className="px-2 py-1.5 text-left">Fired at</th>}
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageAlerts.map((a) => {
                      const sym = a.symbol.toUpperCase();
                      return (
                        <tr key={a.id} className="hairline-b hover:bg-panel-soft/50 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
                                {details[sym]?.baseCoinIconUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={details[sym].baseCoinIconUrl}
                                    alt=""
                                    width={20}
                                    height={20}
                                    className="size-5 shrink-0 object-contain"
                                  />
                                ) : (
                                  <span className="flex size-5 items-center justify-center rounded-full bg-panel-soft text-[10px] font-semibold text-muted">
                                    {cleanSymbol(sym).charAt(0).toUpperCase()}
                                  </span>
                                )}
                              </span>
                              <span className="font-semibold text-text whitespace-nowrap">{cleanSymbol(sym)}</span>
                            </div>
                          </td>
                          {colVisible("position") && (
                            <td className="px-2 py-2.5 text-left whitespace-nowrap">
                              <span
                                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                                  a.side === "long" ? "bg-gain/10 text-gain" : "bg-loss/10 text-loss"
                                }`}
                              >
                                {a.side}
                              </span>
                            </td>
                          )}
                          {colVisible("leverage") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-left whitespace-nowrap">
                              {fmtLev(a.leverage)}
                              {a.leverageIsMax && <span className="text-muted text-[10px] ml-1">max</span>}
                            </td>
                          )}
                          {colVisible("pnl") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-left whitespace-nowrap">
                              {a.pnl == null ? (
                                <span className="text-muted">—</span>
                              ) : (
                                <>
                                  <span
                                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold font-mono tabular-nums ${
                                      a.pnl > 0
                                        ? "bg-gain/10 text-gain"
                                        : a.pnl < 0
                                        ? "bg-loss/10 text-loss"
                                        : "bg-panel-soft text-muted"
                                    }`}
                                  >
                                    {fmtUsd(a.pnl)}
                                  </span>
                                  {a.pnlPct != null && (
                                    <span className="block text-[10px] text-muted">
                                      {a.pnlPct >= 0 ? "+" : ""}
                                      {(a.pnlPct * 100).toFixed(2)}%
                                    </span>
                                  )}
                                </>
                              )}
                            </td>
                          )}
                          {colVisible("margin") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-left whitespace-nowrap">
                              {fmtMoney(a.marginUsd)}
                            </td>
                          )}
                          {colVisible("lastPrice") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-left">
                              {fmtPxVal(a.lastPrice)}
                            </td>
                          )}
                          {colVisible("trigger") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-left">
                              {fmtPxVal(a.trigger_price)}
                            </td>
                          )}
                          {colVisible("firedPrice") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-left">
                              {fmtPxVal(a.fired_price)}
                            </td>
                          )}
                          {colVisible("plan") && (
                            <td className="px-2 py-2.5">
                              <div className="flex flex-col gap-0.5 text-left font-mono tabular-nums leading-tight">
                                <span className="whitespace-nowrap">
                                  <span className="text-[10px] text-muted">EP: </span>
                                  <span>{fmtPxVal(a.entry_price)}</span>
                                </span>
                                <span className="whitespace-nowrap">
                                  <span className="text-[10px] text-muted">SL: </span>
                                  <span className={a.sl_fired_at ? "text-loss font-semibold" : undefined}>
                                    {fmtPxVal(a.stop_loss)}
                                  </span>
                                </span>
                                <span className="whitespace-nowrap">
                                  <span className="text-[10px] text-muted">TP: </span>
                                  <span className={a.tp_fired_at ? "text-gain font-semibold" : undefined}>
                                    {fmtPxVal(a.take_profit)}
                                  </span>
                                </span>
                              </div>
                            </td>
                          )}
                          {colVisible("orderType") && (
                            <td className="px-2 py-2.5 text-left">
                              {a.order_type ? (
                                <span className="px-1.5 py-0.5 rounded bg-panel-soft border border-line text-[10px] font-mono text-muted">
                                  {ORDER_TYPE_LABELS[a.order_type] ?? a.order_type}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          )}
                          {colVisible("notes") && (
                            <td className="px-2 py-2.5 max-w-[160px] text-left">
                              {a.notes ? (
                                <span className="block truncate" title={a.notes}>
                                  {a.notes}
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                          )}
                          {colVisible("firedAt") && (
                            <td className="px-2 py-2.5 font-mono tabular-nums text-muted whitespace-nowrap text-left">
                              {fmtDateTime(a.fired_at)}
                            </td>
                          )}
                          <td className="px-2 py-2.5 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setChartAlert(a)}
                                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-accent hover:bg-accent/10 border border-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
                                title={`Open ${cleanSymbol(a.symbol)} interactive chart with trade setup`}
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
                                onClick={() => setClosingAlert(a)}
                                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-rose-400 hover:bg-rose-400/10 border border-rose-400/20 transition-colors flex items-center gap-1 cursor-pointer"
                                title="Close trade"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <line x1="15" y1="9" x2="9" y2="15" />
                                  <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                                <span>Close</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditing(a);
                                  setEditingIsArchived(false);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-mono font-medium text-muted hover:text-text hover:bg-panel-soft border border-line transition-colors flex items-center gap-1 cursor-pointer"
                                title="Edit trade"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => archiveTradeAlert(a.id)}
                                className="p-1 rounded text-muted hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
                                title="Archive trade"
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
              </div>
              {hasPaging && (
                <div className="flex items-center justify-center gap-4 text-xs text-muted mt-3">
                  <button
                    type="button"
                    disabled={safePage === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    className="btn-ghost px-3 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Prev
                  </button>
                  <span className="num">
                    Page {safePage + 1} of {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={safePage >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                    className="btn-ghost px-3 py-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {activeTab === "closed" && (
        <ClosedTradesTab
          closedAlerts={closedAlerts}
          onEdit={(alert) => {
            setEditing(alert);
            setEditingIsArchived(false);
          }}
          onArchive={(alert) => archiveTradeAlert(alert.id)}
        />
      )}

      {activeTab === "archive" && (
        <ArchivedTradesTab
          archivedAlerts={archivedAlerts}
          onEdit={(alert) => {
            setEditing(alert);
            setEditingIsArchived(true);
          }}
          onRestore={restoreArchivedTradeAlert}
          onDeletePermanent={deleteArchivedPermanent}
        />
      )}

      {notice && <p className="text-xs text-muted">{notice}</p>}

      <p className="text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
              pricesLoading
                ? "bg-panel-soft text-muted"
                : pricesError
                ? "bg-loss/10 text-loss"
                : "bg-gain/10 text-gain"
            }`}
          >
            {pricesLoading ? "Loading" : pricesError ? "Offline" : "Live"}
          </span>
          <span className="tabular-nums">
            Prices refresh every {pricesRefreshInterval}s · last update{" "}
            {formatLastRefreshed(lastRefreshed)}
          </span>
        </span>
      </p>

      {/* Modals */}
      <ManualTradeModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        onSuccess={refreshAllAlerts}
        icons={icons}
      />

      <CloseTradeModal
        alert={closingAlert}
        livePrice={
          closingAlert ? live[closingAlert.symbol.toUpperCase()] ?? null : null
        }
        open={closingAlert !== null}
        onClose={() => setClosingAlert(null)}
        onSuccess={refreshAllAlerts}
      />

      {editing && (
        <TradeEditModal
          alert={editing}
          isArchived={editingIsArchived}
          maxLeverage={details[editing.symbol.toUpperCase()]?.maxLeverage ?? null}
          onClose={() => setEditing(null)}
          onSaved={handleEditSaved}
        />
      )}

      {confirmDelete && (
        <ModalShell
          onClose={() => setConfirmDelete(null)}
          title="Delete Trade Alert"
        >
          <div className="space-y-4">
            <p className="text-xs text-muted">
              Are you sure you want to delete the trade alert for{" "}
              <span className="font-semibold text-text">
                {cleanSymbol(confirmDelete.symbol)}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-muted hover:text-text transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteTrade(confirmDelete.id)}
                className="px-4 py-2 rounded-lg bg-loss hover:brightness-110 text-white text-xs font-semibold transition-all cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </ModalShell>
      )}

      {calcModalOpen && (
        <PositionCalculatorModal
          open={calcModalOpen}
          onClose={() => setCalcModalOpen(false)}
          onApply={() => {
            setManualModalOpen(true);
          }}
        />
      )}

      {chartAlert && (
        <ChartModal
          isOpen={!!chartAlert}
          onClose={() => setChartAlert(null)}
          symbol={chartAlert.symbol}
          setup={{
            symbol: chartAlert.symbol,
            side: chartAlert.side === "long" ? "LONG" : "SHORT",
            trigger_price: chartAlert.trigger_price,
            entry_price: chartAlert.entry_price ?? chartAlert.fired_price,
            stop_loss: chartAlert.stop_loss,
            take_profit: chartAlert.take_profit,
            order_type: chartAlert.order_type,
          }}
        />
      )}
    </div>
  );
}
