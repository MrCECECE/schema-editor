# Schema Editor

Vanilla JS canvas schema editor for GitHub Pages. Stores data in Google Sheets.

## Pages

| File | Purpose |
|------|---------|
| `index.html` | Public landing page: two buttons + hotkeys + theme toggle |
| `login.html` | Google Sign-In only; auto-redirects to editor if session exists |
| `editor.html` | Full editor (protected by session), toolbar, properties panel |
| `view.html` | Public viewer (read-only), auto-refresh from Sheets via API key |

## Architecture

- `assets/js/config.js` — Google Client ID
- `assets/js/auth.js` — Google OAuth + session (`schema_editor_session` in localStorage)
- `assets/js/theme.js` — Light/dark theme (`schema_editor_theme` in localStorage)
- `assets/js/hotkeys.js` — Shared hotkey module
- `assets/css/theme.css` — CSS variables for themes
- `assets/js/editor.js` — Fabric.js canvas, tools, grid, shapes, arrows
- `assets/js/toolbar.js` — Properties panel
- `assets/js/history.js` — Undo/redo (max 50 states)
- `assets/js/sheetlang.js` — Parse/serialize SheetLang ↔ Google Sheets format
- `assets/js/icons.js` — SVG icons
- `assets/js/editor-app.js` — Editor entry: Google OAuth, Sheets sync (Pull/Push), hotkeys
- `assets/js/app.js` — Viewer entry: read-only, auto-refresh from Sheets via API key

## Google Cloud Console Setup

### 1. Create a project
Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project.

### 2. Enable APIs
Enable **Google Sheets API v4** in APIs & Services → Library.

### 3. Create API Key (for Viewer)
- Go to Credentials → Create Credentials → API Key
- Restrict key: Application restrictions → HTTP referrers (your domain)
- API restrictions → Google Sheets API
- Copy the key to `CONFIG.apiKey` in `assets/js/app.js`

### 4. Create OAuth Client ID (for Editor)
- Go to Credentials → Create Credentials → OAuth Client ID
- Application type: **Web application**
- Authorized JavaScript origins: add your domain (e.g., `https://yourname.github.io` and `http://localhost:8099` for local dev)
- Authorized redirect URIs: not needed for token client flow
- Copy the Client ID to `assets/js/config.js` → `googleClientId`

### 5. Required Scopes
The editor requests these scopes automatically:
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/spreadsheets`

### 6. Configure Google Sheet
- Create a Google Sheet
- Share: **Anyone with the link (Viewer)** for public read access
- Add editors by email if needed
- Copy the Sheet ID from the URL (`/d/{SHEET_ID}/edit`) → set `CONFIG.sheetsId` in both `assets/js/editor-app.js` and `assets/js/app.js`

## Local Development

```powershell
python -m http.server 8099
```

Open:
- http://localhost:8099/index.html
- http://localhost:8099/view.html
- http://localhost:8099/editor.html
- http://localhost:8099/login.html

## Storage

- **Editor** (`editor-app.js`): OAuth token → `sheets.googleapis.com` (read/write)
- **Viewer** (`app.js`): API key → `sheets.googleapis.com` (read-only, auto-refresh 24h)
- Both use the same `CONFIG.sheetsId` pointing to one Google Sheet

## Sheet Format (SheetLang)

One row = one line (`R:`, `D:`, `C:`, `L:`, `A:`, `T:`, `G:`)

```
R:x,y,w,h,fill,stroke,sw           Rectangle
D:x,y,w,h,fill,stroke,sw           Diamond (bounding box)
C:cx,cy,rx,ry,fill,stroke,sw       Circle/ellipse (center)
L:x1,y1,x2,y2,stroke,sw            Line
A:x1,y1,x2,y2,stroke,sw            Arrow
T:x,y,fontSize,color,text          Text (no commas)
G:n1,n2,...                        Group (1-based line numbers)
# ...                              Comment
```

Full spec: `data/sheetlang-spec.md`

## Hotkeys

### All Pages
| Key | Action |
|-----|--------|
| `V` | Open Viewer |
| `E` | Open Login (Editor) |
| `D` | Toggle theme |
| `?` / `H` | Show hotkey help |

### Editor Only
| Key | Action |
|-----|--------|
| `V` | Select tool |
| `R` | Rectangle |
| `D` | Diamond |
| `O` | Circle |
| `L` | Line |
| `A` | Arrow |
| `T` | Text |
| `P` | Pencil |
| `E` | Eraser |
| `H` / `Space` | Pan tool |
| `Ctrl+G` | Group |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+S` | Push to Sheets |
| `Del` | Delete selected |
| `Esc` | Deselect |
| Wheel | Zoom at cursor |
| Middle button / Space+LMB | Pan |

## Theme

- Persisted in `localStorage.schema_editor_theme`
- Inline script in `<head>` of each page applies theme before first paint (no flash)
- CSS variables: `--bg`, `--text`, `--accent`, `--obj-stroke`, `--obj-fill`, `--obj-text`, `--pencil-color`
- `editor.js:updateObjectsForTheme()` recolors existing canvas objects on theme change

## Auth & Access Control

- **Client-side only** — the session in `localStorage` is trivially forgeable
- **Viewer** is read-only via `setViewOnlyMode()` in `editor.js`
- **Logout** clears `schema_editor_session` and redirects to `login.html`; other tabs of same domain also redirect via `storage` event
- No password auth, no SHA-256, no demo users — only Google OAuth

## Deploy

`.github/workflows/deploy.yml` — push to `main` → GitHub Pages. No build steps. Ensure all HTML uses relative paths (`assets/css/`, `assets/js/`, `view.html`, etc.).