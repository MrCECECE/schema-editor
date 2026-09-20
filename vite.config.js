import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

// В ESM-модулях __dirname не существует — вычисляем его вручную.
const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
    // Относительные пути в собранном HTML.
    // Обязательно для GitHub Pages: сайт может лежать в подпапке.
    base: "./",

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