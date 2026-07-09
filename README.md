# Sentinel Platform — Local Development

## Quick Start

```bash
cd sentinel-crm
npm install
npm run dev
```

The app will open at `http://localhost:3000`. It works identically to the Claude artifact version — same UI, same features, same data model.

## Migrating Your Data from Claude.ai

Your existing data lives in the Claude artifact's `window.storage`. To bring it over:

1. **Open your current Sentinel artifact** in Claude.ai
2. **Open browser DevTools** (F12 or Cmd+Option+I)
3. **In the Console tab**, run this inside the artifact's iframe:

   ```js
   // Find the artifact iframe first
   // Click on the artifact, then in DevTools select the iframe context
   // from the dropdown at the top of the Console panel
   
   const data = await window.storage.get("sentinel-platform-data");
   const config = await window.storage.get("sentinel-platform-config");
   console.log("=== SENTINEL DATA EXPORT ===");
   console.log(data.value);
   console.log("=== SENTINEL CONFIG EXPORT ===");
   console.log(config.value);
   ```

4. **Copy each JSON blob** and save them
5. **Open the local app** at localhost:3000
6. **In the local app's DevTools Console**, paste:

   ```js
   localStorage.setItem("ws_sentinel-platform-data", '<paste your data JSON here>');
   localStorage.setItem("ws_sentinel-platform-config", '<paste your config JSON here>');
   location.reload();
   ```

Alternatively, use the **Backup** button in the artifact sidebar to export a JSON file, then import it via the Settings page (if import is available) or paste into localStorage as above.

## How Storage Works Locally

The app uses `localStorage` as its storage backend (the same fallback the artifact version uses). Your data persists in the browser between sessions. The `window.storage` polyfill in the code maps to `localStorage` with a `ws_` prefix.

This means:
- Data persists as long as you don't clear browser data
- Use the **Backup** button regularly (same as in the artifact)
- Data is browser-specific — different browsers = different data

## Project Structure

```
sentinel-crm/
├── package.json
├── vite.config.js
├── index.html
├── COMPONENT_MAP.md      ← Component guide for Claude Code
├── src/
│   ├── main.jsx           ← Entry point
│   └── SentinelApp.jsx    ← Complete app (9,600 lines — to be decomposed)
└── data/                  ← Future: JSON file storage
```

## Using Claude Code

This project is specifically structured so Claude Code can refactor it. Start by running:

```
cd sentinel-crm
claude
```

Then use the prompts from the CRM rebuild document. The first task should be:

```
Read COMPONENT_MAP.md, then audit SentinelApp.jsx.
Decompose it into individual files following the plan in the component map.
Extract constants, utils, styles, and storage into src/constants/, src/utils/, 
src/styles.js, and src/storage.js. Then extract each page component into src/pages/ 
and shared components into src/components/. Keep App.jsx as just the shell with 
routing and state management. Don't change any functionality — just split the files.
```

After decomposition, proceed with the UX rebuild prompts (schema update, single-client view, pipeline list, etc.).

## Tech Stack

- **React 18** via Vite
- **Inline styles** (no CSS framework — styles defined in the `S` object)
- **localStorage** for persistence
- **DM Sans** font (loaded from Google Fonts in index.html)
