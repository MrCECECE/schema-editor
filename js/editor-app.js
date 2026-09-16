import { initEditor, getCanvas, setCurrentTool, toggleGrid, zoomIn, zoomOut, resetZoom, updateZoomUI, groupSelected, ungroupSelected, deleteSelected, addText } from "./editor.js";
import { createHistory } from "./history.js";
import { initToolbarUI } from "./toolbar.js";
import { parseLines, renderOnCanvas, encodeCanvas } from "./sheetlang.js";
import { setSession, getSession, logout } from "./auth.js";
import { ICONS } from "./icons.js";

const CONFIG = {
    sheetsId: "1e3ut8uuhbwHS0ZpZL-VWvP886mBXwgFUzSRrjkQS15k",
    googleClientId: "959024824195-qgn1g80lac013lniqan8gk7j1lod9l64.apps.googleusercontent.com",
    scopes: "openid email https://www.googleapis.com/auth/spreadsheets",
};

const AppState = {
    canvas: null,
    history: null,
    googleToken: null,
    googleUser: null,
    tokenClient: null,
    tokenResolve: null,
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
    const session = getSession();
    if (session && session.googleToken) {
        AppState.googleToken = session.googleToken;
        AppState.googleUser = { username: session.email || "unknown" };
        showEditor();
    } else {
        initGoogleSignIn();
    }
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
    btn.textContent = "Sign in with Google";
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
    initToolbarUI();
    bindToolbar();
    bindHotkeys();
    bindStatus();

    setSignedInUI(true);

    document.getElementById("status-user").textContent = "Google: " + AppState.googleUser.username;

    pullFromSheets();
}

function setSignedInUI(signedIn) {
    const gh = document.getElementById("google-signin-container");
    const gu = document.getElementById("google-user");
    ["btn-pull", "btn-push", "btn-export-png", "btn-export-svg", "btn-signout"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = signedIn ? "" : "none";
    });
    if (signedIn) {
        gh.style.display = "none";
        gu.classList.remove("hidden");
        gu.textContent = AppState.googleUser.username;
    } else {
        gh.style.display = "";
        gu.classList.add("hidden");
    }
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
                b.classList.toggle("active", b === btn && ["select", "rectangle", "diamond", "circle", "line", "arrow", "text", "pencil", "eraser"].includes(tool));
            });
            if (tool === "text") addText();
            setCurrentTool(tool);
        });
    });

    document.getElementById("btn-zoom-in").addEventListener("click", () => { zoomIn(); updateZoomUI(); });
    document.getElementById("btn-zoom-out").addEventListener("click", () => { zoomOut(); updateZoomUI(); });
    document.getElementById("btn-zoom-reset").addEventListener("click", () => { resetZoom(); updateZoomUI(); });
    document.getElementById("btn-grid").addEventListener("click", () => {
        const on = toggleGrid();
        document.getElementById("btn-grid").classList.toggle("active", on);
    });

    document.getElementById("btn-pull").addEventListener("click", pullFromSheets);
    document.getElementById("btn-push").addEventListener("click", pushToSheets);
    document.getElementById("btn-signout").addEventListener("click", signOut);
    document.getElementById("btn-export-png").addEventListener("click", exportPNG);
    document.getElementById("btn-export-svg").addEventListener("click", exportSVG);
}

function signOut() {
    try {
        if (AppState.googleToken && typeof google !== "undefined" && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.revoke) {
            google.accounts.oauth2.revoke(AppState.googleToken, () => {});
        }
    } catch {
        /* ignore revoke errors */
    }
    logout();
    AppState.googleToken = null;
    AppState.googleUser = null;
    setSignedInUI(false);
    initGoogleSignIn();
    setSaveStatus("Signed out", "info");
}

function bindHotkeys() {
    document.addEventListener("keydown", (e) => {
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") {
            if (AppState.canvas.getActiveObject() && AppState.canvas.getActiveObject().isEditing) return;
        }

        const ctrl = e.ctrlKey || e.metaKey;

        if (ctrl && e.key.toLowerCase() === "s") {
            e.preventDefault();
            pushToSheets();
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
}

function bindStatus() {
    document.addEventListener("coords:update", (e) => {
        document.getElementById("status-coords").textContent = "x: " + e.detail.x + ", y: " + e.detail.y;
    });
    document.addEventListener("zoom:changed", (e) => {
        document.getElementById("status-zoom").textContent = e.detail.zoom + "%";
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

document.addEventListener("canvas:dirty", () => {
    // future: auto-push to sheets
});
document.addEventListener("history:request", () => {
    if (AppState.history) AppState.history.saveState();
});

init();
