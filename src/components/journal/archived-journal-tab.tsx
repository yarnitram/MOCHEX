"use client";

import { useState } from "react";
import type { ArchivedJournalTrade } from "@/lib/types";
import { cleanSymbol, fmtPx } from "@/lib/format";
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

interface Props {
  archivedTrades: ArchivedJournalTrade[];
  onRestore: (trade: ArchivedJournalTrade) => void;
  onDeletePermanent: (trade: ArchivedJournalTrade) => void;
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

function getNoteString(notes: ArchivedJournalTrade["notes"]): string {
  if (!notes) return "";
  if (typeof notes === "string") return notes;
  return [notes.pre_trade_thesis, notes.post_trade_review].filter(Boolean).join(" — ");
}

export function ArchivedJournalTab({
  archivedTrades,
  onRestore,
  onDeletePermanent,
}: Props) {
  const [chartTrade, setChartTrade] = useState<ArchivedJournalTrade | null>(null);
  const [selectedScreenshots, setSelectedScreenshots] = useState<string[] | null>(null);
  const [selectedScreenshotIndex, setSelectedScreenshotIndex] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlGuide, setShowSqlGuide] = useState(false);

  const filteredTrades = archivedTrades.filter((t) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const noteText = getNoteString(t.notes);
    const tagMatch =
      t.tags &&
      t.tags.some((tag) => {
        const name = typeof tag === "string" ? tag : tag.name;
        return name.toLowerCase().includes(q);
      });
    return (
      t.symbol.toLowerCase().includes(q) ||
      noteText.toLowerCase().includes(q) ||
      tagMatch
    );
  });

  const handleCopySql = () => {
    const sql = `-- Migration: 025_archived_journal_trades.sql
CREATE TABLE IF NOT EXISTS public.archived_journal_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_trade_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price numeric NOT NULL,
  exit_price numeric,
  size numeric NOT NULL,
  stop_price numeric,
  fees numeric DEFAULT 0,
  entry_time timestamptz,
  exit_time timestamptz,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  pnl_dollars numeric,
  pnl_pct numeric,
  notes text,
  discipline_score int CHECK (discipline_score BETWEEN 1 AND 5),
  tags text[],
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_reason text DEFAULT 'user_soft_delete',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archived_journal_trades_acc ON public.archived_journal_trades(account_id);
CREATE INDEX IF NOT EXISTS idx_archived_journal_trades_sym ON public.archived_journal_trades(symbol);

ALTER TABLE public.archived_journal_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access to archived_journal_trades"
  ON public.archived_journal_trades FOR ALL
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon read to archived_journal_trades"
  ON public.archived_journal_trades FOR SELECT
  TO anon USING (true);
CREATE POLICY "Allow anon insert to archived_journal_trades"
  ON public.archived_journal_trades FOR INSERT
  TO anon WITH CHECK (true);
CREATE POLICY "Allow anon delete to archived_journal_trades"
  ON public.archived_journal_trades FOR DELETE
  TO anon USING (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleRestoreClick = async (trade: ArchivedJournalTrade) => {
    if (restoringId) return;
    setRestoringId(trade.id);
    try {
      await onRestore(trade);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteClick = async (trade: ArchivedJournalTrade) => {
    if (deletingId) return;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete ${cleanSymbol(trade.symbol)} from archive? This action cannot be undone.`
      )
    ) {
      return;
    }
    setDeletingId(trade.id);
    try {
      await onDeletePermanent(trade);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Migration Notice Banner / SQL Helper */}
      <div className="rounded-xl border border-line bg-panel/40 p-3.5 text-xs text-muted flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🛡️</span>
          <div>
            <span className="text-text font-medium">Safe Archive Storage: </span>
            <span>
              Soft-deleted trades are kept safe with automatic dual-layer caching (local cache + Supabase table).
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setShowSqlGuide(!showSqlGuide)}
            className="px-2.5 py-1 rounded text-[11px] font-mono text-muted hover:text-text hover:bg-panel-soft border border-line transition-colors cursor-pointer"
          >
            {showSqlGuide ? "Hide SQL" : "View Supabase SQL"}
          </button>
          <button
            type="button"
            onClick={handleCopySql}
            className="px-2.5 py-1 rounded text-[11px] font-mono text-accent hover:bg-accent/10 border border-accent/20 transition-colors flex items-center gap-1 cursor-pointer"
          >
            {copiedSql ? "✓ Copied!" : "📋 Copy Migration SQL"}
          </button>
        </div>
      </div>

      {showSqlGuide && (
        <div className="rounded-xl border border-line bg-panel-soft/50 p-4 text-xs font-mono">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-text">Supabase Migration 025 (Optional)</span>
            <span className="text-[10px] text-muted">Runs seamlessly even before executing this</span>
          </div>
          <p className="text-[11px] text-muted mb-2 font-sans">
            If you have direct access to your Supabase SQL Editor, you can execute the SQL below to store archived journal entries in your database cloud.
          </p>
          <pre className="p-3 rounded-lg bg-canvas text-[11px] text-text overflow-x-auto border border-line">
{`-- Run in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS public.archived_journal_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_trade_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('long', 'short')),
  entry_price numeric NOT NULL,
  exit_price numeric,
  size numeric NOT NULL,
  stop_price numeric,
  fees numeric DEFAULT 0,
  entry_time timestamptz,
  exit_time timestamptz,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  pnl_dollars numeric,
  pnl_pct numeric,
  notes text,
  discipline_score int CHECK (discipline_score BETWEEN 1 AND 5),
  tags text[],
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_reason text DEFAULT 'user_soft_delete',
  created_at timestamptz NOT NULL DEFAULT now()
);`}
          </pre>
        </div>
      )}

      {/* Search / Filter Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search archived trades by coin, notes, tags..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-panel border border-line rounded-lg text-text focus:outline-none focus:border-accent"
          />
          <svg
            className="w-3.5 h-3.5 text-muted absolute left-2.5 top-1/2 -translate-y-1/2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <span className="text-xs text-muted font-mono">
          {filteredTrades.length} archived record{filteredTrades.length === 1 ? "" : "s"}
        </span>
      </div>

      {archivedTrades.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-line rounded-xl bg-panel/30">
          <span className="text-3xl mb-2">📦</span>
          <h3 className="text-sm font-semibold text-text">Journal Archive is Empty</h3>
          <p className="text-xs text-muted max-w-sm mt-1">
            When you delete trades from the active journal ledger, they will be archived here safely. You can restore them anytime with full metrics, notes, and tags intact.
          </p>
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="py-12 text-center border border-line rounded-xl bg-panel/30 text-xs text-muted">
          No archived trades match &quot;{search}&quot;.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl hairline bg-panel/40 striped">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="hairline-b bg-panel-soft/60 font-mono text-[10px] uppercase text-muted tracking-wider">
              <tr>
                <th className="py-3 px-4">Coin</th>
                <th className="py-3 px-4">Direction</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Entry</th>
                <th className="py-3 px-4 text-right">Exit</th>
                <th className="py-3 px-4 text-right">Size</th>
                <th className="py-3 px-4 text-right">PnL ($)</th>
                <th className="py-3 px-4 text-right">PnL (%)</th>
                <th className="py-3 px-4">Archived At</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredTrades.map((t) => {
                const coin = cleanSymbol(t.symbol);
                const isLong = t.direction === "long";
                const pnl = t.pnl_dollars;
                const pnlPct = t.pnl_pct;
                const isGain = (pnl ?? 0) > 0;
                const isLoss = (pnl ?? 0) < 0;

                const noteText = getNoteString(t.notes);

                const rawScreenshots = (t as unknown as { screenshots?: string[] }).screenshots;
                const singleScreenshot = (t as unknown as { screenshot_url?: string }).screenshot_url;
                const screenshots =
                  rawScreenshots && rawScreenshots.length > 0
                    ? rawScreenshots
                    : singleScreenshot
                    ? [singleScreenshot]
                    : [];

                return (
                  <tr key={t.id} className="hover:bg-panel-soft/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-text">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-text">{coin}</span>
                          {screenshots.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedScreenshots(screenshots);
                                setSelectedScreenshotIndex(0);
                              }}
                              title={`${screenshots.length} screenshot${screenshots.length > 1 ? "s" : ""} attached`}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-accent/15 text-accent border border-accent/25 hover:bg-accent/25 transition-colors cursor-pointer"
                            >
                              <CameraIcon className="w-3 h-3" />
                              <span>{screenshots.length}</span>
                            </button>
                          )}
                        </div>
                        {noteText && (
                          <span className="text-[10px] text-muted line-clamp-1 max-w-[140px]" title={noteText}>
                            {noteText}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block font-semibold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide border ${
                          isLong
                            ? "bg-gain/15 text-gain border-gain/20"
                            : "bg-loss/15 text-loss border-loss/20"
                        }`}
                      >
                        {t.direction}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded border text-[10px] font-mono uppercase tracking-wide ${
                          t.status === "closed"
                            ? "bg-panel-soft text-muted border-line"
                            : "bg-accent/15 text-accent border-accent/25"
                        }`}
                      >
                        {t.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-muted">{fmtPx(t.entry_price)}</td>
                    <td className="py-3 px-4 font-mono text-right text-text">
                      {t.exit_price != null ? fmtPx(t.exit_price) : "—"}
                    </td>
                    <td className="py-3 px-4 font-mono text-right text-text">{t.size}</td>
                    <td
                      className={`py-3 px-4 font-mono text-right font-medium ${
                        pnl == null
                          ? "text-muted"
                          : isGain
                          ? "text-gain"
                          : isLoss
                          ? "text-loss"
                          : "text-muted"
                      }`}
                    >
                      {pnl != null ? `${isGain ? "+" : ""}$${Number(pnl).toFixed(2)}` : "—"}
                    </td>
                    <td
                      className={`py-3 px-4 font-mono text-right font-medium ${
                        pnlPct == null
                          ? "text-muted"
                          : isGain
                          ? "text-gain"
                          : isLoss
                          ? "text-loss"
                          : "text-muted"
                      }`}
                    >
                      {pnlPct != null ? `${isGain ? "+" : ""}${Number(pnlPct).toFixed(2)}%` : "—"}
                    </td>
                    <td className="py-3 px-4 text-muted text-[11px] whitespace-nowrap">
                      {formatDate(t.archived_at)}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Interactive Chart */}
                        <button
                          type="button"
                          onClick={() => setChartTrade(t)}
                          title={`Open ${coin} chart`}
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

                        {/* Restore Button */}
                        <button
                          type="button"
                          disabled={restoringId === t.id}
                          onClick={() => handleRestoreClick(t)}
                          title="Restore back to Active Journal Ledger"
                          className="px-2 py-1 rounded text-[11px] font-mono font-medium text-amber-400 hover:bg-amber-400/10 border border-amber-400/20 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M8 7L3 12L8 17M3 12H21M16 7L21 12L16 17" />
                          </svg>
                          {restoringId === t.id ? "Restoring…" : "Restore"}
                        </button>

                        {/* Permanent Delete Button */}
                        <button
                          type="button"
                          disabled={deletingId === t.id}
                          onClick={() => handleDeleteClick(t)}
                          title="Delete Permanently from Archive"
                          className="p-1 rounded text-muted hover:text-rose-400 hover:bg-rose-400/10 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6" />
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
      )}

      {chartTrade && (
        <ChartModal
          isOpen={!!chartTrade}
          onClose={() => setChartTrade(null)}
          symbol={chartTrade.symbol}
          setup={{
            symbol: chartTrade.symbol,
            side: chartTrade.direction === "long" ? "LONG" : "SHORT",
            entry_price: chartTrade.entry_price,
            stop_loss: chartTrade.stop_price,
            take_profit: chartTrade.exit_price,
            order_type: "market",
          }}
        />
      )}

      {selectedScreenshots && selectedScreenshots.length > 0 && (
        <ImageLightboxModal
          isOpen={!!selectedScreenshots}
          images={selectedScreenshots}
          initialIndex={selectedScreenshotIndex}
          onClose={() => setSelectedScreenshots(null)}
        />
      )}
    </div>
  );
}
