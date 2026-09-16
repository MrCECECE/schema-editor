import { initEditor, getCanvas, toggleGrid } from "./editor.js";
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
    paintIcons();
    AppState.canvas = initEditor();
    bindToolbar();
    bindStatus();

    refresh();
    AppState.refreshTimer = setInterval(refresh, CONFIG.refreshInterval);
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
        .map((row) => (row && row.length > 0 ? String(row[0]).split(/\r?\n/) : []))
        .flat()
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
    document.getElementById("btn-zoom-in").addEventListener("click", () => {
        const c = getCanvas();
        c.setZoom(c.getZoom() + 0.1);
        c.renderAll();
    });
    document.getElementById("btn-zoom-out").addEventListener("click", () => {
        const c = getCanvas();
        c.setZoom(c.getZoom() - 0.1);
        c.renderAll();
    });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => {
        const c = getCanvas();
        c.setZoom(1);
        c.renderAll();
    });
    document.getElementById("btn-grid").addEventListener("click", () => {
        const on = toggleGrid();
        document.getElementById("btn-grid").classList.toggle("active", on);
    });
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

function setStatus(text, cls) {
    const el = document.getElementById("save-status");
    if (!el) return;
    el.textContent = text;
    el.style.color = cls === "error" ? "var(--danger)" : cls === "ok" ? "var(--success)" : "var(--text-dim)";
}

init();
