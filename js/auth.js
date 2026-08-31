export const USERS = [
    { username: "admin", passwordHash: "184fd0cc708fa70d77b2613c1643e863a21bc8ee87226013976d3ca25ab43fc1", role: "editor" },
    { username: "user1", passwordHash: "08a6cdf7c5b129ef6255fcd71c1cfdbc3de9e04130d942b01f97cf54337cae67", role: "viewer" },
];

const SESSION_KEY = "schema_editor_user";

export async function hashPassword(password) {
    const data = new TextEncoder().encode(password);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

export async function login(username, password) {
    const user = USERS.find((u) => u.username.toLowerCase() === username.trim().toLowerCase());
    if (!user) return { success: false, message: "Пользователь не найден" };
    const hash = await hashPassword(password);
    if (hash !== user.passwordHash) return { success: false, message: "Неверный пароль" };
    return { success: true, user };
}

export function setSession(user) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ username: user.username, role: user.role }));
}

export function getSession() {
    try {
        return JSON.parse(sessionStorage.getItem(SESSION_KEY));
    } catch {
        return null;
    }
}

export function logout() {
    sessionStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated() {
    return !!getSession();
}

export function getUserRole(username) {
    const u = USERS.find((x) => x.username === username);
    return u ? u.role : "viewer";
}
