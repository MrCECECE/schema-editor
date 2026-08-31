import { ICONS } from "./icons.js";
import { login, logout, setSession, getSession, isAuthenticated, getUserRole } from "./auth.js";
import { initEditor, getCanvas, setCurrentTool, getCurrentTool, toggleGrid, isGridEnabled, zoomIn, zoomOut, resetZoom, updateZoomUI, groupSelected, ungroupSelected, deleteSelected, addText, loadFromJSON, getJSON, saveUndo } from "./editor.js";
import { createHistory } from "./history.js";
import { checkConnection, loadSchema, saveSchema, isStorageConfigured } from "./storage.js";
import { initToolbarUI } from "./toolbar.js";

const AppState = {
    mode: "view",
    currentUser: null,
    canvas: null,
    isDirty: false,
    autoSaveTimer: null,
    lastSha: null,
};

const loginScreen = document.getElementById("login-screen");
const editorScreen = document.getElementById("editor-screen");
const saveStatusEl = document.getElementById("save-status");
const statusModeEl = document.getElementById("status-mode");
const statusUserEl = document.getElementById("status-user");
const statusCoordsEl = document.getElementById("status-coords");
const statusZoomEl = document.getElementById("status-zoom");

function setMode(mode) {
    AppState.mode = mode;
    statusModeEl.textContent = mode === "edit" ? "Режим: редактирование" : "Режим: просмотр";
    const editable = mode === "edit";
    ["btn-save", "btn-load", "btn-export-png", "btn-export-svg"].forEach((id) => {
        document.getElementById(id).style.display = editable ? "" : "none";
    });
    document.querySelector(".toolbar").style.pointerEvents = editable ? "" : "none";
    document.querySelector(".toolbar").style.opacity = editable ? "1" : "0.5";
    document.querySelector(".properties-panel").style.pointerEvents = editable ? "" : "none";
    document.querySelector(".properties-panel").style.opacity = editable ? "1" : "0.5";
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

// ===== Login =====
const loginForm = document.getElementById("login-form");
loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const errorEl = document.getElementById("login-error");

    const result = await login(username, password);
    if (!result.success) {
        errorEl.textContent = result.message;
        errorEl.classList.remove("hidden");
        return;
    }
    setSession(result.user);
    AppState.currentUser = result.user;
    showEditor();
});

// ===== Editor startup =====
function showEditor() {
    loginScreen.classList.add("hidden");
    editorScreen.classList.remove("hidden");
    const role = getUserRole(AppState.currentUser.username);
    setMode(role === "editor" ? "edit" : "view");
    statusUserEl.textContent = `Пользователь: ${AppState.currentUser.username} (${role})`;
    setSaveStatus("Загрузка...");
    AppState.canvas.getObjects().forEach((o) => {
        if (!o.excludeFromExport) AppState.canvas.remove(o);
    });
    AppState.canvas.requestRenderAll();
    doLoad();
}

function init() {
    paintIcons();
    AppState.canvas = initEditor();
    AppState.history = createHistory(AppState.canvas);
    initToolbarUI();
    bindToolbar();
    bindHotkeys();
    bindStatus();

    document.addEventListener("canvas:dirty", () => {
        AppState.isDirty = true;
        scheduleAutoSave();
    });
    document.addEventListener("history:request", () => {
        AppState.history.saveState();
    });
    document.addEventListener("selection:changed", () => {
        if (AppState.history) {
            // preserve: don't add history on selection change; handled by undo request on mouse:up
        }
    });

    if (isAuthenticated()) {
        const session = getSession();
        AppState.currentUser = { username: session.username };
        showEditor();
    } else {
        loginScreen.classList.remove("hidden");
    }
}

// ===== Toolbar =====
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
                b.classList.toggle("active", b === btn && ["select", "rectangle", "diamond", "circle", "line", "arrow", "text", "pencil", "eraser"].includes(tool));
            });
            if (tool === "text") {
                addText();
            }
            setCurrentTool(tool);
        });
    });

    document.getElementById("btn-zoom-in").addEventListener("click", zoomIn);
    document.getElementById("btn-zoom-out").addEventListener("click", zoomOut);
    document.getElementById("btn-zoom-reset").addEventListener("click", resetZoom);
    document.getElementById("btn-grid").addEventListener("click", () => {
        const on = toggleGrid();
        document.getElementById("btn-grid").classList.toggle("active", on);
    });

    document.getElementById("btn-save").addEventListener("click", doSave);
    document.getElementById("btn-load").addEventListener("click", doLoad);
    document.getElementById("btn-export-png").addEventListener("click", exportPNG);
    document.getElementById("btn-export-svg").addEventListener("click", exportSVG);
    document.getElementById("btn-logout").addEventListener("click", doLogout);
}

// ===== Hotkeys =====
function bindHotkeys() {
    document.addEventListener("keydown", (e) => {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
            if (AppState.canvas.getActiveObject() && AppState.canvas.getActiveObject().isEditing) return;
        }

        const ctrl = e.ctrlKey || e.metaKey;

        const editMode = AppState.mode === "edit";
        if (!editMode && e.key !== "Escape") return;

        if (ctrl && e.key.toLowerCase() === "s") {
            e.preventDefault();
            doSave();
        } else if (ctrl && e.key.toLowerCase() === "z") {
            e.preventDefault();
            AppState.history.undo();
        } else if (ctrl && e.key.toLowerCase() === "y") {
            e.preventDefault();
            AppState.history.redo();
        } else if (ctrl && e.shiftKey && e.key.toLowerCase() === "g") {
            e.preventDefault();
            ungroupSelected();
        } else if (ctrl && e.key.toLowerCase() === "g") {
            e.preventDefault();
            groupSelected();
        } else if (e.key === "Delete") {
            deleteSelected();
        } else if (e.key === "Escape") {
            AppState.canvas.discardActiveObject();
            AppState.canvas.requestRenderAll();
        } else if (e.key.toLowerCase() === "v") { setCurrentTool("select"); activateTool("select"); }
        else if (e.key.toLowerCase() === "r") { setCurrentTool("rectangle"); activateTool("rectangle"); }
        else if (e.key.toLowerCase() === "d") { setCurrentTool("diamond"); activateTool("diamond"); }
        else if (e.key.toLowerCase() === "o") { setCurrentTool("circle"); activateTool("circle"); }
        else if (e.key.toLowerCase() === "l") { setCurrentTool("line"); activateTool("line"); }
        else if (e.key.toLowerCase() === "a") { setCurrentTool("arrow"); activateTool("arrow"); }
        else if (e.key.toLowerCase() === "t") { addText(); activateTool("text"); }
        else if (e.key.toLowerCase() === "p") { setCurrentTool("pencil"); activateTool("pencil"); }
        else if (e.key.toLowerCase() === "e") { setCurrentTool("eraser"); activateTool("eraser"); }
    });
}

function activateTool(tool) {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
        b.classList.toggle("active", b.dataset.tool === tool && ["select", "rectangle", "diamond", "circle", "line", "arrow", "text", "pencil", "eraser"].includes(tool));
    });
    document.querySelectorAll(".tool-btn[data-tool]").forEach((b) => {
        if (b.dataset.tool === "text" && tool === "text") b.classList.add("active");
    });
}

// ===== Status =====
function bindStatus() {
    document.addEventListener("coords:update", (e) => {
        statusCoordsEl.textContent = `x: ${e.detail.x}, y: ${e.detail.y}`;
    });
    document.addEventListener("zoom:changed", (e) => {
        statusZoomEl.textContent = `${e.detail.zoom}%`;
    });
}

function setSaveStatus(text, cls) {
    saveStatusEl.textContent = text;
    saveStatusEl.style.color = cls === "error" ? "var(--danger)" : cls === "ok" ? "var(--success)" : "var(--text-dim)";
}
// ===== Storage =====
async function doLoad() {
    if (!isStorageConfigured()) {
        setSaveStatus("Хранилище GitHub не настроено", "info");
        return;
    }
    setSaveStatus("Загрузка...");
    const result = await loadSchema();
    if (result.success) {
        AppState.lastSha = result.sha;
        await loadFromJSON(result.data);
        setSaveStatus("Загружено ✓", "ok");
        AppState.isDirty = false;
        AppState.history.saveState();
    } else {
        setSaveStatus("Ошибка загрузки", "error");
        console.warn(result.message);
    }
}

async function doSave() {
    if (!AppState.currentUser) return;
    if (AppState.mode !== "edit") return;
    if (!isStorageConfigured()) {
        setSaveStatus("Хранилище GitHub не настроено", "info");
        return;
    }
    const data = {
        version: "1.0",
        objects: getJSON().objects,
        background: "#1a1a2e",
    };
    setSaveStatus("Сохраняется...");
    const result = await saveSchema(data, { sha: AppState.lastSha });
    if (result.success) {
        AppState.lastSha = result.sha;
        AppState.isDirty = false;
        setSaveStatus("Сохранено ✓", "ok");
    } else {
        setSaveStatus("Ошибка сохранения", "error");
        console.warn(result.message);
    }
}

function scheduleAutoSave() {
    if (!AppState.currentUser) return;
    if (AppState.autoSaveTimer) clearTimeout(AppState.autoSaveTimer);
    AppState.autoSaveTimer = setTimeout(() => {
        doSave();
        AppState.autoSaveTimer = setInterval(() => {
            if (AppState.isDirty) doSave();
        }, 30000);
    }, 2000);
}

// ===== Export =====
function exportPNG() {
    const canvas = AppState.canvas;
    const dataURL = canvas.toDataURL({ format: "png", multiplier: 2 });
    download(dataURL, "schema.png");
}

function exportSVG() {
    const svg = AppState.canvas.toSVG();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    download(url, "schema.svg");
    URL.revokeObjectURL(url);
}

function download(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// ===== Logout =====
function doLogout() {
    logout();
    AppState.currentUser = null;
    editorScreen.classList.add("hidden");
    loginScreen.classList.remove("hidden");
    document.getElementById("login-password").value = "";
    document.getElementById("login-error").classList.add("hidden");
}

init();
