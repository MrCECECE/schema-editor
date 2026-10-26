import {
    initEditor, getCanvas, toggleGrid, setCurrentTool,
    zoomIn, zoomOut, resetZoom, updateZoomUI,
    groupSelected, ungroupSelected, deleteSelected, addText,
    getCanvasBgColor, updateObjectsForTheme, setViewOnlyMode, setExportMode,
} from "./editor.js";
import {createHistory} from "./history.js";
import {parseLines, renderOnCanvas, encodeCanvas} from "./sheetlang.js";
import {initToolbarUI} from "./toolbar.js";
import {installFabricFixes} from "./fabric-fixes.js";
import {ICONS} from "./icons.js";

const CONFIG = {
    sheetsId: "1e3ut8uuhbwHS0ZpZL-VWvP886mBXwgFUzSRrjkQS15k",
    scopes: "openid email profile https://www.googleapis.com/auth/spreadsheets",
    maxSheetRows: 1000,
};

const AppState = {
    canvas: null,
    history: null,
    googleToken: null,
    googleUser: null,
    tokenClient: null,
    tokenQueue: [],
    tokenRequestInFlight: false,
    tokenTimer: null,
    isMobile: false,
    dirty: false,
    pushInFlight: false,
    pullInFlight: false,
    autoZoom: null,
    statusKind: null,
};

let googleSignInRetries = 0;

// Auth — top-level const в classic-скрипте, поэтому window.Auth === undefined.
function getAuth() {
    return typeof Auth !== "undefined" ? Auth : null;
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
        window.addEventListener("beforeunload", onBeforeUnload);
        document.addEventListener("canvas:dirty", markDirty);

        const auth = getAuth();
        const session = auth ? auth.getSession() : null;
        if (session && session.accessToken && window.APP_CONFIG?.googleClientId) {
            AppState.googleToken = session.accessToken;
            AppState.googleUser = {username: session.email || session.name || "unknown"};
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

function markDirty() {
    setDirty(true);
}

function setDirty(value) {
    AppState.dirty = !!value;
    const btn = document.getElementById("btn-push");
    if (btn) {
        btn.classList.toggle("dirty", AppState.dirty);
        btn.title = AppState.dirty ? "Сохранить (Ctrl+S) — есть несохранённые изменения" : "Сохранить (Ctrl+S)";
    }
}

function onBeforeUnload(e) {
    if (!AppState.dirty) return;
    e.preventDefault();
    e.returnValue = "";
}

function onResize() {
    const wasMobile = AppState.isMobile;
    AppState.isMobile = detectMobile();
    if (wasMobile !== AppState.isMobile) {
        rebuildBottomSheet();
    }
    if (AppState.canvas) fitCanvas(wasMobile !== AppState.isMobile);
}

function fitCanvas(force) {
    if (!AppState.canvas) return;
    const container = document.getElementById("canvas-container");
    if (!container || !container.parentElement) return;
    const maxW = container.parentElement.clientWidth - 40;
    const maxH = container.parentElement.clientHeight - 40;
    if (maxW <= 0 || maxH <= 0) return;

    // Не сбрасываем зум, который пользователь выставил руками.
    if (!force && AppState.autoZoom != null &&
        Math.abs(AppState.canvas.getZoom() - AppState.autoZoom) > 0.001) {
        return;
    }

    const zoom = Math.min(maxW / 1000, maxH / 700, 1);
    AppState.canvas.setZoom(zoom);
    AppState.canvas.requestRenderAll();
    AppState.autoZoom = zoom;
    updateZoomUI();
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
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && bottomSheet && bottomSheet.classList.contains("open")) {
            bottomSheet.classList.remove("open");
        }
    });
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
    handle.addEventListener("click", () => bottomSheet.classList.remove("open"));
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
        googleSignInRetries++;
        if (googleSignInRetries > 25) {
            const container = document.getElementById("google-signin-container");
            if (container) {
                container.textContent = "Google API не загрузился. Обновите страницу.";
                container.style.color = "var(--danger)";
                container.style.fontSize = "13px";
                container.style.padding = "var(--space-md)";
            }
            return;
        }
        setTimeout(initGoogleSignIn, 200);
        return;
    }
    googleSignInRetries = 0;
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

const TOKEN_TIMEOUT_MS = 60000;

function startTokenRequest() {
    AppState.tokenRequestInFlight = true;
    clearTimeout(AppState.tokenTimer);
    // Если popup заблокирован/закрыт, callback может не прийти — не держим
    // очередь промисов вечно.
    AppState.tokenTimer = setTimeout(() => {
        if (!AppState.tokenRequestInFlight) return;
        AppState.tokenRequestInFlight = false;
        AppState.tokenTimer = null;
        while (AppState.tokenQueue.length) {
            AppState.tokenQueue.shift().reject(new Error("timeout"));
        }
        setSaveStatus("Вход не завершён. Попробуйте ещё раз.", "error");
    }, TOKEN_TIMEOUT_MS);
    AppState.tokenClient.requestAccessToken();
}

function finishTokenRequest() {
    AppState.tokenRequestInFlight = false;
    clearTimeout(AppState.tokenTimer);
    AppState.tokenTimer = null;
}

function requestAccessToken() {
    if (!ensureTokenClient()) {
        setSaveStatus("Google API не загрузился — обновите страницу", "error");
        return;
    }
    if (AppState.tokenRequestInFlight) return;
    startTokenRequest();
}

function getAccessToken() {
    return new Promise((resolve, reject) => {
        if (!ensureTokenClient()) {
            reject(new Error("oauth2 not ready"));
            return;
        }
        AppState.tokenQueue.push({resolve, reject});
        // Если запрос уже летит — не открываем второй popup.
        if (AppState.tokenRequestInFlight) return;
        startTokenRequest();
    });
}

function handleTokenResponse(response) {
    finishTokenRequest();

    if (!response || response.error) {
        const err = response?.error || "unknown";
        while (AppState.tokenQueue.length) {
            AppState.tokenQueue.shift().reject(new Error(err));
        }
        // Отмена пользователем — не повод выкидывать живую сессию.
        if (err === "popup_closed" || err === "access_denied") {
            setSaveStatus("Вход отменён", "info");
            return;
        }
        const auth = getAuth();
        if (auth && auth.clearSession) auth.clearSession();
        AppState.googleToken = null;
        AppState.googleUser = null;
        setSignedInUI(false);
        updateStatusUser();
        setSaveStatus("Ошибка входа: " + err, "error");
        return;
    }
    AppState.googleToken = response.access_token;

    // Обновлённый GIS-токен должен переживать перезагрузку страницы.
    const auth = getAuth();
    if (auth && auth.updateSession) {
        auth.updateSession(response.access_token, response.expires_in);
    }

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
        headers: {Authorization: "Bearer " + response.access_token},
    })
        .then((res) => res.json())
        .then((info) => {
            AppState.googleUser = {username: info.email || info.name || "unknown"};
        })
        .catch(() => {
            AppState.googleUser = {username: "unknown"};
        })
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
    setDirty(false);

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
    // Экспорт не требует авторизации — кнопки не прячем.
    ["btn-pull", "btn-push"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = signedIn ? "" : "none";
    });
    const out = document.getElementById("btn-signout");
    if (out) {
        const auth = getAuth();
        out.style.display = (signedIn || (auth && auth.getSession())) ? "" : "none";
    }
    const gs = document.getElementById("google-signin-container");
    if (gs) gs.style.display = signedIn ? "none" : "";
}

function rowsFromData(data) {
    if (!data.values || !Array.isArray(data.values)) return [];
    return data.values.map((row) => (row && row.length > 0 ? String(row[0]) : ""));
}

async function pullFromSheets() {
    if (AppState.pullInFlight || AppState.pushInFlight) return;
    if (!CONFIG.sheetsId) {
        setSaveStatus("Configure sheetsId in CONFIG", "info");
        return;
    }
    if (!AppState.googleToken) {
        setSaveStatus("Войдите, чтобы загрузить", "info");
        return;
    }
    if (AppState.dirty &&
        !window.confirm("На холсте есть несохранённые изменения. Загрузить из Sheets и потерять их?")) {
        setSaveStatus("Загрузка отменена", "info");
        return;
    }

    AppState.pullInFlight = true;
    setSaveStatus("Loading...");

    const url = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1`;

    try {
        let token = AppState.googleToken;
        let res = await fetch(url, {headers: {Authorization: "Bearer " + token}});
        if (res.status === 401) {
            try {
                token = await getAccessToken();
            } catch {
                setSaveStatus("Нужен доступ Google — войдите заново", "error");
                return;
            }
            res = await fetch(url, {headers: {Authorization: "Bearer " + token}});
        }
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        const rows = rowsFromData(data);
        const {objects, groups, errors = []} = parseLines(rows);

        // Пустой лист должен очищать холст, иначе остаётся «призрак» схемы.
        renderOnCanvas(AppState.canvas, objects, groups);
        updateObjectsForTheme();
        AppState.history.clear();
        setDirty(false);

        if (errors.length) {
            console.warn("SheetLang: пропущены строки", errors);
        }
        if (objects.length > 0) {
            setSaveStatus(
                errors.length
                    ? `Loaded from Sheets ✓ (строк с ошибками: ${errors.length})`
                    : "Loaded from Sheets ✓",
                errors.length ? "info" : "ok"
            );
        } else {
            setSaveStatus(
                errors.length ? `Sheet empty (ошибок: ${errors.length})` : "Sheet empty",
                "info"
            );
        }
    } catch (e) {
        console.error("Pull failed:", e);
        setSaveStatus("Pull error: " + (e.message || e), "error");
    } finally {
        AppState.pullInFlight = false;
    }
}

async function readApiError(res) {
    const err = await res.json().catch(() => ({}));
    return (err.error && err.error.message) || ("HTTP " + res.status);
}

async function authorizedFetch(url, options = {}) {
    const doFetch = (token) => fetch(url, {
        ...options,
        headers: {...(options.headers || {}), Authorization: "Bearer " + token},
    });
    let res = await doFetch(AppState.googleToken);
    if (res.status === 401) {
        AppState.googleToken = await getAccessToken();
        res = await doFetch(AppState.googleToken);
    }
    return res;
}

async function pushToSheets() {
    if (AppState.pushInFlight || AppState.pullInFlight) return;
    if (!AppState.googleToken) {
        setSaveStatus("Not signed in", "error");
        return;
    }
    if (!CONFIG.sheetsId) {
        setSaveStatus("Configure sheetsId in CONFIG", "info");
        return;
    }

    let lines;
    try {
        lines = encodeCanvas(getCanvas());
    } catch (e) {
        console.error("Encode failed:", e);
        setSaveStatus("Не удалось сериализовать холст: " + (e.message || e), "error");
        return;
    }
    if (lines.length > CONFIG.maxSheetRows) {
        setSaveStatus("Слишком много строк (" + lines.length + " > " + CONFIG.maxSheetRows + ")", "error");
        return;
    }
    const canvasObjects = getCanvas().getObjects().filter((o) => !o.excludeFromExport);
    if (canvasObjects.length > 0 && lines.length === 0) {
        setSaveStatus("Ни один объект не удалось сериализовать — Push отменён", "error");
        return;
    }

    const pushBtn = document.getElementById("btn-push");
    AppState.pushInFlight = true;
    if (pushBtn) pushBtn.disabled = true;
    setSaveStatus("Pushing...");

    const base = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.sheetsId}/values/Sheet1`;
    const clearRange = (range) => authorizedFetch(`${base}!${range}:clear`, {method: "POST"});

    try {
        // Порядок важен: сначала пишем новые данные, и только после успешной
        // записи чистим хвост. Иначе упавший PUT оставляет лист пустым.
        if (lines.length > 0) {
            const res = await authorizedFetch(
                `${base}!A1:A${lines.length}?valueInputOption=RAW`,
                {
                    method: "PUT",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({values: lines.map((l) => [l])}),
                }
            );
            if (!res.ok) {
                setSaveStatus("Push error: " + await readApiError(res), "error");
                return;
            }
        } else {
            const res = await clearRange(`A1:A${CONFIG.maxSheetRows}`);
            if (!res.ok) {
                setSaveStatus("Push error (clear): " + await readApiError(res), "error");
                return;
            }
        }

        // Старые строки ниже нового блока удаляем только теперь.
        if (lines.length > 0 && lines.length < CONFIG.maxSheetRows) {
            const res = await clearRange(`A${lines.length + 1}:A${CONFIG.maxSheetRows}`);
            if (!res.ok) {
                setDirty(false);
                setSaveStatus(
                    "Данные записаны, но старый хвост листа не очищен — повторите Push",
                    "error"
                );
                return;
            }
        }

        setDirty(false);
        setSaveStatus("Pushed to Sheets ✓ (" + lines.length + " lines)", "ok");
    } catch (e) {
        console.error("Push failed:", e);
        setSaveStatus("Push error: " + (e.message || e), "error");
    } finally {
        AppState.pushInFlight = false;
        if (pushBtn) pushBtn.disabled = false;
    }
}

function bindToolbar() {
    document.querySelectorAll(".tool-btn[data-tool]").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            // После клика мышью кнопка остаётся в фокусе и перехватывает
            // Space (панорамирование). Для клавиатурной активации
            // (event.detail === 0) фокус сохраняем.
            if (event.detail > 0) btn.blur();
            const tool = btn.dataset.tool;
            if (tool === "group") return groupSelected();
            if (tool === "ungroup") return ungroupSelected();
            if (tool === "delete") return deleteSelected();

            if (tool === "text") {
                // Сначала переключаем инструмент (он снимает старое
                // выделение), потом создаём текст — иначе addText()
                // тут же деактивируется.
                setCurrentTool(tool);
                activateTool(tool);
                addText();
                return;
            }
            setCurrentTool(tool);
            activateTool(tool);
        });
    });

    const bind = (id, fn) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("click", (event) => {
            if (event.detail > 0) el.blur();
            fn(event);
        });
    };

    bind("btn-zoom-in", () => {
        zoomIn();
        updateZoomUI();
    });
    bind("btn-zoom-out", () => {
        zoomOut();
        updateZoomUI();
    });
    bind("btn-zoom-reset", () => {
        resetZoom();
        updateZoomUI();
    });

    const gridBtn = document.getElementById("btn-grid");
    if (gridBtn) {
        gridBtn.addEventListener("click", (event) => {
            if (event.detail > 0) gridBtn.blur();
            const on = toggleGrid();
            gridBtn.classList.toggle("active", on);
        });
    }

    bind("btn-pull", pullFromSheets);
    bind("btn-push", pushToSheets);
    bind("btn-signout", () => {
        const auth = getAuth();
        if (auth) auth.logout();
    });
    bind("btn-export-png", exportPNG);
    bind("btn-export-svg", exportSVG);
}

function bindHotkeys() {
    Hotkeys.bind({
        'v': () => {
            setCurrentTool("select");
            activateTool("select");
        },
        'r': () => {
            setCurrentTool("rectangle");
            activateTool("rectangle");
        },
        'd': () => {
            setCurrentTool("diamond");
            activateTool("diamond");
        },
        'o': () => {
            setCurrentTool("circle");
            activateTool("circle");
        },
        'l': () => {
            setCurrentTool("line");
            activateTool("line");
        },
        'a': () => {
            setCurrentTool("arrow");
            activateTool("arrow");
        },
        't': () => {
            setCurrentTool("text");
            activateTool("text");
            addText();
        },
        'p': () => {
            setCurrentTool("pencil");
            activateTool("pencil");
        },
        'e': () => {
            setCurrentTool("eraser");
            activateTool("eraser");
        },
        'h': () => {
            setCurrentTool("hand");
            activateTool("hand");
        },
        '?': () => {
            const d = document.getElementById('hotkeyHelp');
            if (d) d.showModal();
        },
        'delete': () => deleteSelected(),
        'backspace': () => deleteSelected(),
        'escape': () => {
            if (AppState.canvas) {
                AppState.canvas.discardActiveObject();
                AppState.canvas.requestRenderAll();
            }
        },
    }, {ignoreInInput: true});

    document.addEventListener("keydown", (e) => {
        if (!AppState.canvas) return;
        const ctrl = e.ctrlKey || e.metaKey;

        // Ctrl+S — глобальное сохранение: не отдаём его браузеру,
        // даже если фокус в поле свойств или в редактировании текста.
        if (ctrl && e.code === "KeyS") {
            e.preventDefault();
            if (!document.querySelector("dialog[open]")) pushToSheets();
            return;
        }

        if (document.querySelector("dialog[open]")) return;
        const tag = document.activeElement && document.activeElement.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        const active = AppState.canvas.getActiveObject();
        if (active && active.isEditing) return;

        if (ctrl && e.code === "KeyZ") {
            e.preventDefault();
            AppState.history.undo();
        } else if (ctrl && e.code === "KeyY") {
            e.preventDefault();
            AppState.history.redo();
        } else if (ctrl && e.shiftKey && e.code === "KeyG") {
            e.preventDefault();
            ungroupSelected();
        } else if (ctrl && e.code === "KeyG") {
            e.preventDefault();
            groupSelected();
        }
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

function statusColor(cls) {
    return cls === "error" ? "var(--danger)"
        : cls === "ok" ? "var(--success)"
            : "var(--text-dim)";
}

function setSaveStatus(text, cls) {
    const color = statusColor(cls);
    AppState.statusKind = cls || "info";
    const el = document.getElementById("save-status");
    if (el) {
        el.textContent = text;
        el.style.color = color;
    }
    // На мобильных верхний статус скрыт — дублируем в статусбар.
    const bar = document.getElementById("status-msg");
    if (bar) {
        bar.textContent = text;
        bar.style.color = color;
    }
}

function exportPNG() {
    setExportMode(true);
    try {
        const dataURL = getCanvas().toDataURL({format: "png", multiplier: 2});
        download(dataURL, "schema.png");
    } finally {
        setExportMode(false);
        getCanvas().requestRenderAll();
    }
}

function exportSVG() {
    const canvas = getCanvas();
    const bg = getCanvasBgColor();
    // toSVG() не рисует ни фон, ни сетку — добавляем фон вручную,
    // чтобы PNG и SVG выглядели одинаково.
    const svg = canvas.toSVG().replace(
        /(<svg\b[^>]*>)/,
        `$1<rect x="0" y="0" width="${canvas.getWidth()}" height="${canvas.getHeight()}" fill="${bg}"/>`
    );
    const blob = new Blob([svg], {type: "image/svg+xml;charset=utf-8"});
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