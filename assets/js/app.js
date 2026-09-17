import {
    initEditor, getCanvas, toggleGrid, updateObjectsForTheme,
    getCanvasBgColor, updateZoomUI, setViewOnlyMode,
} from "./editor.js";
import { parseLines, renderOnCanvas } from "./sheetlang.js";
import { ICONS } from "./icons.js";

const CONFIG = {
    sheetsId: "1e3ut8uuhbwHS0ZpZL-VWvP886mBXwgFUzSRrjkQS15k",
    apiKey: "AIzaSyDBvCAl8VfOBfw8_G2VVpSKCNPrhSbJf-k",
    refreshInterval: 86400000,
};

const AppState = {
    canvas: null,
    lastUpdate: null,
    refreshTimer: null,
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

function updateThemeIcon() {
    const icon = document.querySelector(".theme-icon");
    if (icon) {
        icon.textContent = document.documentElement.dataset.theme === "dark" ? "🌙" : "☀️";
    }
}

function onThemeToggle() {
    Theme.toggle();
    updateThemeIcon();
    if (AppState.canvas) {
        updateObjectsForTheme();
        AppState.canvas.setBackgroundColor(getCanvasBgColor());
        AppState.canvas.requestRenderAll();
    }
}

function init() {
    try {
        if (typeof fabric === "undefined") {
            showFatalError("Fabric.js не загрузился. Проверьте подключение к интернету.");
            return;
        }
        installFabricFixes();
        Theme.apply(Theme.current());
        updateThemeIcon();
        paintIcons();

        AppState.canvas = initEditor();
        setViewOnly();
        bindToolbar();
        bindStatus();
        bindHotkeys();
        setTimeout(fitCanvas, 50);

        const themeBtn = document.getElementById("btn-theme-toggle");
        if (themeBtn) themeBtn.addEventListener("click", onThemeToggle);

        refresh();
        AppState.refreshTimer = setInterval(refresh, CONFIG.refreshInterval);
    } catch (e) {
        console.error("Init failed:", e);
        showFatalError("Ошибка инициализации: " + (e && e.message ? e.message : "unknown"));
    }
}

function bindHotkeys() {
    Hotkeys.bind({
        'd': onThemeToggle,
        '?': () => { const d = document.getElementById('hotkeyHelp'); if (d) d.showModal(); },
        'h': () => { const d = document.getElementById('hotkeyHelp'); if (d) d.showModal(); },
    });
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

async function refresh() {
    if (!CONFIG.sheetsId) { setStatus("Configure sheetsId in CONFIG", "info"); return; }
    setStatus("Loading...");
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1?key=${CONFIG.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const rows = rowsFromData(data);
        const { objects, groups } = parseLines(rows);

        if (objects.length > 0) {
            renderOnCanvas(AppState.canvas, objects, groups);
            updateObjectsForTheme();
            setViewOnly();
            AppState.lastUpdate = new Date();
            const ago = formatTimeAgo(AppState.lastUpdate);
            setStatus("Updated • " + ago, "ok");
            const updateEl = document.getElementById("status-update");
            if (updateEl) updateEl.textContent = "Updated: " + ago;
        } else {
            setStatus("Sheet empty", "info");
        }
    } catch (e) {
        console.error("Refresh failed:", e);
        setStatus("Load error", "error");
    }
}

function rowsFromData(data) {
    if (!data.values || !Array.isArray(data.values)) return [];
    return data.values.map((row) => (row && row.length > 0 ? String(row[0]) : ""));
}

function formatTimeAgo(date) {
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m ago";
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + "h ago";
    return Math.floor(hours / 24) + "d ago";
}

function bindToolbar() {
    const canvas = getCanvas();
    if (!canvas) { console.error("Canvas not available"); return; }

    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener("click", fn);
    };
    bind("btn-zoom-in", () => {
        canvas.setZoom(canvas.getZoom() + 0.1);
        canvas.requestRenderAll();
        updateZoomUI();
    });
    bind("btn-zoom-out", () => {
        canvas.setZoom(canvas.getZoom() - 0.1);
        canvas.requestRenderAll();
        updateZoomUI();
    });
    bind("btn-zoom-reset", () => {
        canvas.setZoom(1);
        canvas.requestRenderAll();
        updateZoomUI();
    });

    const gridBtn = document.getElementById("btn-grid");
    if (gridBtn) {
        gridBtn.addEventListener("click", () => {
            const on = toggleGrid();
            gridBtn.classList.toggle("active", on);
        });
    }

    bind("btn-export-png", exportPNG);
    bind("btn-export-svg", exportSVG);
}

function exportPNG() {
    const canvas = getCanvas();
    const dataURL = canvas.toDataURL({ format: "png", multiplier: 2 });
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

function setViewOnly() {
    setViewOnlyMode(true);
    const c = AppState.canvas;
    if (!c) return;
    (c.getObjects() || []).forEach((o) => {
        o.selectable = false;
        o.evented = false;
        o.hoverCursor = "default";
    });
}

function setStatus(text, cls) {
    const el = document.getElementById("save-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = cls === "error" ? "var(--danger)"
        : cls === "ok" ? "var(--success)"
            : "var(--text-dim)";
}

window.addEventListener("resize", () => {
    if (AppState.canvas) {
        const container = document.getElementById("canvas-container");
        if (container && container.parentElement) {
            const maxW = container.parentElement.clientWidth - 40;
            const maxH = container.parentElement.clientHeight - 40;
            if (maxW > 0 && maxH > 0) {
                const zoom = Math.min(maxW / 1000, maxH / 700, 1);
                AppState.canvas.setZoom(zoom);
                AppState.canvas.requestRenderAll();
                updateZoomUI();
            }
        }
    }
});

init();