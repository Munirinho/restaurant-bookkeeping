# 🍽️ RestroBooks — Restaurant Bookkeeping App

A complete, mobile-friendly bookkeeping app for restaurants. Track income, expenses, inventory, staff payroll, and run reports — all from your phone, with no internet required after install.

## 🌐 Live App

**https://Munirinho.github.io/restaurant-bookkeeping/**

## ✨ Features

| Feature | Details |
|---------|---------|
| **Dashboard** | Today's income, expenses, profit, low-stock alerts, and a weekly chart |
| **Income** | Track dine-in, takeaway, delivery, catering, and other sales |
| **Expenses** | Log food, utilities, rent, equipment, marketing, and more |
| **Inventory** | Stock levels, cost per unit, low-stock warnings, easy +/− adjustments |
| **Payroll** | Staff members, hourly/salary pay, log shifts, auto-calculate wages |
| **Reports** | Daily summary, Profit & Loss, monthly, expense/income breakdown, tax, staff costs |
| **Export** | Easily download your data as CSV (Excel) or JSON backup |

## 📱 Install on Your Phone

**Android (Chrome):**
1. Open the app URL in Chrome
2. Tap the **⋮** menu (top-right)
3. Tap **"Add to Home Screen"** → **Add**
4. Open the app from your home screen — it works offline

**iPhone/iPad (Safari):**
1. Open the app URL in Safari
2. Tap the **Share** button (square with arrow)
3. Scroll and tap **"Add to Home Screen"**
4. Tap **Add** — the app installs with a custom icon

## 🚀 Run Locally (development)

If you have the source files on your computer, you can run it with any static server. For example:

```bash
cd restaurant-bookkeeping
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## 📤 Exporting / Backing Up Data

- Tap the **download icon** in the top bar
- Choose:
  - **1** — Full JSON backup (all data)
  - **2** — Income CSV
  - **3** — Expenses CSV
  - **4** — Inventory CSV
  - **5** — Payroll CSV
  - **6** — Profit & Loss CSV
- CSV files open in Excel / Google Sheets

> **Note:** All data is stored locally on your device (browser storage). Export a JSON backup regularly if you want a copy.

## 🗑️ Reset / Clear Data

1. Tap the **gear icon** (top-right) → **Settings**
2. Tap **Clear All Data**

## 🛠️ Settings

Available in the gear menu:
- **Restaurant name** (displayed in exports)
- **Currency symbol**
- **Tax rate (%)** — used in the Tax Summary report
- **Low-stock alert threshold** — warning level for inventory

## 📁 Project Files

| File | Purpose |
|------|---------|
| `index.html` | Main app structure |
| `style.css` | Mobile-optimized styling |
| `app.js` | All app logic & calculations |
| `manifest.json` | PWA install metadata & icon |
| `sw.js` | Service worker (offline support) |
| `icon-192.png` / `icon-512.png` | App icons |

## 🔒 Privacy

All your data stays **on your device**. Nothing is uploaded to any server. Export a backup if you want to move data between devices.
