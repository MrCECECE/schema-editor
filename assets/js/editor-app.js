import {
    initEditor, getCanvas, toggleGrid, setCurrentTool,
    zoomIn, zoomOut, resetZoom, updateZoomUI,
    groupSelected, ungroupSelected, deleteSelected, addText,
    getCanvasBgColor, updateObjectsForTheme, setViewOnlyMode,
} from "./editor.js";
import { createHistory } from "./history.js";
import { parseLines, renderOnCanvas, encodeCanvas } from "./sheetlang.js";
import { initToolbarUI } from "./toolbar.js";
import { ICONS } from "./icons.js";

const CONFIG = {
    sheetsId: "1e3ut8uuhbwHS0ZpZL-VWvP886mBXwgFUzSRrjkQS15k",
    scopes: "openid email profile https://www.googleapis.com/auth/spreadsheets",
    refreshInterval: 86400000,
    maxSheetRows: 1000,
};

const AppState = {
    canvas: null,
    history: null,
    googleToken: null,
    googleUser: null,
    tokenClient: null,
    tokenQueue: [],
    isMobile: false,
};

function installFabricFixes() {
    // Fabric.js 5.3.0: "alphabetical" — не валидный CanvasTextBaseline
    if (fabric.Text && fabric.Text.prototype._setTextStyles) {
        fabric.Text.prototype._setTextStyles = function (ctx, charStyle, forMeasuring) {
            ctx.textBaseline = "alphabetic";
            if (this.path) {
                switch (this.pathAlign) {
                    case "center": ctx.textBaseline = "middle"; break;
                    case "ascender": ctx.textBaseline = "top"; break;
                    case "descender": ctx.textBaseline = "bottom"; break;
                }
            }
            ctx.font = this._getFontDeclaration(charStyle, forMeasuring);
        };
    }
}

function detectMobile() {
    return window.innerWidth <= 900 || "ontouchstart" in window;
}

function paintIcons() {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
        const tool = btn.dataset.tool;
        if (ICONS[tool]) btn.innerHTML = ICONS[tool];
    });
    document.querySelectorAll("#btn-zoom-in, #btn-zoom-out, #btn-zoom-reset, #btn-grid")
        .forEach((btn) => {
            const key = btn.id.replace("btn-", "");
            const iconKey = {
                "zoom-in": "zoomIn",
                "zoom-out": "zoomOut",
                "zoom-reset": "zoomReset",
                grid: "grid",
            }[key];
            if (ICONS[iconKey]) btn.innerHTML = ICONS[iconKey];
        });
}

function initTheme() {
    Theme.apply(Theme.current());
    const icon = document.querySelector(".theme-icon");
    if (icon) icon.textContent = document.documentElement.dataset.theme === "dark" ? "🌙" : "☀️";
}

function onThemeToggle() {
    Theme.toggle();
    const icon = document.querySelector(".theme-icon");
    if (icon) icon.textContent = document.documentElement.dataset.theme === "dark" ? "🌙" : "☀️";
    if (AppState.canvas) {
        updateObjectsForTheme();
        AppState.canvas.setBackgroundColor(getCanvasBgColor());
        AppState.canvas.requestRenderAll();
    }
}

let bottomSheet = null;

function init() {
    try {
        if (typeof fabric === "undefined") {
            showFatalError("Fabric.js не загрузился.");
            return;
        }
        installFabricFixes();
        AppState.isMobile = detectMobile();
        initTheme();
        setupDrawer();

        const themeBtn = document.getElementById("btn-theme-toggle");
        if (themeBtn) themeBtn.addEventListener("click", onThemeToggle);

        window.addEventListener("resize", onResize);

        const session = Auth.getSession();
        if (session && session.accessToken && window.APP_CONFIG?.googleClientId) {
            AppState.googleToken = session.accessToken;
            AppState.googleUser = { username: session.email || session.name || "unknown" };
        }

        showEditor();
        setupBottomSheet();

        if (document.getElementById("google-signin-container") && window.APP_CONFIG?.googleClientId) {
            initGoogleSignIn();
        }
    } catch (e) {
        console.error("Init failed:", e);
        showFatalError("Ошибка инициализации: " + (e && e.message ? e.message : "unknown"));
    }
}

function showFatalError(msg) {
    const container = document.getElementById("canvas-container");
    if (!container) return;
    container.textContent = "";
    const div = document.createElement("div");
    div.style.cssText = "display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:14px;text-align:center;padding:40px;";
    div.textContent = msg;
    container.appendChild(div);
}

function onResize() {
    const wasMobile = AppState.isMobile;
    AppState.isMobile = detectMobile();
    if (wasMobile !== AppState.isMobile) {
        rebuildBottomSheet();
    }
    if (AppState.canvas) fitCanvas();
}

function fitCanvas() {
    if (!AppState.canvas) return;
    const container = document.getElementById("canvas-container");
    if (!container || !container.parentElement) return;
    const maxW = container.parentElement.clientWidth - 40;
    const maxH = container.parentElement.clientHeight - 40;
    if (maxW > 0 && maxH > 0) {
        const zoom = Math.min(maxW / 1000, maxH / 700, 1);
        AppState.canvas.setZoom(zoom);
        AppState.canvas.requestRenderAll();
        updateZoomUI();
    }
}

function setupDrawer() {
    const toggle = document.getElementById("drawer-toggle");
    const drawer = document.getElementById("toolbar-drawer");
    const close = document.getElementById("drawer-close");
    const backdrop = document.getElementById("drawer-backdrop");
    if (!toggle || !drawer) return;

    const openDrawer = () => {
        drawer.classList.add("open");
        if (backdrop) backdrop.classList.remove("hidden");
    };
    const closeDrawer = () => {
        drawer.classList.remove("open");
        if (backdrop) backdrop.classList.add("hidden");
    };
    toggle.addEventListener("click", openDrawer);
    if (close) close.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
}

function setupBottomSheet() {
    bindPanelToggle();
    rebuildBottomSheet();
}

function bindPanelToggle() {
    const btn = document.getElementById("panel-toggle");
    if (!btn || btn._bound) return;
    btn._bound = true;
    btn.addEventListener("click", () => {
        if (bottomSheet) bottomSheet.classList.toggle("open");
    });
}

function rebuildBottomSheet() {
    const panel = document.getElementById("properties-panel");
    if (!panel) return;

    // Возвращаем детей обратно в panel, прежде чем удалять лист
    if (bottomSheet) {
        bottomSheet.querySelectorAll(".props-hint, .props-fields").forEach((el) => {
            panel.appendChild(el);
        });
        bottomSheet.remove();
        bottomSheet = null;
    }

    if (window.innerWidth > 900) return;

    bottomSheet = document.createElement("aside");
    bottomSheet.id = "props-bottom-sheet";
    bottomSheet.className = "bottom-sheet";

    const handle = document.createElement("div");
    handle.className = "bottom-sheet-handle";
    bottomSheet.appendChild(handle);

    panel.querySelectorAll(".props-hint, .props-fields").forEach((el) => {
        bottomSheet.appendChild(el);
    });
    document.body.appendChild(bottomSheet);

    bottomSheet.addEventListener("click", (e) => {
        if (e.target === bottomSheet) bottomSheet.classList.remove("open");
    });
}

function ensureTokenClient() {
    if (AppState.tokenClient) return true;
    if (!window.APP_CONFIG?.googleClientId) return false;
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) return false;
    AppState.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: window.APP_CONFIG.googleClientId,
        scope: CONFIG.scopes,
        callback: handleTokenResponse,
    });
    return true;
}

function initGoogleSignIn() {
    if (!window.APP_CONFIG?.googleClientId) return;
    if (!ensureTokenClient()) {
        setTimeout(initGoogleSignIn, 200);
        return;
    }
    const container = document.getElementById("google-signin-container");
    if (!container) return;
    container.innerHTML = "";
    const btn = document.createElement("button");
    btn.id = "btn-google-login";
    btn.className = "btn btn-google";
    btn.type = "button";
    btn.innerHTML = '<span class="google-icon">G</span> Войти через Google';
    btn.addEventListener("click", () => requestAccessToken());
    container.appendChild(btn);
}

function requestAccessToken() {
    if (!ensureTokenClient()) {
        setSaveStatus("Google API не загрузился — обновите страницу", "error");
        return;
    }
    AppState.tokenClient.requestAccessToken();
}

function getAccessToken() {
    return new Promise((resolve, reject) => {
        if (!ensureTokenClient()) { reject(new Error("oauth2 not ready")); return; }
        AppState.tokenQueue.push({ resolve, reject });
        AppState.tokenClient.requestAccessToken();
    });
}

function handleTokenResponse(response) {
    if (!response || response.error) {
        const err = response?.error || "unknown";
        while (AppState.tokenQueue.length) {
            AppState.tokenQueue.shift().reject(new Error(err));
        }
        setSaveStatus("Ошибка входа: " + err, "error");
        return;
    }
    AppState.googleToken = response.access_token;

    // Если кто-то ждал в очереди — отдать токен, не открывая UI-логин
    if (AppState.tokenQueue.length) {
        while (AppState.tokenQueue.length) {
            AppState.tokenQueue.shift().resolve(response.access_token);
        }
        setSignedInUI(true);
        updateStatusUser();
        return;
    }

    // Одиночный логин через Google-кнопку
    fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: "Bearer " + response.access_token },
    })
        .then((res) => res.json())
        .then((info) => {
            AppState.googleUser = { username: info.email || info.name || "unknown" };
        })
        .catch(() => { AppState.googleUser = { username: "unknown" }; })
        .finally(() => {
            setSignedInUI(true);
            updateStatusUser();
            pullFromSheets();
        });
}

function showEditor() {
    paintIcons();
    AppState.canvas = initEditor();
    AppState.history = createHistory(AppState.canvas);
    initToolbarUI();
    bindToolbar();
    bindHotkeys();
    bindStatus();
    setViewOnlyMode(false);
    updateStatusMode();
    setSignedInUI(!!AppState.googleToken);
    updateStatusUser();

    setTimeout(() => {
        fitCanvas();
        if (AppState.isMobile) rebuildBottomSheet();
    }, 0);

    if (AppState.googleToken) {
        pullFromSheets();
    } else {
        setSaveStatus("Войдите, чтобы загрузить", "info");
    }
}

function updateStatusMode() {
    const el = document.getElementById("status-mode");
    if (el) el.textContent = "Редактор";
}

function updateStatusUser() {
    const el = document.getElementById("status-user");
    if (el) el.textContent = AppState.googleUser ? "Google: " + AppState.googleUser.username : "";
}

function setSignedInUI(signedIn) {
    ["btn-pull", "btn-push", "btn-export-png", "btn-export-svg"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = signedIn ? "" : "none";
    });
    // Кнопка выхода показывается, если есть хоть какая-то сессия
    const out = document.getElementById("btn-signout");
    if (out) out.style.display = (signedIn || Auth.getSession()) ? "" : "none";
    // Google-login показываем только когда не залогинены
    const gs = document.getElementById("google-signin-container");
    if (gs) gs.style.display = signedIn ? "none" : "";
}

function rowsFromData(data) {
    if (!data.values || !Array.isArray(data.values)) return [];
    return data.values.map((row) => (row && row.length > 0 ? String(row[0]) : ""));
}

async function pullFromSheets() {
    if (!CONFIG.sheetsId) { setSaveStatus("Configure sheetsId in CONFIG", "info"); return; }
    if (!AppState.googleToken) { setSaveStatus("Войдите, чтобы загрузить", "info"); return; }
    setSaveStatus("Loading...");

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1`;

    try {
        let token = AppState.googleToken;
        let res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (res.status === 401) {
            try { token = await getAccessToken(); }
            catch {
                setSaveStatus("Нужен доступ Google — войдите заново", "error");
                return;
            }
            res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const rows = rowsFromData(data);
        const { objects, groups } = parseLines(rows);

        if (objects.length > 0) {
            renderOnCanvas(AppState.canvas, objects, groups);
            updateObjectsForTheme();
            AppState.history.clear();
            setSaveStatus("Loaded from Sheets ✓", "ok");
        } else {
            AppState.history.clear();
            setSaveStatus("Sheet empty", "info");
        }
    } catch (e) {
        console.error("Pull failed:", e);
        setSaveStatus("Pull error: " + (e.message || e), "error");
    }
}

async function pushToSheets() {
    if (!AppState.googleToken) { setSaveStatus("Not signed in", "error"); return; }
    if (!CONFIG.sheetsId) { setSaveStatus("Configure sheetsId in CONFIG", "info"); return; }

    const lines = encodeCanvas(getCanvas());
    if (lines.length > CONFIG.maxSheetRows) {
        setSaveStatus("Слишком много строк (" + lines.length + " > " + CONFIG.maxSheetRows + ")", "error");
        return;
    }
    setSaveStatus("Pushing...");

    const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1!A1:A${CONFIG.maxSheetRows}:clear`;
    const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1!A1:A${CONFIG.maxSheetRows}?valueInputOption=RAW`;

    try {
        let token = AppState.googleToken;

        const doClear = () => fetch(clearUrl, {
            method: "POST",
            headers: { Authorization: "Bearer " + token },
        });
        const doPut = () => fetch(putUrl, {
            method: "PUT",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ values: lines.map((l) => [l]) }),
        });

        // Clear хвоста листа, чтобы старые строки не оставались
        let res = await doClear();
        if (res.status === 401) {
            try { token = await getAccessToken(); }
            catch { setSaveStatus("Нужен доступ Google — нажмите Push ещё раз", "error"); return; }
            res = await doClear();
        }
        // Игнорируем не-401 ошибки clear — не критично

        res = await doPut();
        if (res.status === 401) {
            try { token = await getAccessToken(); }
            catch { setSaveStatus("Нужен доступ Google — нажмите Push ещё раз", "error"); return; }
            res = await doPut();
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setSaveStatus("Push error: " + ((err.error && err.error.message) || res.status), "error");
            return;
        }
        setSaveStatus("Pushed to Sheets ✓ (" + lines.length + " lines)", "ok");
    } catch (e) {
        console.error("Push failed:", e);
        setSaveStatus("Push error: " + (e.message || e), "error");
    }
}

function bindToolbar() {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tool = btn.dataset.tool;
            if (tool === "group") return groupSelected();
            if (tool === "ungroup") return ungroupSelected();
            if (tool === "delete") return deleteSelected();

            if (tool === "text") addText();
            setCurrentTool(tool);
            activateTool(tool);
        });
    });

    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", fn);
    };

    bind("btn-zoom-in", () => { zoomIn(); updateZoomUI(); });
    bind("btn-zoom-out", () => { zoomOut(); updateZoomUI(); });
    bind("btn-zoom-reset", () => { resetZoom(); updateZoomUI(); });

    const gridBtn = document.getElementById("btn-grid");
    if (gridBtn) {
        gridBtn.addEventListener("click", () => {
            const on = toggleGrid();
            gridBtn.classList.toggle("active", on);
        });
    }

    bind("btn-pull", pullFromSheets);
    bind("btn-push", pushToSheets);
    bind("btn-signout", () => Auth.logout());
    bind("btn-export-png", exportPNG);
    bind("btn-export-svg", exportSVG);
}

function bindHotkeys() {
    Hotkeys.bind({
        'v': () => { setCurrentTool("select"); activateTool("select"); },
        'r': () => { setCurrentTool("rectangle"); activateTool("rectangle"); },
        'd': () => { setCurrentTool("diamond"); activateTool("diamond"); },
        'o': () => { setCurrentTool("circle"); activateTool("circle"); },
        'l': () => { setCurrentTool("line"); activateTool("line"); },
        'a': () => { setCurrentTool("arrow"); activateTool("arrow"); },
        't': () => { addText(); activateTool("text"); },
        'p': () => { setCurrentTool("pencil"); activateTool("pencil"); },
        'e': () => { setCurrentTool("eraser"); activateTool("eraser"); },
        'h': () => { setCurrentTool("hand"); activateTool("hand"); },
        '?': () => { const d = document.getElementById('hotkeyHelp'); if (d) d.showModal(); },
        'delete': () => deleteSelected(),
        'backspace': () => deleteSelected(),
        'escape': () => {
            if (AppState.canvas) {
                AppState.canvas.discardActiveObject();
                AppState.canvas.requestRenderAll();
            }
        },
    }, { ignoreInInput: true });

    document.addEventListener("keydown", (e) => {
        if (!AppState.canvas) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const active = AppState.canvas.getActiveObject();
        if (active && active.isEditing) return;

        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && e.code === "KeyS") { e.preventDefault(); pushToSheets(); }
        else if (ctrl && e.code === "KeyZ") { e.preventDefault(); AppState.history.undo(); }
        else if (ctrl && e.code === "KeyY") { e.preventDefault(); AppState.history.redo(); }
        else if (ctrl && e.shiftKey && e.code === "KeyG") { e.preventDefault(); ungroupSelected(); }
        else if (ctrl && e.code === "KeyG") { e.preventDefault(); groupSelected(); }
    });
}

function activateTool(tool) {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
        b.classList.toggle(
            "active",
            b.dataset.tool === tool &&
            ["select", "rectangle", "diamond", "circle",
                "line", "arrow", "text", "pencil", "eraser", "hand"].includes(tool)
        );
    });
}

function bindStatus() {
    document.addEventListener("coords:update", (e) => {
        const el = document.getElementById("status-coords");
        if (el) el.textContent = "x: " + e.detail.x + ", y: " + e.detail.y;
    });
    document.addEventListener("zoom:changed", (e) => {
        const el = document.getElementById("status-zoom");
        if (el) el.textContent = e.detail.zoom + "%";
    });
}

function setSaveStatus(text, cls) {
    const el = document.getElementById("save-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = cls === "error" ? "var(--danger)"
        : cls === "ok" ? "var(--success)"
            : "var(--text-dim)";
}

function exportPNG() {
    const dataURL = getCanvas().toDataURL({ format: "png", multiplier: 2 });
    download(dataURL, "schema.png");
}

function exportSVG() {
    const svg = getCanvas().toSVG();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    download(url, "schema.svg");
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function download(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

document.addEventListener("history:request", () => {
    if (AppState.history) AppState.history.saveState();
});

init();