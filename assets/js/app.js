import { initEditor, getCanvas, toggleGrid, updateObjectsForTheme, getCanvasBgColor, updateZoomUI, setViewOnlyMode } from "./editor.js";
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

function init() {
    try {
        if (typeof fabric === "undefined") {
            showFatalError("Fabric.js не загрузился. Проверьте подключение к интернету.");
            return;
        }
        // Исправление fabric.js 5.3.0: "alphabetical" не валидный CanvasTextBaseline
        if (fabric.Text && fabric.Text.prototype._setTextStyles) {
            fabric.Text.prototype._setTextStyles = function(ctx, charStyle, forMeasuring) {
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
        Theme.apply(Theme.current());
        updateThemeIcon();
        paintIcons();
        AppState.canvas = initEditor();
        setViewOnly();
        bindToolbar();
        bindStatus();
        setTimeout(fitCanvas, 50);

        const themeBtn = document.getElementById("btn-theme-toggle");
        if (themeBtn) {
            themeBtn.addEventListener("click", () => {
                Theme.toggle();
                updateThemeIcon();
                if (AppState.canvas) {
                    updateObjectsForTheme();
                    AppState.canvas.setBackgroundColor(getCanvasBgColor());
                    AppState.canvas.renderAll();
                }
            });
        }

        refresh();
        AppState.refreshTimer = setInterval(refresh, CONFIG.refreshInterval);
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

function fitCanvas() {
    if (!AppState.canvas) return;
    const container = document.getElementById("canvas-container");
    if (!container || !container.parentElement) return;
    const maxW = container.parentElement.clientWidth - 40;
    const maxH = container.parentElement.clientHeight - 40;
    if (maxW > 0 && maxH > 0) {
        const zoomX = maxW / 1000;
        const zoomY = maxH / 700;
        const zoom = Math.min(zoomX, zoomY, 1);
        AppState.canvas.setZoom(zoom);
        AppState.canvas.renderAll();
        document.dispatchEvent(new CustomEvent("zoom:changed", { detail: { zoom: Math.round(AppState.canvas.getZoom() * 100) } }));
    }
}

async function refresh() {
    if (!CONFIG.sheetsId) {
        setStatus("Configure sheetsId in CONFIG", "info");
        return;
    }
    setStatus("Loading...");
    try {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1?key=${CONFIG.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const lines = extractLines(data);
        if (lines.length > 0) {
            const { objects, groups } = parseLines(lines);
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

function extractLines(data) {
    if (!data.values || !Array.isArray(data.values)) return [];
    return data.values
        .map((row) => (row && row.length > 0 ? String(row[0]) : ""))
        .filter((line) => line.trim() && !line.trim().startsWith("#"));
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
    if (!canvas) {
        console.error("Canvas not available in bindToolbar");
        return;
    }
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
        canvas.setZoom(canvas.getZoom() + 0.1);
        canvas.renderAll();
        updateZoomUI();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
        canvas.setZoom(canvas.getZoom() - 0.1);
        canvas.renderAll();
        updateZoomUI();
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
        canvas.setZoom(1);
        canvas.renderAll();
        updateZoomUI();
    });
    const gridBtn = document.getElementById("btn-grid");
    if (gridBtn) {
        gridBtn.addEventListener("click", () => {
            const on = toggleGrid();
            gridBtn.classList.toggle("active", on);
        });
    }
    document.getElementById("btn-export-png").addEventListener("click", exportPNG);
    document.getElementById("btn-export-svg").addEventListener("click", exportSVG);
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
    el.style.color = cls === "error" ? "var(--danger)" : cls === "ok" ? "var(--success)" : "var(--text-dim)";
}

function updateThemeIcon() {
    const icon = document.querySelector(".theme-icon");
    if (icon) {
        icon.textContent = document.documentElement.dataset.theme === "dark" ? "🌙" : "☀️";
    }
}

window.addEventListener("resize", () => {
    if (AppState.canvas) {
        const container = document.getElementById("canvas-container");
        if (container && container.parentElement) {
            const maxW = container.parentElement.clientWidth - 40;
            const maxH = container.parentElement.clientHeight - 40;
            if (maxW > 0 && maxH > 0) {
                const zoomX = maxW / 1000;
                const zoomY = maxH / 700;
                AppState.canvas.setZoom(Math.min(zoomX, zoomY, 1));
                document.dispatchEvent(new CustomEvent("zoom:changed", { detail: { zoom: Math.round(AppState.canvas.getZoom() * 100) } }));
            }
        }
    }
});

init();