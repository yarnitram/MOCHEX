"use client";

import { useRef, useState } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserItem {
  id: string;
  username: string;
  displayName: string;
}

interface ParsedRow {
  rowIndex: number;
  symbol: string;
  order_type: string;
  entry_price: string;
  stop_loss: string;
  take_profit: string;
  trigger_price: string;
  trigger_direction: string;
  notes: string;
  user_id: string;
  // client-side validation
  clientError?: string;
}

interface RowResult {
  rowIndex: number;
  symbol: string;
  user_id: string;
  status: "imported" | "skipped" | "error";
  reason?: string;
}

interface ImportSummary {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
}

// ─── CSV template ─────────────────────────────────────────────────────────────

const TEMPLATE_CSV = `symbol,order_type,entry_price,stop_loss,take_profit,trigger_price,trigger_direction,notes,user_id
BTC_USDT,limit,64200,62000,68500,,,Bull flag breakout,
ETH_USDT,trigger_limit,3100,2900,3500,3050,below,Support retest,
SOL_USDT,market,150,140,175,,,Momentum play,
`.trim();

const REQUIRED_HEADERS = ["symbol", "order_type", "entry_price", "stop_loss", "take_profit"];
const VALID_ORDER_TYPES = ["limit", "market", "trigger_limit"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function downloadTemplate() {
  const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "watchlist_import_template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsvText(raw: string, defaultUserId: string): ParsedRow[] {
  const lines = raw.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const separator = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));

  const get = (cells: string[], col: string): string => {
    const idx = headers.indexOf(col);
    return idx >= 0 ? (cells[idx] ?? "").trim().replace(/^["']|["']$/g, "") : "";
  };

  return lines.slice(1).map((line, i): ParsedRow => {
    const cells = line.split(separator);
    const row: ParsedRow = {
      rowIndex: i + 2,
      symbol: get(cells, "symbol").toUpperCase(),
      order_type: get(cells, "order_type").toLowerCase(),
      entry_price: get(cells, "entry_price"),
      stop_loss: get(cells, "stop_loss"),
      take_profit: get(cells, "take_profit"),
      trigger_price: get(cells, "trigger_price"),
      trigger_direction: get(cells, "trigger_direction").toLowerCase(),
      notes: get(cells, "notes"),
      user_id: get(cells, "user_id") || defaultUserId,
    };

    // Client-side validation
    const sym = row.symbol.includes("_") ? row.symbol : row.symbol ? `${row.symbol}_USDT` : "";
    if (!sym) { row.clientError = "symbol required"; return row; }
    row.symbol = sym;

    if (!VALID_ORDER_TYPES.includes(row.order_type)) {
      row.clientError = `invalid order_type "${row.order_type}"`;
      return row;
    }
    if (!row.entry_price || isNaN(Number(row.entry_price)) || Number(row.entry_price) <= 0) { row.clientError = "entry_price must be > 0"; return row; }
    if (!row.stop_loss || isNaN(Number(row.stop_loss)) || Number(row.stop_loss) <= 0) { row.clientError = "stop_loss must be > 0"; return row; }
    if (!row.take_profit || isNaN(Number(row.take_profit)) || Number(row.take_profit) <= 0) { row.clientError = "take_profit must be > 0"; return row; }
    if (row.order_type === "trigger_limit" && (!row.trigger_price || isNaN(Number(row.trigger_price)) || Number(row.trigger_price) <= 0)) {
      row.clientError = "trigger_price required for trigger_limit";
    }
    if (!row.user_id) {
      row.clientError = "user_id required — select a default user above";
    }

    return row;
  });
}

// ─── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status, reason }: { status: string; reason?: string }) {
  if (status === "imported") {
    return <span className="text-gain font-bold text-[11px]">✅ Imported</span>;
  }
  if (status === "skipped") {
    return (
      <span className="text-amber-400 font-bold text-[11px]" title={reason}>
        ⏭ Skipped
      </span>
    );
  }
  if (status === "error" || status === "invalid") {
    return (
      <span className="text-loss font-bold text-[11px]" title={reason}>
        ❌ Error
      </span>
    );
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  users: UserItem[];
}

export function WatchlistImportTab({ users }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteText, setPasteText] = useState("");
  const [defaultUserId, setDefaultUserId] = useState(users[0]?.id ?? "");
  const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [results, setResults] = useState<RowResult[] | null>(null);

  const validRows = parsedRows?.filter((r) => !r.clientError) ?? [];
  const invalidRows = parsedRows?.filter((r) => r.clientError) ?? [];

  function handleReset() {
    setParsedRows(null);
    setParseError(null);
    setSummary(null);
    setResults(null);
    setPasteText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleParse(raw: string) {
    setParseError(null);
    setSummary(null);
    setResults(null);
    const separator = raw.includes("\t") ? "\t" : ",";
    const firstLine = raw.trim().split(/\r?\n/)[0] ?? "";
    const headers = firstLine.split(separator).map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
    const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      setParseError(`Missing required column(s): ${missing.join(", ")}`);
      setParsedRows(null);
      return;
    }
    const rows = parseCsvText(raw, defaultUserId);
    if (rows.length === 0) {
      setParseError("No data rows found. Make sure your file has at least one data row below the header.");
      setParsedRows(null);
      return;
    }
    setParsedRows(rows);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      handleParse(text);
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (validRows.length === 0) return;
    setImporting(true);
    setSummary(null);
    setResults(null);

    try {
      const payload = validRows.map((r) => ({
        symbol: r.symbol,
        order_type: r.order_type,
        entry_price: Number(r.entry_price),
        stop_loss: Number(r.stop_loss),
        take_profit: Number(r.take_profit),
        trigger_price: r.trigger_price ? Number(r.trigger_price) : null,
        trigger_direction: r.trigger_direction || null,
        notes: r.notes || null,
        user_id: r.user_id || defaultUserId,
      }));

      const res = await fetch("/api/admin/watchlist-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload, defaultUserId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");
      setSummary(data.summary);
      setResults(data.results);
    } catch (err) {
      setParseError((err as Error).message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-text font-mono">📥 Bulk Watchlist Import</h2>
          <p className="text-xs text-muted mt-0.5">
            Import multiple watchlist setups for any user via CSV or pasted spreadsheet data.
          </p>
        </div>
        <button
          type="button"
          onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-panel border border-line hover:border-accent text-xs font-semibold text-text hover:text-accent transition-all cursor-pointer"
        >
          <span>⬇️</span>
          <span>Download Template CSV</span>
        </button>
      </div>

      {/* Default User Picker */}
      <div className="p-4 rounded-xl bg-panel border border-line flex flex-wrap items-center gap-3">
        <label className="text-xs font-semibold text-muted whitespace-nowrap">Default User (for rows without user_id):</label>
        <select
          value={defaultUserId}
          onChange={(e) => {
            setDefaultUserId(e.target.value);
            if (parsedRows) handleReset();
          }}
          className="flex-1 min-w-[200px] px-3 py-1.5 rounded-xl bg-canvas border border-line text-text text-xs font-mono focus:outline-none focus:border-accent cursor-pointer"
        >
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.displayName || u.username} ({u.username})
            </option>
          ))}
        </select>
        <span className="text-[11px] text-muted font-mono truncate max-w-[260px]" title={defaultUserId}>
          ID: {defaultUserId}
        </span>
      </div>

      {/* Input mode tabs */}
      <div className="p-4 rounded-xl bg-panel border border-line space-y-3">
        <div className="flex gap-2">
          {(["file", "paste"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setInputMode(mode); handleReset(); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                inputMode === mode
                  ? "bg-accent text-white shadow-sm"
                  : "bg-canvas border border-line text-muted hover:text-text"
              }`}
            >
              {mode === "file" ? "📁 Upload CSV / TSV" : "📋 Paste Spreadsheet Data"}
            </button>
          ))}
        </div>

        {inputMode === "file" ? (
          <div
            className="flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed border-line hover:border-accent/60 bg-canvas/40 transition-all cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <span className="text-3xl">📂</span>
            <p className="text-xs font-semibold text-text">Click to select CSV or TSV file</p>
            <p className="text-[11px] text-muted">Comma or tab separated — must match the template headers</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[11px] text-muted">
              Paste directly from Google Sheets, Excel, or any CSV. First row must be the header row.
            </p>
            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={TEMPLATE_CSV}
              className="w-full px-3 py-2 rounded-xl bg-canvas border border-line text-text placeholder:text-muted/40 text-[11px] font-mono focus:outline-none focus:border-accent resize-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleParse(pasteText)}
                disabled={!pasteText.trim()}
                className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold hover:bg-accent/90 disabled:opacity-50 cursor-pointer transition-colors"
              >
                Parse Data
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-1.5 rounded-lg bg-canvas border border-line text-muted text-xs font-semibold hover:text-text cursor-pointer transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Parse error */}
      {parseError && (
        <div className="p-3 rounded-xl bg-loss/10 border border-loss/30 text-loss text-xs font-medium animate-in fade-in duration-150">
          ❌ {parseError}
        </div>
      )}

      {/* Preview Table */}
      {parsedRows && parsedRows.length > 0 && !summary && (
        <div className="space-y-3 animate-in fade-in duration-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold text-text">{parsedRows.length} rows parsed</span>
              {validRows.length > 0 && (
                <span className="text-gain font-semibold">✅ {validRows.length} valid</span>
              )}
              {invalidRows.length > 0 && (
                <span className="text-loss font-semibold">❌ {invalidRows.length} invalid</span>
              )}
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] text-muted hover:text-loss cursor-pointer"
            >
              ✕ Clear
            </button>
          </div>

          <div className="rounded-xl border border-line overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="bg-panel border-b border-line text-muted">
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Symbol</th>
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    <th className="px-3 py-2 text-right font-semibold">EP</th>
                    <th className="px-3 py-2 text-right font-semibold">SL</th>
                    <th className="px-3 py-2 text-right font-semibold">TP</th>
                    <th className="px-3 py-2 text-right font-semibold">Trigger</th>
                    <th className="px-3 py-2 text-left font-semibold">Notes</th>
                    <th className="px-3 py-2 text-left font-semibold">User</th>
                    <th className="px-3 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.map((row) => {
                    const isInvalid = !!row.clientError;
                    const userLabel = users.find((u) => u.id === row.user_id)?.username ?? row.user_id?.slice(0, 8) ?? "?";
                    return (
                      <tr
                        key={row.rowIndex}
                        className={`border-b border-line/50 last:border-0 transition-colors ${
                          isInvalid ? "bg-loss/5" : "hover:bg-panel/60"
                        }`}
                      >
                        <td className="px-3 py-1.5 text-muted">{row.rowIndex}</td>
                        <td className={`px-3 py-1.5 font-bold ${isInvalid ? "text-loss" : "text-text"}`}>
                          {row.symbol || <span className="text-muted italic">(blank)</span>}
                        </td>
                        <td className="px-3 py-1.5 text-muted">{row.order_type}</td>
                        <td className="px-3 py-1.5 text-right">{row.entry_price}</td>
                        <td className="px-3 py-1.5 text-right">{row.stop_loss}</td>
                        <td className="px-3 py-1.5 text-right">{row.take_profit}</td>
                        <td className="px-3 py-1.5 text-right text-muted">{row.trigger_price || "—"}</td>
                        <td className="px-3 py-1.5 text-muted max-w-[140px] truncate" title={row.notes}>{row.notes || "—"}</td>
                        <td className="px-3 py-1.5 text-accent">{userLabel}</td>
                        <td className="px-3 py-1.5">
                          {isInvalid ? (
                            <span className="text-loss font-bold" title={row.clientError}>❌ {row.clientError}</span>
                          ) : (
                            <span className="text-gain font-bold">✅ Valid</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {validRows.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleImport}
                disabled={importing}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-accent text-white text-xs font-bold hover:bg-accent/90 disabled:opacity-50 transition-all cursor-pointer shadow-lg shadow-accent/20"
              >
                {importing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Importing...</span>
                  </>
                ) : (
                  <>
                    <span>📥</span>
                    <span>Import {validRows.length} Valid Row{validRows.length !== 1 ? "s" : ""}</span>
                  </>
                )}
              </button>
              {invalidRows.length > 0 && (
                <span className="text-[11px] text-amber-400">
                  ⚠️ {invalidRows.length} row{invalidRows.length !== 1 ? "s" : ""} with errors will be skipped
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Import Results */}
      {summary && results && (
        <div className="space-y-3 animate-in fade-in duration-200">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total", value: summary.total, color: "text-text", bg: "bg-panel" },
              { label: "✅ Imported", value: summary.imported, color: "text-gain", bg: "bg-gain/10" },
              { label: "⏭ Skipped", value: summary.skipped, color: "text-amber-400", bg: "bg-amber-400/10" },
              { label: "❌ Errors", value: summary.errors, color: "text-loss", bg: "bg-loss/10" },
            ].map((c) => (
              <div key={c.label} className={`p-3 rounded-xl border border-line ${c.bg} text-center`}>
                <div className={`text-2xl font-extrabold font-mono ${c.color}`}>{c.value}</div>
                <div className="text-[11px] text-muted mt-0.5">{c.label}</div>
              </div>
            ))}
          </div>

          {/* Results table */}
          <div className="rounded-xl border border-line overflow-hidden">
            <div className="overflow-x-auto max-h-80">
              <table className="w-full text-[11px] font-mono">
                <thead>
                  <tr className="bg-panel border-b border-line text-muted">
                    <th className="px-3 py-2 text-left font-semibold">#</th>
                    <th className="px-3 py-2 text-left font-semibold">Symbol</th>
                    <th className="px-3 py-2 text-left font-semibold">User</th>
                    <th className="px-3 py-2 text-left font-semibold">Result</th>
                    <th className="px-3 py-2 text-left font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const userLabel = users.find((u) => u.id === r.user_id)?.username ?? r.user_id?.slice(0, 8) ?? "?";
                    return (
                      <tr key={r.rowIndex} className="border-b border-line/50 last:border-0 hover:bg-panel/60 transition-colors">
                        <td className="px-3 py-1.5 text-muted">{r.rowIndex}</td>
                        <td className="px-3 py-1.5 font-bold text-text">{r.symbol}</td>
                        <td className="px-3 py-1.5 text-accent">{userLabel}</td>
                        <td className="px-3 py-1.5">
                          <StatusBadge status={r.status} reason={r.reason} />
                        </td>
                        <td className="px-3 py-1.5 text-muted">{r.reason ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-panel border border-line text-xs text-muted font-semibold hover:text-text cursor-pointer transition-colors"
          >
            ← Import Another Batch
          </button>
        </div>
      )}
    </div>
  );
}
