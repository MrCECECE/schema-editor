export const CONFIG = {
    owner: "ВАШ_GITHUB_USERNAME",
    repo: "schema-editor",
    path: "data/schema.json",
    token: "ghp_ВАШ_PAT_ТОКЕН",
    // Для тестов с локальным эмулятором GitHub:
    // apiBase: "http://localhost:9000",
};

let API = "https://api.github.com";

// Позволяет переключить API на локальный mock (для тестирования).
export function setApiBase(base) {
    API = base ? base.replace(/\/+$/, "") : "https://api.github.com";
}
if (CONFIG.apiBase) setApiBase(CONFIG.apiBase);

// Поддержка переопределения конфига через URL-параметры (для тестирования):
//   ?apiBase=http://localhost:9000&owner=testowner&repo=schema-editor&token=fake
(function applyUrlOverrides() {
    try {
        const params = new URLSearchParams(window.location.search);
        const keyMap = { apiBase: "apiBase", owner: "owner", repo: "repo", token: "token" };
        let changed = false;
        for (const [param, cfgKey] of Object.entries(keyMap)) {
            const value = params.get(param);
            if (value) {
                CONFIG[cfgKey] = value;
                changed = true;
            }
        }
        if (changed && CONFIG.apiBase) setApiBase(CONFIG.apiBase);
    } catch (e) {
        // не в браузере — игнорируем
    }
})();

function headers() {
    return {
        "Authorization": `token ${CONFIG.token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    };
}

function isConfigured() {
    return (
        CONFIG.owner &&
        CONFIG.repo &&
        CONFIG.token &&
        !CONFIG.owner.startsWith("ВАШ_") &&
        !CONFIG.token.includes("_PAT_")
    );
}

export function isStorageConfigured() {
    return isConfigured();
}

export async function checkConnection() {
    if (!isConfigured()) {
        return { success: false, message: "Не заполнен CONFIG в js/storage.js" };
    }
    try {
        const res = await fetch(`${API}/repos/${CONFIG.owner}/${CONFIG.repo}`, {
            headers: headers(),
        });
        return res.ok
            ? { success: true }
            : { success: false, message: `GitHub: ${res.status}` };
    } catch (e) {
        return { success: false, message: "Нет соединения" };
    }
}

export async function loadSchema() {
    if (!isConfigured()) return { success: false, message: "Хранилище не настроено" };
    try {
        const res = await fetch(
            `${API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}`,
            { headers: headers() }
        );
        if (!res.ok) return { success: false, message: `Ошибка загрузки: ${res.status}` };
        const data = await res.json();
        const content = decodeURIComponent(
            atob(data.content)
                .split("")
                .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                .join("")
        );
        return { success: true, data: JSON.parse(content), sha: data.sha };
    } catch (e) {
        return { success: false, message: "Ошибка сети при загрузке" };
    }
}

export async function saveSchema(jsonData, options = {}) {
    if (!isConfigured()) return { success: false, message: "Хранилище не настроено" };
    const { sha } = options;
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(jsonData, null, 2))));
    try {
        let currentSha = sha;
        if (!currentSha) {
            const res = await fetch(
                `${API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}`,
                { headers: headers() }
            );
            if (res.ok) {
                const d = await res.json();
                currentSha = d.sha;
            }
        }
        const body = {
            message: "Обновление схемы (Schema Editor)",
            content,
        };
        if (currentSha) body.sha = currentSha;
        const res = await fetch(
            `${API}/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${CONFIG.path}`,
            { method: "PUT", headers: headers(), body: JSON.stringify(body) }
        );
        if (!res.ok) {
            return { success: false, message: `GitHub API: ${res.status} ${res.statusText}` };
        }
        const d = await res.json();
        return { success: true, sha: d.content.sha };
    } catch (e) {
        return { success: false, message: "Ошибка сети при сохранении" };
    }
}
