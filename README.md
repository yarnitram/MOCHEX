# MOCHEX — Crypto Trading Setup Journal & Futures Watchlist

MOCHEX is a high-performance personal trading journal and real-time futures watchlist app built with **Next.js 15**, **Supabase**, and **Tailwind CSS**, featuring live data feeds from **MEXC USDT-Perpetual Futures**.

---

## 🚀 Key Features

### 1. Futures Watchlist & Trigger Engine
- **Live MEXC Prices**: Real-time ticker prices, 24h volume, and percentage changes.
- **Harmonized Add & Modify Modals**: Identical field schema across **Add Setup** (`AddTokenModal`) and **Modify Setup** (`CoinDetailModal`) with position direction (`↗ LONG` / `↘ SHORT`), trigger price, order type, EP, SL, TP, live R:R ratio, strategy notes, and 1-click **"Use Last Price"** buttons.
- **Mandatory Required Parameters**: Trigger Price, Order Type, Entry Price (EP), Stop Loss (SL), and Take Profit (TP) are strictly required.
- **Directional Safety Guardrails**: Enforces `SL < EP < TP` for Longs and `TP < EP < SL` for Shorts to protect against accidental instant stop-outs.
- **Dedicated Position Column**: Distinct table column displaying `↗ LONG` (gain green) and `↘ SHORT` (loss red) badges with directional icons.
- **Universal Multi-Screenshot Upload (1–5 images)**: Drag-and-drop, file picker, and clipboard paste (`Ctrl+V`) for up to 5 chart screenshots per setup/trade.
- **In-Browser Image Compression**: Automatically downscales and compresses captures client-side via HTML5 canvas (max 2048px, JPEG 0.85, 85–95% savings) before uploading to Google Drive or Supabase.
- **Interactive Lightbox Modal**: High-res image modal with previous/next navigation, keyboard shortcuts, and thumbnail strip.
- **Multi-Setup Per Coin**: Add multiple independent trade plans for the same token (e.g. dip-buy `Limit` vs breakout `Trigger Limit`).
- **Trigger Limit Chaining**: First-stage triggers automatically spawn a secondary `Limit` order at Entry Price (EP) when hit.
- **Trigger Archive & Restoring**: Move triggered items back to the active watchlist anytime without plan loss.

> 📖 **Full Watchlist Documentation**: See [`WATCHLIST.md`](WATCHLIST.md) for architecture, trigger lifecycles, diagrams, and database schemas.

### 2. Trades Page & Position Management
- **3-Tab Architecture**: **Active Trades**, **Closed History**, and **Archive**.
- **Unified `CoinPicker` Integration**: Real-time MEXC futures search, popular market chips, active coin card banner, and 1-click **"Use Last Price"** shortcuts.
- **Interactive Direction & R:R Calculator**: `↗ LONG` and `↘ SHORT` toggle buttons with live `🎯 1 : X.X R:R` calculation.
- **Manual Trade Creation**: Add market or limit trades directly on Trades page (`+ Manual Trade`) without Watchlist triggers.
- **Interactive & Live Close Modal**: Close active trades with live MEXC price pre-fill and live realized PnL calculations ($ and %).
- **Auto TP/SL Hit & Journaling**: Automatically closes trades when TP or SL target is hit and writes entry into Journal (`trades` table).
- **Soft-Delete Archive**: Soft-delete trade alerts with Restore (↩) and Permanent Delete (🗑) options.

> 📖 **Full Trades Documentation**: See [`TRADES.md`](TRADES.md) for trade lifecycles, PnL formulas, diagrams, and database schemas.

### 3. Trade Journal & Analytics
- **Modernized Journal Trade Modal**: Integrated `CoinPicker` supporting both MEXC futures and custom assets (equities, forex, crypto).
- **1-Click Price Helpers**: Pre-fills entry price with live market price at a single click.
- **Comprehensive Logging**: Track entry time, size, exit price, stop price, trading fees, interactive tags, pre-trade thesis, post-trade review, and discipline score (1★–5★).
- **Performance Analytics**: Calendar PnL heatmaps, cumulative equity curve charts, and win/loss statistics.

### 4. Public Sharing Hub & Vanity Handle URLs
- **Custom Vanity Handles**: Share setup URLs under clean vanity routes (`/[username]/[slug]`).
- **Multi-Token Support**: Share single or multiple coin setups on a single unified page.
- **Two Specialized Templates**:
  - **📡 Watchlist Radar**: Ongoing market condition radar, trigger levels, distance to trigger (%), planned EP/SL/TP, pre-trade thesis, Position side (`LONG`/`SHORT`), Order Type (`LIMIT`, `TRIGGER LIMIT`, `MARKET`), and **"🔥 ALERT FIRED & TRIGGERED"** proof-of-accuracy badges.
  - **🎯 Trade Setups**: Position side, Order Type, live PnL % banner vs Entry Price, executed targets, R:R ratio, and post-entry review notes.
- **Soft-Delete Archive & Restore Tab**: Soft-delete public share pages with instant **Restore (↺)** and **Permanent Delete (🗑)** options.
- **Dedicated 404 Error Page**: Custom dark-mode page (`MOCHEX / 404`) for invalid or soft-deleted share links.

> 📖 **Full Public Sharing Documentation**: See [`SHARES.md`](SHARES.md) for vanity URL routing, card templates, diagrams, and database schemas.

### 5. Risk Management & Notifications
- Account-wide risk parameters (Max Daily Loss, Position Risk %, Max Open Positions).
- **Multi-Channel Alert Notifications**:
  - **Discord Webhooks**: Configure single or multiple Discord webhooks.
  - **Telegram Bot Integration**: Configure single or multiple Telegram bot destinations (`Bot Token` + `Chat ID`).
  - **In-App & Desktop Toasts**: Instant notifications via bell menu and Windows PowerShell toasts.

### 6. TradingView Automated Webhook Ingestion (`/api/webhooks/tradingview`)
- **Direct Automation**: Pipe TradingView alerts (PineScript indicators, strategy executions, price crossings) straight into MOCHEX with zero manual input.
- **Unique Webhook Secrets**: Each user receives a dedicated webhook endpoint URL (`https://mochex.app/api/webhooks/tradingview?key=YOUR_SECRET`) with 1-click secret rolling.
- **Smart Payload Normalizer**: Automatically parses tickers (`BINANCE:BTCUSDT.P`, `BTCUSDT` → `BTC_USDT`), position sides (`buy`/`sell` → `long`/`short`), and targets.
- **Dual Destination Modes**: Supports both pending Watchlist setups (Radar) and immediate Trade executions.
- **Interactive Alert Generator**: Live generator in [⚙️ Settings](/settings) with 1-click copyable JSON for TradingView alert message boxes and live "Send Test Alert" verification.

> 📖 **Full TradingView Documentation**: See [`TRADINGVIEW.md`](TRADINGVIEW.md) for PineScript code snippets, alert payload formats, and integration guides.

### 7. Mobile & Tablet Optimization
- **Responsive Navigation Drawer**: Thumb-friendly mobile navigation with slide-out sheet, quick tabs, theme toggle, and mobile Sign Out button.
- **Sticky Token Headers**: Coin icons and tickers remain pinned to the left (`sticky left-0`) when scrolling wide tables horizontally on phones and tablets.
- **Compact Modal Architecture**: Optimized dialog padding and internal vertical scrolling ensuring zero button cutoffs on small mobile viewports.

### 8. Interactive Candlestick Chart & Technical Analysis Station
- **Multi-Period EMAs (20, 50, 100, 200)**: Color-coded from thin to thickest (White, Blue, Yellow, Orange) with independent toggle buttons.
- **Live Candle Close Countdown Timer**: Real-time ticker badge (`⏱️ 04:32`) on the active timeframe bar.
- **1-Click Chart Snapshot (PNG Camera)**: High-resolution PNG image download for sharing setups and journaling.
- **TradingView-Style Drawing Suite**: Fibonacci Retracement, Long/Short Risk-to-Reward Position Box, Angled Trendline, Horizontal Ray, Rectangle Zones, and Multi-Point Paths.
- **In-Chart Modification & Future Projections**: Interactive corner/vertex drag handles, whole-shape moving, floating quick toolbar, and projection past current price.
- **Watchlist Modal Zoom & Dedicated Page**: Smooth `ResizeObserver` zooming in modal, and full-width `max-w-screen-2xl` dedicated workspace (`/chart/[symbol]`).

### 9. Settings Hub & Admin Architecture
- **Widescreen 2-Column Workspace (`max-w-7xl`)**: Category sidebar navigation on desktop (`lg+`) with user identity card and mobile horizontal scrolling tab bar.
- **7 Categorized Configuration Tabs**:
  - `👤 Profile`: Vanity handle URL (`/[username]`), display name, bio, social links, public showcase toggle.
  - `🔔 Alerts`: Multi-channel Discord webhooks, Telegram bot routing, desktop toasts, polling interval.
  - `🔊 Audio & Radar`: Volume slider with SFX auditioning, Web Audio synthesized proximity radar alarms, dual `localStorage` + Supabase sync.
  - `📡 Integrations`: TradingView webhook secrets, automated payload generator, live test dispatchers.
  - `⚖️ Risk Limits`: Drawdown guardrails, max daily loss (USD), position risk %, max open positions.
  - `💾 Cloud Storage (Admin-Only)`: Platform-wide Google Drive bucket authorization, storage engine selection (`auto`, `google_drive`, `supabase`), 1-click upload tester, Vercel token copier.
  - `💖 Support`: Community Tip Jar and platform hosting support modal.
- **Per-Tab Save Controls**: Dedicated contextual save buttons on every tab with instant local confirmation.
- **Strict Admin Security**: Administrative privileges strictly restricted to `support@mochex.com`.

> 📖 **Full Settings Documentation**: See [`SETTINGS.md`](SETTINGS.md) for tab breakdowns, storage engines, and security architecture.

---

## 🛠 Getting Started

### 1. Environment Setup

Copy `.env.example` to `.env.local` and set your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
```

### 2. Run Database Migrations

Apply all SQL migrations located in `supabase/migrations/` (migrations `001` through `029_watchlist_and_trade_screenshots.sql`) in your Supabase SQL Editor.

### 3. Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view MOCHEX.
