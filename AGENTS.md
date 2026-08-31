# AGENTS.md

Vanilla JS (ES modules) canvas schema editor for GitHub Pages. **No build system, no package.json, no lint/test tooling.** Fabric.js 5.3.0 is loaded from a CDN in `index.html` — do not add a bundler or npm deps without asking.

## Run locally (no GitHub account needed)

```powershell
powershell -ExecutionPolicy Bypass -File test/start-dev.ps1
# opens the app with the mock backend:
#   http://localhost:8099/index.html?apiBase=http://localhost:9000&owner=testowner&repo=schema-editor&token=fake-token
# stop both servers:
powershell -ExecutionPolicy Bypass -File test/start-dev.ps1 -Stop
```

Requires `python` (static server, port 8099) and `node` (GitHub API mock, port 9000).
The mock persists files under `test/data-files/` — this dir is **gitignored**; never commit it.

## Architecture (all wiring happens in `js/app.js`)

- `js/auth.js` — client-side login against hardcoded SHA-256 hashes in `USERS` (admin/editor, user1/viewer).
- `js/editor.js` — Fabric.js canvas, tools, grid, snap.
- `js/toolbar.js` — property panel; mutates objects and fires `canvas:dirty` / `history:request`.
- `js/history.js` — undo/redo via `canvas.toJSON()` snapshots.
- `js/storage.js` — GitHub Contents API; `CONFIG` holds placeholders; supports URL overrides `?apiBase=&owner=&repo=&token=` (used by the mock URL above).

## Auth & access control (do not regress)

- **Everything is client-side only.** Roles come from `sessionStorage` and are trivially forgeable — acceptable for this demo, but never pretend it is a real security boundary.
- **Viewer (`user1`) is read-only.** Enforcement is `AppState.mode` set in `setMode()`.
- Known footgun (already fixed): the `keydown` handler in `bindHotkeys()` and `doSave()` must short-circuit when `AppState.mode !== "edit"`. Keep it that way — a viewer must never edit the canvas or PUT to GitHub (Ctrl+S) via shortcuts.
- When you change auth/storage code, re-verify the viewer cannot save.

## Storage config gotcha

`isConfigured()` in `js/storage.js` must reject the placeholder `owner` and the placeholder `token` (contains `_PAT_`). If you touch uses of `CONFIG.token`, keep the placeholder guard — otherwise the app issues real GitHub calls with a bogus token and surfaces confusing `401`s instead of the neutral "не настроено" message.

## Text encoding

Source files are UTF-8 with Cyrillic text. The PowerShell console commonly mangles non-ASCII (mojibake). Read/parse files with UTF-8 explicitly (e.g. `Get-Content -Encoding UTF8`, or `node --check` / Node) and never trust console output of Cyrillic literals.
