#!/usr/bin/env node
/**
 * MOCHEX — Alert Watcher (always-on)
 * =================================
 * Polls the MEXC futures API, checks every saved watchlist coin against its
 * price trigger, and notifies the user (Discord + desktop) when a trigger
 * fires, including the saved trade plan (entry / stop-loss / take-profit).
 *
 * Reads Supabase config from `.env.local` (service-role key).
 * Run:  node scripts/alert-watcher.mjs
 *       node scripts/alert-watcher.mjs --interval 10
 */
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ------------------------------------------------------------------ config
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const intervalIdx = args.indexOf("--interval");
const POLL_MS = (Number(args[intervalIdx + 1]) || 10) * 1000;

// Load .env.local
const env = loadDotEnv(path.join(ROOT, ".env.local"));
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const MEXC_TICKER = "https://contract.mexc.com/api/v1/contract/ticker";

// ------------------------------------------------------------------ helpers
function loadDotEnv(file) {
  const out = {};
  try {
    if (!existsSync(file)) return out;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {}
  return out;
}

async function supabase(pathname, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${pathname} → ${res.status}`);
  return res.json();
}

async function getLatestPrices() {
  const res = await fetch(MEXC_TICKER, {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`MEXC ticker → ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error("MEXC ticker failed");
  const map = {};
  for (const t of json.data) if (t.lastPrice > 0) map[t.symbol] = t.lastPrice;
  return map;
}

function fireDiscord(webhook, content) {
  return fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "MOCHEX", content }),
  });
}

function desktopNotify(title, body) {
  const ps = [
    "Add-Type -AssemblyName System.Windows.Forms;",
    "$n=New-Object System.Windows.Forms.NotifyIcon;",
    "$n.Icon=[System.Drawing.SystemIcons]::Information;",
    `$n.BalloonTipTitle=[char]34+${JSON.stringify(title)}+[char]34;`,
    `$n.BalloonTipText=[char]34+${JSON.stringify(body)}+[char]34;`,
    "$n.Visible=$true;",
    "$n.ShowBalloonTip(8000);",
    "Start-Sleep -Milliseconds 200;",
    "$n.Dispose();",
  ].join(" ");
  return new Promise((resolve) => {
    const child = spawn("powershell", ["-NoProfile", "-Command", ps], {
      windowsHide: true,
    });
    child.on("close", resolve);
    child.on("error", resolve);
  });
}

// ------------------------------------------------------------------ main
function stamp() {
  return new Date().toLocaleTimeString();
}

async function checkAll() {
  const [watchlist, settingsByUser] = await Promise.all([
    supabase(
      "/rest/v1/watchlist_items?select=id,user_id,symbol,trigger_price,trigger_direction,entry_price,stop_loss,take_profit,order_type,notes,alert_fired"
    ),
    (async () => {
      const rows = await supabase(
        "/rest/v1/user_settings?select=user_id,discord_webhook_url,notify_discord,notify_desktop"
      );
      const map = {};
      for (const r of rows) map[r.user_id] = r;
      return map;
    })(),
  ]);

  const activeItems = watchlist.filter(
    (i) => i.trigger_price != null && !i.alert_fired
  );
  if (activeItems.length === 0) return;

  const prices = await getLatestPrices();

  for (const item of activeItems) {
    const price = prices[item.symbol];
    if (price == null) continue;
    const trigger = Number(item.trigger_price);
    // Direction-aware crossing check. The modal always infers a direction at
    // save time; rows without one are skipped (consistent with the in-app
    // poller) instead of firing on every poll.
    const hit =
      item.trigger_direction === "below"
        ? price <= trigger
        : item.trigger_direction === "above"
          ? price >= trigger
          : false;
    if (!hit) continue;

    // Claim the fire atomically: only update rows whose alert_fired is still
    // false. An empty response means another watcher (browser poller or a
    // second instance) already fired it — skip the notification entirely.
    let claimed = [];
    try {
      claimed = await supabase(
        `/rest/v1/watchlist_items?id=eq.${item.id}&alert_fired=eq.false`,
        {
          method: "PATCH",
          body: JSON.stringify({
            alert_fired: true,
            alert_fired_at: new Date().toISOString(),
          }),
          headers: { Prefer: "return=representation" },
        }
      );
    } catch (e) {
      console.error("Claim-fired error:", e.message);
    }
    if (!Array.isArray(claimed) || claimed.length === 0) continue;

    console.log(
      `[${stamp()}] TRIGGER ${item.symbol} last=${price} trigger=${trigger}`
    );

    const isTriggerLimit = item.order_type === "trigger_limit";
    const isLong =
      item.entry_price != null && item.stop_loss != null
        ? Number(item.entry_price) >= Number(item.stop_loss)
        : item.trigger_direction === "below";

    if (isTriggerLimit) {
      // Trigger Limit: spawn new active watchlist item with trigger = EP, order_type = Limit
      if (item.entry_price != null) {
        const epDirection = isLong ? "below" : "above";
        try {
          await supabase("/rest/v1/watchlist_items", {
            method: "POST",
            body: JSON.stringify({
              user_id: item.user_id,
              symbol: item.symbol,
              trigger_price: item.entry_price,
              trigger_direction: epDirection,
              entry_price: item.entry_price,
              stop_loss: item.stop_loss,
              take_profit: item.take_profit,
              order_type: "limit",
              notes: item.notes,
              screenshot_urls: item.screenshot_urls || (item.screenshot_url ? [item.screenshot_url] : []),
              screenshot_url: item.screenshot_url ?? null,
            }),
            headers: { Prefer: "return=minimal" },
          });
        } catch (e) {
          console.error("TL spawn error:", e.message);
        }
      }
    } else {
      // Limit or Market: log to trade_alerts for the /trades page
      try {
        await supabase("/rest/v1/trade_alerts", {
          method: "POST",
          body: JSON.stringify({
            user_id: item.user_id,
            symbol: item.symbol,
            trigger_price: item.trigger_price,
            trigger_direction: item.trigger_direction ?? null,
            fired_price: price,
            entry_price: item.entry_price ?? null,
            stop_loss: item.stop_loss ?? null,
            take_profit: item.take_profit ?? null,
            order_type: item.order_type ?? null,
            notes: item.notes ?? null,
            watchlist_item_id: item.id,
            fired_at: new Date().toISOString(),
            screenshot_urls: item.screenshot_urls || (item.screenshot_url ? [item.screenshot_url] : []),
            screenshot_url: item.screenshot_url ?? null,
          }),
          headers: { Prefer: "return=minimal" },
        });
      } catch (e) {
        console.error("Trade-log error:", e.message);
      }
    }

    // Move original item to triggered_watchlist_items archive
    try {
      await supabase("/rest/v1/triggered_watchlist_items", {
        method: "POST",
        body: JSON.stringify({
          user_id: item.user_id,
          source_item_id: item.id,
          symbol: item.symbol,
          trigger_price: item.trigger_price,
          trigger_direction: item.trigger_direction ?? null,
          fired_price: price,
          entry_price: item.entry_price ?? null,
          stop_loss: item.stop_loss ?? null,
          take_profit: item.take_profit ?? null,
          order_type: item.order_type ?? null,
          notes: item.notes ?? null,
          fired_at: new Date().toISOString(),
          screenshot_urls: item.screenshot_urls || (item.screenshot_url ? [item.screenshot_url] : []),
          screenshot_url: item.screenshot_url ?? null,
        }),
        headers: { Prefer: "return=minimal" },
      });
    } catch (e) {
      // non-fatal if table unmigrated
    }

    // Remove from active watchlist_items
    try {
      await supabase(`/rest/v1/watchlist_items?id=eq.${item.id}`, {
        method: "DELETE",
      });
    } catch (e) {
      console.error("Watchlist delete error:", e.message);
    }

    // Build notification content with the trade plan.
    const plan = [];
    if (item.entry_price != null) plan.push(`**Entry:** ${item.entry_price}`);
    if (item.stop_loss != null) plan.push(`**Stop:** ${item.stop_loss}`);
    if (item.take_profit != null) plan.push(`**Target:** ${item.take_profit}`);
    const planText = plan.length
      ? `\nTrade plan (${isLong ? "LONG ↗" : "SHORT ↘"}) — ${plan.join(" · ")}`
      : "";

    const settings = settingsByUser[item.user_id];
    const notifyTitle = isTriggerLimit
      ? `🎯 **${item.symbol}** Trigger Limit hit — Limit armed at $${item.entry_price}`
      : `📈 **${item.symbol}** hit **$${price}** (trigger $${trigger})`;

    // Discord
    if (settings?.notify_discord !== false && settings?.discord_webhook_url) {
      await fireDiscord(
        settings.discord_webhook_url,
        `${notifyTitle}${planText}`
      ).catch((e) => console.error("Discord error:", e.message));
    }

    // Desktop
    if (settings?.notify_desktop !== false) {
      await desktopNotify(
        `${item.symbol} ${isTriggerLimit ? "TL Armed" : "Alert"}`,
        `Price $${price} reached trigger $${trigger}.${plan.length ? `\n${plan.join(" · ")}` : ""}`
      ).catch(() => {});
    }

    // Mark-fired already handled atomically above (claim step); nothing to do.
  }

  await checkSlTp(prices, settingsByUser);
}

/**
 * Check every logged trade plan for a stop-loss / take-profit hit.
 *
 * Runs alongside the watchlist scan so a hit is caught even when no browser
 * tab is open — the two share one price snapshot per poll.
 *
 * The level is claimed atomically (only while its `*_fired_at` is still null)
 * before anything is announced, so a level fires at most once no matter how
 * many pollers are running.
 */
async function checkSlTp(prices, settingsByUser) {
  let rows;
  try {
    rows = await supabase(
      "/rest/v1/trade_alerts?select=id,user_id,symbol,trigger_direction,entry_price,stop_loss,take_profit,margin_usd,leverage,notes,sl_fired_at,tp_fired_at&or=(sl_fired_at.is.null,tp_fired_at.is.null)"
    );
  } catch (e) {
    console.error("SL/TP fetch error:", e.message);
    return;
  }
  if (!Array.isArray(rows) || rows.length === 0) return;

  for (const row of rows) {
    const price = prices[row.symbol];
    if (price == null) continue;

    for (const level of hitLevels(row, price)) {
      const column = level === "sl" ? "sl_fired_at" : "tp_fired_at";
      const levelPrice = level === "sl" ? row.stop_loss : row.take_profit;

      // Claim atomically: the filter still requires the level to be unset, so
      // a poller that loses the race gets an empty array and stays silent.
      let claimed = [];
      try {
        claimed = await supabase(
          `/rest/v1/trade_alerts?id=eq.${row.id}&${column}=is.null`,
          {
            method: "PATCH",
            body: JSON.stringify({ [column]: new Date().toISOString() }),
            headers: { Prefer: "return=representation" },
          }
        );
      } catch (e) {
        console.error("SL/TP claim error:", e.message);
      }
      if (!Array.isArray(claimed) || claimed.length === 0) continue;

      const label = level === "sl" ? "Stop-loss" : "Take-profit";
      console.log(
        `[${stamp()}] ${level.toUpperCase()} ${row.symbol} last=${price} level=${levelPrice}`
      );

      const settings = settingsByUser[row.user_id];
      if (settings?.notify_discord !== false && settings?.discord_webhook_url) {
        await fireDiscord(
          settings.discord_webhook_url,
          `🎯 **${row.symbol}** hit **${level.toUpperCase()}** — last $${price} reached ${label.toLowerCase()} $${levelPrice}`
        ).catch((e) => console.error("Discord error:", e.message));
      }
      if (settings?.notify_desktop !== false) {
        await desktopNotify(
          `${row.symbol} hit ${level.toUpperCase()}`,
          `Last $${price} reached your ${label.toLowerCase()} at $${levelPrice}.`
        ).catch(() => {});
      }
    }
  }
}

/**
 * Which plan levels this snapshot has hit. Mirrors src/lib/sl-tp.ts — the
 * watcher is plain .mjs and cannot import TS, so the comparison is duplicated
 * here and must be kept in step with that module (and its tests).
 */
function hitLevels(row, price) {
  if (!Number.isFinite(price) || price <= 0) return [];

  // No stored side: breaking BELOW the trigger is taken LONG, ABOVE is SHORT.
  const isLong = row.trigger_direction !== "above";
  const out = [];

  if (row.stop_loss != null && row.sl_fired_at == null) {
    const hit = isLong ? price <= row.stop_loss : price >= row.stop_loss;
    if (hit) out.push("sl");
  }
  if (row.take_profit != null && row.tp_fired_at == null) {
    const hit = isLong ? price >= row.take_profit : price <= row.take_profit;
    if (hit) out.push("tp");
  }

  // A gap can cross both levels in one poll. Report only the one the price
  // overshot least — that is the level it crossed first — so a single poll
  // never emits contradictory alarms. Must match detectHits() in
  // src/lib/sl-tp.ts, which the /trades page uses.
  if (out.length === 2) {
    const slDist = Math.abs(price - row.stop_loss);
    const tpDist = Math.abs(price - row.take_profit);
    // Ties keep SL, the protective level — the same tie-break detectHits()
    // applies.
    return slDist <= tpDist ? ["sl"] : ["tp"];
  }
  return out;
}

console.log(
  `MOCHEX alert watcher started (poll every ${POLL_MS / 1000}s). Ctrl+C to stop.`
);

async function loop() {
  try {
    await checkAll();
  } catch (e) {
    console.error(`[${stamp()}] watcher error:`, e.message);
  }
  setTimeout(loop, POLL_MS);
}
loop();