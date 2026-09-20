import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

// В ESM-модулях __dirname не существует — вычисляем его вручную.
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    // Base path.
    //   - В dev: "./" (localhost, корень сервера).
    //   - В build: "/schema-editor/" (GitHub Pages, репозиторий в подпапке).
    // Иначе классические скрипты из public/ резолвятся в /assets/js/... и дают 404
    // на Pages, потому что сайт лежит в /schema-editor/.
    base: process.env.NODE_ENV === "production" ? "/schema-editor/" : "./",

    build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
            // MPA: каждая HTML-страница — отдельная точка входа.
            // Без этого Vite соберёт только index.html.
            input: {
                main:   resolve(__dirname, "index.html"),
                login:  resolve(__dirname, "login.html"),
                editor: resolve(__dirname, "editor.html"),
                view:   resolve(__dirname, "view.html"),
            },
        },
    },

    server: {
        port: 8099,
        strictPort: true,
    },
});