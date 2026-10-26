import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

// В ESM-модулях __dirname не существует — вычисляем его вручную.
const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Base path.
//   - На GitHub Actions задан GITHUB_REPOSITORY: сайт живёт в /<repo>/.
//   - Локально (dev и build) используем "./", чтобы dist открывался
//     из любой папки и форк не зависел от имени репозитория.
const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1];

export default defineConfig({
    base: repoName ? `/${repoName}/` : "./",

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