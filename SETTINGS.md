# ⚙️ Settings Hub & Admin Architecture

MOCHEX provides a centralized, high-performance **Settings Hub** allowing traders to customize public profiles, configure multi-channel alerts, control audio and proximity radar alarms, generate automated TradingView webhook payloads, enforce risk guardrails, and—for platform administrators—manage site-wide cloud storage infrastructure.

---

## 📐 1. Layout & Container Architecture

- **Widescreen Container**: Styled with `max-w-7xl mx-auto`, making full use of widescreen desktop viewports (1280px+) without artificial constraints.
- **Desktop 2-Column Workspace (`lg+`)**:
  - **Left Sticky Sidebar (`lg:w-[280px]`)**: Category navigation card displaying all 7 tabs with icons, titles, descriptive subtitles, and active highlight pills. At the base of the sidebar is an authenticated user identity chip (`support@mochex.com` / role chip) and direct shortcut to the **Admin Command Center** (for administrators).
  - **Right Content Stage**: Spacious container utilizing responsive 2-column and 3-column grids (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5`) for inputs and controls.
- **Mobile Responsive Navigation (`< lg`)**: High-contrast, horizontal scrolling segmented tab bar with full-width cards.

---

## 🗂️ 2. The 7 Settings Tabs

### 👤 1. Profile & Trader Showcase
- **Public Handle (`/[username]`)**: Unique vanity handle for public portfolio and setup share pages.
- **Display Name & Bio**: Public-facing name and trading thesis/market outlook.
- **Social Links**: Twitter/X handle (with `@` prefix helper) and Telegram channel link.
- **Public Showcase Toggle**: Turn on/off your public vanity showcase page (`/[username]`).
- **Save Action**: Dedicated **"Save Profile Changes"** button with inline confirmation.

### 🔔 2. Webhooks & Notifications
- **Multi-Discord Webhooks**: Add, remove, and label multiple Discord webhooks.
  - Live test dispatcher button for each webhook (`Test Webhook #N`).
- **Telegram Bot Routing**: Add multiple Telegram bot destinations (`Bot Token` from `@BotFather` + `Chat ID` from `@userinfobot`).
  - Live test dispatcher button for each Telegram destination.
- **In-App & Desktop Toasts**: Toggle native OS desktop notifications with a live test trigger.
- **Live Watchlist Refresh Interval**: Configurable polling cadence (3s – 3600s, default: 10s) for MEXC futures ticker updates.
- **Save Action**: Dedicated **"Save Notification Settings"** button.

### 🔊 3. Audio & Radar Proximity Alarms
- **Master Sound Toggle**: Enable or disable audio feedback platform-wide.
- **Master Volume Slider**: Interactive slider (0% to 100%) with immediate SFX audition buttons (`Trigger`, `Take Profit`, `Stop Loss`).
- **Proximity Radar Alarms**:
  - Web Audio API synthesized tones warning when price approaches a trigger or stop level.
  - Configurable distance threshold (`0.1%` to `5.0%`).
  - Tone presets: `Radar Ping`, `Sonar Beacon`, `Submarine Pulse`, `High-Frequency Chirp`, `Subtle Thump`.
  - Live "Test Alarm Tone" preview button.
- **Dual-Layer Persistence**: Automatically synchronizes state both to browser `localStorage` (for instant audio playback) and to the Supabase database.
- **Save Action**: Dedicated **"Save Audio Configuration"** button.

### 📡 4. TradingView Automation
- **Personal Webhook Endpoint**: Unique, authenticated URL (`https://mochex.app/api/webhooks/tradingview?key=YOUR_SECRET`).
- **Secret Key Management**: Show/Hide toggle and 1-click **"Roll Secret"** to invalidate compromised keys.
- **Interactive Alert JSON Generator**:
  - Configures Watchlist Radar setups or immediate Trade logs.
  - 1-Click **"Copy Alert JSON"** for pasting into TradingView alert message boxes.
  - Live **"⚡ Send Test Alert"** button that sends a real payload to the webhook endpoint and reports the response.
- **Operational Status Badge**: Confirms the webhook receiver is live and listening.

### ⚖️ 5. Risk Controls & Account Guardrails
- **Linked Trading Account**: Automatically associates with your active trading account.
- **Max Daily Loss (USD)**: Threshold where today's realized loss triggers an analytics warning and flags a stop-for-the-day stop sign.
- **Max Position Risk (%)**: Recommended capital risk percentage per individual trade setup.
- **Max Open Positions**: Concurrency cap to prevent overexposure and revenge trading.
- **Save Action**: Dedicated **"Save Risk Controls"** button persisting to `/api/risk`.

### 💾 6. Cloud Storage (Admin-Only: `support@mochex.com`)
> 🛡️ **Restricted Access**: Strictly hidden from non-admin accounts.
- **Screenshot Storage Engine Selector**:
  - `Auto (Recommended)`: Routes uploads to Google Drive when authorized, falling back to Supabase automatically.
  - `Google Drive Bucket`: Strictly requires Google Drive, saving 100% of Supabase bandwidth and storage quota.
  - `Supabase Storage`: Stores screenshots directly in the Supabase `trade-screenshots` bucket.
- **Centralized Google Drive Bucket**:
  - Authorize or disconnect the platform-wide Google Drive account.
  - Automatic creation of the `Mochex Trade Screenshots` root folder.
  - 1-Click **"🧪 Test Drive Upload"** tool reporting latency (ms), folder URL, and file preview link.
  - 1-Click **"📁 Open in Drive ↗"** direct folder link.
- **Vercel Production Deployment Helper**:
  - 1-Click **"Copy Token"** for `GOOGLE_DRIVE_REFRESH_TOKEN` to add into Vercel Project Settings.
- **Save Action**: Dedicated **"Save Storage Preferences"** button.

### 💖 7. Server Hosting & Support
- Community Tip Jar modal supporting Solana, Base/EVM, Bitcoin, and zero-cost exchange referral discounts to help cover server hosting and live MEXC data costs.

---

## 🛡️ 3. Security & Admin Authorization Model

Administrative access in MOCHEX is enforced using **server-authoritative email verification**:

1. **Strict Admin Verification**:
   - Implemented in `src/lib/admin.ts` via `isUserAdmin(user)`.
   - **Only** accounts with authenticated email `support@mochex.com` (or defined in `ADMIN_EMAILS` environment variable) are recognized as administrators.
   - All legacy username matching (`ymatt`, `support`) has been completely eliminated.
2. **Server-Side Navigation Isolation**:
   - `src/app/(app)/layout.tsx` computes `isAdmin = isUserAdmin(user, userSettings)` on the server and passes it down to `<AppNav isAdmin={isAdmin} />`.
   - The `🛡️ Admin` command center badge only renders in the navigation bar and mobile drawer for `support@mochex.com`.
3. **Storage Configuration Isolation**:
   - The `💾 Cloud Storage` tab in Settings only renders if `isAdmin === true`. Non-admin traders cannot view credentials, disconnect buckets, or access storage engine controls.
4. **Route Guards**:
   - The `/admin` Command Center and `/api/admin/*` routes enforce `await requireAdmin()`, immediately redirecting or returning `403 Forbidden` for non-admin accounts.
