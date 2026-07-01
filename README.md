# IRONOS // Gains Terminal

A personal, offline-first gym tracker as an installable PWA. No accounts, no cloud, no App Store — your data lives on your phone, and you back it up yourself with a JSON export.

Sci-fi / Y2K HUD styling, because watching the line go up should feel good.

![icon](icons/icon-192.png)

## Features

- **Log sets fast** — pick an exercise, weight, reps × sets (defaults to your `12 × 4`), date, optional notes.
- **Smart prefill** — selecting an exercise auto-fills the weight/reps/sets from your last session (and shows your all-time max), so you just nudge it up or down a notch.
- **9 core machines built in** — Leg Press, Leg Curl, Leg Extension, Chest Press, Pec Fly, Lat Pulldown, Seated Row, Shoulder Press, Abdominal. Add your own any time (push-ups, pull-ups, whatever).
- **Gains Matrix** — an interactive line chart of weight over time.
  - **ALL** exercises at once, or drill into **one** with the chips.
  - **Tap a node** to list every set from that day.
  - **Drag across the timeline** to list all sets in that window.
  - In ALL mode, tap a legend entry to hide/show a line.
- **Backup & restore** — export a `.json` snapshot to Drive / iCloud / email, and import it to restore or move devices (replace *or* merge).
- **Works fully offline** once installed.

## Install on your iPhone

1. Deploy it (see below) and open the URL in **Safari**.
2. Tap the **Share** icon → **Add to Home Screen** → **Add**.
3. Launch it from your home screen — it runs full-screen like a native app and works with no signal.

> There's an **INSTALL ON iPHONE** button in the Data tab that shows these steps too.

## Deploy to GitHub Pages (free)

1. Create a repo (e.g. `workout-tracker`) and push these files to the `main` branch:
   ```
   git init
   git add .
   git commit -m "IRONOS gains terminal"
   git branch -M main
   git remote add origin https://github.com/<you>/workout-tracker.git
   git push -u origin main
   ```
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, pick `main` / `/ (root)`, **Save**.
3. Wait ~1 min, then open `https://<you>.github.io/workout-tracker/` on your phone and install it.

All paths are relative, so it works from a project subpath like `/workout-tracker/` without changes.

## Your data

- Stored in the browser's `localStorage` on the device only — nothing is sent anywhere.
- **Back it up** regularly via **Data → Export Snapshot**. If you clear Safari's website data or delete the app, local data is lost — the export is your backup.
- The chart tracks **weight only** (not rep-adjusted 1RM) — by design.

## Files

| File | Purpose |
|------|---------|
| `index.html` | App shell / markup |
| `styles.css` | Y2K HUD styling |
| `app.js` | All logic — storage, forms, chart |
| `sw.js` | Service worker (offline cache) |
| `manifest.webmanifest` | PWA manifest |
| `icons/` | App icons |

No build step, no dependencies. Edit and refresh.
