# Trades Page & Position Management System

The **Trades Page** (`/trades`) provides live position tracking, manual trade creation, trade execution management, auto TP/SL hit monitoring, automatic journal logging, full trade property modification, and trade archiving.

---

## 📌 Overview & Key Features

1. **3-Tab Navigation Architecture**:
   - **Active Trades**: Running position alerts with live prices, position sizing, margin, leverage, UPNL ($ & %), TP/SL level indicators, full edit, manual close, and archive actions.
   - **Closed History**: Completed trades table with final Exit Price, Realized PnL ($ and %), Exit Reason (`TP Hit`, `SL Hit`, `Manual Close`), Closed Date, full edit, and soft-delete archiving.
   - **Archive**: Soft-deleted trades table with full edit, **Restore (↩)** (returns item to Active or Closed History), and **Delete Permanently (🗑)** actions.

2. **Full Trade Property Modification (`Edit` on all tabs)**:
   - Modify **ALL** properties of any trade in **Active Trades**, **Closed History**, or **Archive**:
     - Symbol & Coin pair (e.g. `BTC_USDT`)
     - Position Direction (`Long` / `Short`)
     - Trigger Price & Fired Price
     - Entry Price, Stop Loss (SL), Take Profit (TP)
     - Margin ($) & Leverage (x)
     - Order Type (`Market`, `Limit`, `Trigger Limit`)
     - Trade Status (`Active` vs `Closed`)
     - Exit Price, Closed Reason (`TP Hit`, `SL Hit`, `Manual Close`), and Close Notes
     - Strategy & Pre-trade notes
   - Dynamic PnL recalculation: Updating price, margin, or leverage on closed or archived trades instantly recalculates Realized PnL ($ and %).

3. **Enhanced Manual Trade Entry (`+ Manual Trade`)**:
   - Create trades directly on the Trades page without requiring prior Watchlist triggers.
   - **Unified `CoinPicker` Integration**:
     - Real-time debounced MEXC futures autocomplete.
     - Popular market chips (`BTC`, `ETH`, `SOL`, `DOGE`, `XRP`, `SUI`, `PEPE`, `NEAR`, `AVAX`, `BNB`) for 1-click selection.
     - Active selected coin banner with coin icon, symbol, `USDT Perpetual`, live price (`fmtPx`), and 24h change %.
   - **Direction Toggle Buttons**: Clean `↗ LONG` (green gain) and `↘ SHORT` (red loss) buttons with directional icons.
   - **1-Click "Use Last Price" Helpers**: Instant auto-fill buttons for `Entry Price`, `Trigger Price`, `Fired Price`, and `Exit Price`.
   - **Live Risk:Reward (R:R) Calculator**: Automatically computes `🎯 1 : X.X R:R` with directional safety warnings.
   - **Multi-Screenshot Uploader (1–5 images)**: Drag-and-drop, file picker, and clipboard paste (`Ctrl+V`) with in-browser image compression (max 2048px, JPEG 0.85, 85–95% savings).
   - Create trades as **Active** or pre-closed (with Exit Price, Closed Reason, and auto-computed realized PnL directly into Closed History with Journal logging).

4. **Multi-Screenshot Lightbox & Row Badges**:
   - Active trade rows feature camera badges (`📸 N`) when screenshots are attached.
   - Clicking opens the interactive `ImageLightboxModal` with thumbnail carousel, previous/next shortcuts, and full-resolution view.

5. **Interactive Manual Trade Closure**:
   - Clicking **Close** on an active trade opens a quick modal pre-filled with the live MEXC market price.
   - Displays live preview of Realized PnL ($) and PnL (%) dynamically as exit price is confirmed or adjusted.
   - Submitting updates trade status to `closed`, logs the finished trade into the user's primary **Journal** (`trades` table), and dispatches notifications.

6. **Automated TP/SL Hit Detection & Journaling**:
   - Background poller (`/api/trade-alerts/check`) checks active trades against MEXC prices.
   - When live price crosses SL or TP:
     1. Claims level atomically.
     2. Sets trade status to `closed` with exit price and calculated realized PnL.
     3. Writes an entry directly to the **Journal** (`trades` table) with post-trade review notes.
     4. Dispatches multi-channel alert notifications (in-app, desktop toast, Discord webhooks, Telegram bots).

6. **Soft-Delete Trade Archiving**:
   - Delete action on Active Trades or Closed History soft-deletes the row into `archived_trade_alerts`.
   - Restoring moves the item back to `trade_alerts` preserving its active or closed status.
   - Permanent delete purges the record from the database.

---

## 🔄 Trade Lifecycle Workflow

```mermaid
flowchart TD
    A[Watchlist Trigger OR Manual Entry] --> B[Active Trades Tab]
    B -->|Live Price Monitors SL & TP| C{TP or SL Hit?}
    C -->|Yes| D[Auto-Close Trade]
    B -->|User Clicks Close| E[Manual Close Modal]
    E --> D
    D --> F[Compute Realized PnL $ & %]
    F --> G[Log Trade to Journal 'trades' table]
    G --> H[Dispatch Notifications Web/Discord/Telegram]
    H --> I[Move to Closed History Tab]
    I -->|User Soft-Deletes| J[Archive Tab]
    J -->|Restore| I
    J -->|Permanent Delete| K[Database Purged]
    B -->|User Clicks Edit| L[Modify All Fields]
    I -->|User Clicks Edit| L
    J -->|User Clicks Edit| L
```

---

## 🗄️ Database Schema & Migrations

### `trade_alerts` Table (`009`, `010`, `011`, `015`, `029`)
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `symbol` (TEXT)
- `trigger_direction` (`'above'` | `'below'`)
- `trigger_price`, `fired_price`, `entry_price`, `stop_loss`, `take_profit` (NUMERIC)
- `margin_usd`, `leverage` (NUMERIC)
- `order_type` (`'market'` | `'limit'` | `'trigger_limit'`)
- `sl_fired_at`, `tp_fired_at` (TIMESTAMPTZ)
- `status` (`'active'` | `'closed'`)
- `closed_reason` (`'tp_hit'` | `'sl_hit'` | `'manual_close'`)
- `exit_price` (NUMERIC)
- `closed_at` (TIMESTAMPTZ)
- `close_notes` (TEXT)
- `realized_pnl_usd`, `realized_pnl_pct` (NUMERIC)
- `screenshot_urls` (TEXT[], DEFAULT '{}')
- `screenshot_url` (TEXT)

### `archived_trade_alerts` Table (`015`, `029`)
- `id` (UUID, Primary Key)
- `user_id` (UUID, Foreign Key)
- `original_trade_alert_id` (UUID)
- `symbol` (TEXT)
- `trigger_direction`, `entry_price`, `exit_price`, `stop_loss`, `take_profit`
- `margin_usd`, `leverage`, `order_type`
- `status_at_archive` (`'active'` | `'closed'`)
- `closed_reason`, `close_notes`, `realized_pnl_usd`, `realized_pnl_pct`
- `screenshot_urls` (TEXT[], DEFAULT '{}')
- `screenshot_url` (TEXT)
- `archived_at` (TIMESTAMPTZ)

---

## ⚡ Unified MEXC Market Request Pipeline

1. **Single-Payload Polling (`useMexcMarketData`)**:
   - The `/trades` page utilizes the `useMexcMarketData` unified React hook (via `useLivePrices`).
   - Batches ticker prices and contract specifications (max leverage, base coin icons, fee rates) into **1 single HTTP payload** (`/api/mexc/futures?symbols=...&with_details=true`), eliminating per-symbol loop fetches.

2. **Tab Visibility Idle Pause**:
   - Automatically detects browser tab visibility (`document.hidden`).
   - Pauses polling when the tab is inactive to prevent background network load and rate limits, instantly refreshing live prices when focused.

3. **Direct MEXC Futures Chart Links (`mexcChartUrl`)**:
   - All trade rows across Active Trades, Closed History, and Archive tabs feature a **Chart** action link to open `https://www.mexc.co/futures/SYMBOL_USDT` in a new browser tab.

---

## 🎯 Public Trade Setup Sharing Integration

Traders can publish trade positions to public vanity URLs (`/[username]/[slug]`):
- **Card Highlights**: Renders Position side (`LONG`/`SHORT`), Order Type (`LIMIT`, `MARKET`), live PnL % banner vs Entry Price, executed target levels (EP, SL, TP), Risk-to-Reward ratio (e.g. `2.50 : 1`), and post-entry review notes.
- **Privacy & Security**: Soft-deleted share pages in the Trash tab (`020_soft_delete_public_share_links.sql`) automatically return 404 to public visitors while allowing the owner to Restore (↺) or Delete Permanently (🗑) anytime.
- See [`SHARES.md`](SHARES.md) for complete sharing architecture.
