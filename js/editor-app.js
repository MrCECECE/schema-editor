import { initEditor, getCanvas, toggleGrid, setCurrentTool, zoomIn, zoomOut, resetZoom, updateZoomUI, groupSelected, ungroupSelected, deleteSelected, addText, getCanvasBgColor, updateObjectsForTheme, setViewOnlyMode } from "./editor.js";
import { createHistory } from "./history.js";
import { parseLines, renderOnCanvas, encodeCanvas } from "./sheetlang.js";
import { setSession, getSession, logout } from "./auth.js";
import { ICONS } from "./icons.js";

const CONFIG = {
    sheetsId: "1e3ut8uuhbwHS0ZpZL-VWvP886mBXwgFUzSRrjkQS15k",
    // Google OAuth: поставьте свой Client ID из console.cloud.google.com
    // Чтобы включить: Google Cloud Console → Credentials → OAuth 2.0 Client ID
    // Authorized JavaScript origins: http://localhost:8099 (или ваш домен)
    googleClientId: "959024824195-qgn1g80lac013lniqan8gk7j1lod9l64.apps.googleusercontent.com",
    scopes: "openid email https://www.googleapis.com/auth/spreadsheets",
    refreshInterval: 86400000,
};

const AppState = {
    canvas: null,
    history: null,
    googleToken: null,
    googleUser: null,
    tokenClient: null,
    tokenResolve: null,
    isMobile: false,
};

function detectMobile() {
    return window.innerWidth <= 900 || "ontouchstart" in window;
}

function paintIcons() {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
        const tool = btn.dataset.tool;
        if (ICONS[tool]) btn.innerHTML = ICONS[tool];
    });
    document.querySelectorAll("#btn-zoom-in, #btn-zoom-out, #btn-zoom-reset, #btn-grid").forEach((btn) => {
        const key = btn.id.replace("btn-", "");
        const iconKey = { "zoom-in": "zoomIn", "zoom-out": "zoomOut", "zoom-reset": "zoomReset", grid: "grid" }[key];
        if (ICONS[iconKey]) btn.innerHTML = ICONS[iconKey];
    });
}

function initTheme() {
    const saved = localStorage.getItem("schema-theme") || "dark";
    document.body.className = "theme-" + saved;
    updateThemeIcon(saved);
}

function toggleTheme() {
    const current = document.body.className.includes("dark") ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.body.className = "theme-" + next;
    localStorage.setItem("schema-theme", next);
    updateThemeIcon(next);
    if (AppState.canvas) {
        updateObjectsForTheme();
        AppState.canvas.setBackgroundColor(getCanvasBgColor());
        AppState.canvas.renderAll();
    }
}

function updateThemeIcon(theme) {
    const icon = document.querySelector(".theme-icon");
    if (icon) {
        icon.textContent = theme === "dark" ? "🌙" : "☀️";
    }
}

let bottomSheet = null;

function init() {
    try {
        if (typeof fabric === "undefined") {
            showFatalError("Fabric.js не загрузился.");
            return;
        }
        AppState.isMobile = detectMobile();
        initTheme();
        setupDrawer();
        setupBottomSheet();

        const themeBtn = document.getElementById("btn-theme-toggle");
        if (themeBtn) {
            themeBtn.addEventListener("click", toggleTheme);
        }

        window.addEventListener("resize", onResize);

    const session = getSession();
    if (session && session.googleToken && CONFIG.googleClientId && CONFIG.googleClientId.indexOf("googleusercontent") !== -1) {
        AppState.googleToken = session.googleToken;
        AppState.googleUser = { username: session.email || "unknown" };
    }
    showEditor();
    if (document.getElementById("google-signin-container") && CONFIG.googleClientId) {
        initGoogleSignIn();
    }
    } catch (e) {
        console.error("Init failed:", e);
        showFatalError("Ошибка инициализации: " + (e && e.message ? e.message : "unknown"));
    }
}

function showFatalError(msg) {
    const container = document.getElementById("canvas-container");
    if (container) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#f87171;font-size:14px;text-align:center;padding:40px;">' + msg + "</div>";
    }
}

function onResize() {
    const wasMobile = AppState.isMobile;
    AppState.isMobile = detectMobile();
    if (wasMobile !== AppState.isMobile) {
        panelToggleBound = false;
        rebuildBottomSheet();
        bindPanelToggle();
    }
    if (AppState.canvas) {
        fitCanvas();
    }
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
        AppState.canvas.renderAll();
        updateZoomUI();
    }
}

function setupDrawer() {
    const toggle = document.getElementById("drawer-toggle");
    const drawer = document.getElementById("toolbar-drawer");
    const close = document.getElementById("drawer-close");
    const backdrop = document.getElementById("drawer-backdrop");
    if (!toggle || !drawer) return;

    function openDrawer() {
        drawer.classList.add("open");
        backdrop.classList.remove("hidden");
    }

    function closeDrawer() {
        drawer.classList.remove("open");
        backdrop.classList.add("hidden");
    }

    toggle.addEventListener("click", openDrawer);
    if (close) { close.title = "Закрыть панель"; close.addEventListener("click", closeDrawer); }
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
}

let panelToggleBound = false;

function setupBottomSheet() {
    if (window.innerWidth > 900) return;

    const panel = document.getElementById("properties-panel");
    if (!panel) return;
    bindPanelToggle();
    rebuildBottomSheet();
}

function bindPanelToggle() {
    if (panelToggleBound) return;
    const openBtn = document.getElementById("panel-toggle");
    if (openBtn) {
        openBtn.addEventListener("click", () => {
            if (bottomSheet) bottomSheet.classList.toggle("open");
        });
        panelToggleBound = true;
    }
}

function rebuildBottomSheet() {
    if (bottomSheet) {
        bottomSheet.remove();
        bottomSheet = null;
    }

    const isMobile = window.innerWidth <= 900;

    if (!isMobile) {
        const panel = document.getElementById("properties-panel");
        if (!panel) return;
        const hint = panel.querySelector(".props-hint");
        const fields = panel.querySelector(".props-fields");
        if (hint && hint.parentElement !== panel) panel.appendChild(hint);
        if (fields && fields.parentElement !== panel) panel.appendChild(fields);
        hint.classList.remove("hidden");
        return;
    }

    const panel = document.getElementById("properties-panel");
    if (!panel) return;

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
        if (e.target === bottomSheet) {
            bottomSheet.classList.remove("open");
        }
    });
}

function ensureTokenClient() {
    if (AppState.tokenClient) return true;
    if (!CONFIG.googleClientId) return false;
    if (typeof google === "undefined" || !google.accounts || !google.accounts.oauth2) return false;
    AppState.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CONFIG.googleClientId,
        scope: CONFIG.scopes,
        callback: handleTokenResponse,
    });
    return true;
}

function initGoogleSignIn() {
    if (!CONFIG.googleClientId) return;
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
    btn.addEventListener("click", () => {
        requestAccessToken();
    });
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
        if (!ensureTokenClient()) {
            reject(new Error("oauth2 not ready"));
            return;
        }
        AppState.tokenResolve = { resolve, reject };
        AppState.tokenClient.requestAccessToken();
    });
}

function handleTokenResponse(response) {
    if (!response || response.error) {
        const err = response && response.error ? response.error : "unknown";
        if (AppState.tokenResolve) {
            const r = AppState.tokenResolve;
            AppState.tokenResolve = null;
            r.reject(new Error(err));
        } else {
            setSaveStatus("Ошибка входа: " + err, "error");
        }
        return;
    }
    AppState.googleToken = response.access_token;

    if (AppState.tokenResolve) {
        const r = AppState.tokenResolve;
        AppState.tokenResolve = null;
        r.resolve(response.access_token);
        return;
    }

    fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: "Bearer " + response.access_token },
    })
        .then((res) => res.json())
        .then((info) => {
            const email = info.email || info.name || "unknown";
            AppState.googleUser = { username: email };
            setSession({ email, googleToken: response.access_token });
            showEditor();
        })
        .catch(() => {
            AppState.googleUser = { username: "unknown" };
            setSession({ email: "unknown", googleToken: response.access_token });
            showEditor();
        });
}

function showEditor() {
    paintIcons();
    AppState.canvas = initEditor();
    AppState.history = createHistory(AppState.canvas);
    bindToolbar();
    bindHotkeys();
    bindStatus();

    setTimeout(() => {
        fitCanvas();
        if (AppState.isMobile) rebuildBottomSheet();
    }, 0);

    if (AppState.googleToken && CONFIG.googleClientId) {
        setSignedInUI(true);
    } else {
        setSignedInUI(false);
    }

    const userEl = document.getElementById("status-user");
    if (userEl && AppState.googleUser) userEl.textContent = "Google: " + AppState.googleUser.username;

    pullFromSheets();
}

function setSignedInUI(signedIn) {
    ["btn-pull", "btn-push", "btn-export-png", "btn-export-svg", "btn-signout"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = signedIn ? "" : "none";
    });
}

async function pullFromSheets() {
    if (!CONFIG.sheetsId) {
        setSaveStatus("Configure sheetsId in CONFIG", "info");
        return;
    }
    setSaveStatus("Loading...");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1`;
    try {
        let token = AppState.googleToken;
        let res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (res.status === 401 || res.status === 403) {
            try {
                token = await getAccessToken();
            } catch {
                setSaveStatus("Нужен доступ Google — нажмите Pull ещё раз", "error");
                return;
            }
            res = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const lines = extractLines(data);
        if (lines.length > 0) {
            const { objects, groups } = parseLines(lines);
            renderOnCanvas(AppState.canvas, objects, groups);
            updateObjectsForTheme();
            AppState.history.saveState();
            setSaveStatus("Loaded from Sheets ✓", "ok");
        } else {
            setSaveStatus("Sheet empty", "info");
        }
    } catch (e) {
        console.error("Pull failed:", e);
        setSaveStatus("Pull error", "error");
    }
}

async function pushToSheets() {
    if (!AppState.googleToken) {
        setSaveStatus("Not signed in", "error");
        return;
    }
    if (!CONFIG.sheetsId) {
        setSaveStatus("Configure sheetsId in CONFIG", "info");
        return;
    }
    const lines = encodeCanvas(getCanvas());
    const values = lines.map((l) => [l]);
    setSaveStatus("Pushing...");
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1!A1:A1000?valueInputOption=RAW`;
    try {
        let token = AppState.googleToken;
        let res = await fetch(url, {
            method: "PUT",
            headers: {
                Authorization: "Bearer " + token,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ values }),
        });
        if (res.status === 401 || res.status === 403) {
            try {
                token = await getAccessToken();
            } catch {
                setSaveStatus("Нужен доступ Google — нажмите Push ещё раз", "error");
                return;
            }
            res = await fetch(url, {
                method: "PUT",
                headers: {
                    Authorization: "Bearer " + token,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ values }),
            });
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            setSaveStatus("Push error: " + ((err.error && err.error.message) || res.status), "error");
            return;
        }
        setSaveStatus("Pushed to Sheets ✓ (" + lines.length + " lines)", "ok");
    } catch (e) {
        console.error("Push failed:", e);
        setSaveStatus("Push error", "error");
    }
}

function extractLines(data) {
    if (!data.values || !Array.isArray(data.values)) return [];
    return data.values
        .map((row) => (row && row.length > 0 ? String(row[0]) : ""))
        .filter((line) => line.trim() && !line.trim().startsWith("#"));
}

function bindToolbar() {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const tool = btn.dataset.tool;
            if (["group", "ungroup", "delete"].includes(tool)) {
                if (tool === "group") groupSelected();
                else if (tool === "ungroup") ungroupSelected();
                else deleteSelected();
                return;
            }
            document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
                b.classList.toggle("active", b === btn && ["select", "rectangle", "diamond", "circle", "line", "arrow", "text", "pencil", "eraser", "hand"].includes(tool));
            });
            if (tool === "text") addText();
            if (tool === "hand") { /* нет доп. действия, setCurrentTool ниже */ }
            setCurrentTool(tool);
        });
    });

    const zoomInBtn = document.getElementById("btn-zoom-in");
    if (zoomInBtn) {
        zoomInBtn.addEventListener("click", () => {
            const canvas = getCanvas();
            if (canvas) { zoomIn(); updateZoomUI(); }
            else console.warn("Canvas not available for zoomIn");
        });
    }
    const zoomOutBtn = document.getElementById("btn-zoom-out");
    if (zoomOutBtn) {
        zoomOutBtn.addEventListener("click", () => {
            const canvas = getCanvas();
            if (canvas) { zoomOut(); updateZoomUI(); }
            else console.warn("Canvas not available for zoomOut");
        });
    }
    const zoomResetBtn = document.getElementById("btn-zoom-reset");
    if (zoomResetBtn) {
        zoomResetBtn.addEventListener("click", () => {
            const canvas = getCanvas();
            if (canvas) { resetZoom(); updateZoomUI(); }
            else console.warn("Canvas not available for resetZoom");
        });
    }
    const gridBtn = document.getElementById("btn-grid");
    if (gridBtn) {
        gridBtn.addEventListener("click", () => {
            const on = toggleGrid();
            gridBtn.classList.toggle("active", on);
        });
    }

    const pullBtn = document.getElementById("btn-pull");
    if (pullBtn) pullBtn.addEventListener("click", pullFromSheets);
    const pushBtn = document.getElementById("btn-push");
    if (pushBtn) pushBtn.addEventListener("click", pushToSheets);
    const signoutBtn = document.getElementById("btn-signout");
    if (signoutBtn) signoutBtn.addEventListener("click", signOut);
    const exportPngBtn = document.getElementById("btn-export-png");
    if (exportPngBtn) exportPngBtn.addEventListener("click", exportPNG);
    const exportSvgBtn = document.getElementById("btn-export-svg");
    if (exportSvgBtn) exportSvgBtn.addEventListener("click", exportSVG);
}

function signOut() {
    try {
        if (AppState.googleToken && typeof google !== "undefined" && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.revoke) {
            google.accounts.oauth2.revoke(AppState.googleToken, () => {});
        }
    } catch { /* ignore revoke errors */ }
    logout();
    AppState.googleToken = null;
    AppState.googleUser = null;
    setSignedInUI(false);
    initGoogleSignIn();
    setSaveStatus("Signed out", "info");
}

function bindHotkeys() {
    document.addEventListener("keydown", (e) => {
        if (!AppState.canvas) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
        const active = AppState.canvas.getActiveObject();
        if (active && active.isEditing) return;

        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && e.code === "KeyS") { e.preventDefault(); pushToSheets(); }
        else if (ctrl && e.code === "KeyZ") { e.preventDefault(); AppState.history.undo(); }
        else if (ctrl && e.code === "KeyY") { e.preventDefault(); AppState.history.redo(); }
        else if (ctrl && e.shiftKey && e.code === "KeyG") { e.preventDefault(); ungroupSelected(); }
        else if (ctrl && e.code === "KeyG") { e.preventDefault(); groupSelected(); }
        else if (e.code === "Delete") { deleteSelected(); }
        else if (e.code === "Escape") { AppState.canvas.discardActiveObject(); AppState.canvas.requestRenderAll(); }
        else if (e.code === "KeyV") { setCurrentTool("select"); activateTool("select"); }
        else if (e.code === "KeyH") { setCurrentTool("hand"); activateTool("hand"); }
        else if (e.code === "KeyR") { setCurrentTool("rectangle"); activateTool("rectangle"); }
        else if (e.code === "KeyD") { setCurrentTool("diamond"); activateTool("diamond"); }
        else if (e.code === "KeyO") { setCurrentTool("circle"); activateTool("circle"); }
        else if (e.code === "KeyL") { setCurrentTool("line"); activateTool("line"); }
        else if (e.code === "KeyA") { setCurrentTool("arrow"); activateTool("arrow"); }
        else if (e.code === "KeyT") { addText(); activateTool("text"); }
        else if (e.code === "KeyP") { setCurrentTool("pencil"); activateTool("pencil"); }
        else if (e.code === "KeyE") { setCurrentTool("eraser"); activateTool("eraser"); }
    });
}

function activateTool(tool) {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
        b.classList.toggle("active", b.dataset.tool === tool && ["select", "rectangle", "diamond", "circle", "line", "arrow", "text", "pencil", "eraser", "hand"].includes(tool));
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
    el.style.color = cls === "error" ? "var(--danger)" : cls === "ok" ? "var(--success)" : "var(--text-dim)";
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

document.addEventListener("canvas:dirty", () => {});
document.addEventListener("history:request", () => {
    if (AppState.history) AppState.history.saveState();
});

window.addEventListener("resize", () => {
    if (AppState.canvas) {
        const container = document.getElementById("canvas-container");
        if (container) {
            const maxW = container.parentElement.clientWidth - 40;
            const maxH = container.parentElement.clientHeight - 40;
            if (maxW > 0 && maxH > 0) {
                const zoomX = maxW / 1000;
                const zoomY = maxH / 700;
                const zoom = Math.min(zoomX, zoomY, 1);
                AppState.canvas.setZoom(zoom);
                updateZoomUI();
            }
        }
    }
});

init();
