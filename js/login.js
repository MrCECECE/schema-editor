import { login, setSession } from "./auth.js";

function init() {
    const demoBtn = document.getElementById("btn-demo");
    if (demoBtn) {
        demoBtn.addEventListener("click", () => {
            window.location.href = "editor.html";
        });
    }

    const form = document.getElementById("manual-login");
    if (form) {
        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const username = document.getElementById("username").value;
            const password = document.getElementById("password").value;
            const result = await login(username, password);
            if (result.success) {
                setSession({ email: username, role: result.user.role });
                window.location.href = "editor.html";
            } else {
                document.getElementById("error-msg").textContent = result.message;
            }
        });
    }

    const btnLight = document.getElementById("btn-theme-light");
    const btnDark = document.getElementById("btn-theme-dark");

    if (btnLight) {
        btnLight.addEventListener("click", () => {
            document.body.className = "theme-light";
            localStorage.setItem("schema-theme", "light");
        });
    }
    if (btnDark) {
        btnDark.addEventListener("click", () => {
            document.body.className = "theme-dark";
            localStorage.setItem("schema-theme", "dark");
        });
    }
}

init();
