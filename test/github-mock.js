// Локальный эмулятор GitHub Contents API для тестирования без реального GitHub.
// Хранит содержимое файла в папке data-files.
//
// Запуск: node test/github-mock.js [порт] [owner] [repo]
// Пример: node test/github-mock.js 9000 serzh schema-editor

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = parseInt(process.argv[2] || "9000", 10);
const OWNER = process.argv[3] || "testowner";
const REPO = process.argv[4] || "schema-editor";
const FILE_PATH = "data/schema.json";
const STORAGE_DIR = path.join(__dirname, "data-files");
const STORAGE_FILE = path.join(STORAGE_DIR, FILE_PATH);

// "SHA" файла — просто хеш содержимого (эмуляция версионирования).
function shaOf(content) {
    const crypto = require("crypto");
    return crypto.createHash("sha1").update(content).digest("hex");
}

function ensureFile() {
    fs.mkdirSync(path.dirname(STORAGE_FILE), { recursive: true });
    if (!fs.existsSync(STORAGE_FILE)) {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify({ version: "1.0", objects: [], background: "#1a1a2e" }, null, 2));
    }
}

function readContent() {
    return fs.readFileSync(STORAGE_FILE, "utf8");
}

function send(res, code, obj) {
    const body = JSON.stringify(obj);
    res.writeHead(code, {
        "Content-Type": "application/json; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
    });
    res.end(body);
}

// Начальное содержимое с SHA
function initialState() {
    ensureFile();
    const content = readContent();
    return { content: content, sha: shaOf(content) };
}

let state = initialState();

const server = http.createServer((req, res) => {
    const url = req.url.split("?")[0];

    // CORS preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type, X-GitHub-Api-Version",
        });
        return res.end();
    }

    const m = url.match(/^\/repos\/([^/]+)\/([^/]+)\/contents\/(.+)$/);

    // GET /repos/{owner}/{repo} — проверка соединения
    if (url === `/repos/${OWNER}/${REPO}` && req.method === "GET") {
        return send(res, 200, { id: 1, full_name: `${OWNER}/${REPO}`, private: false });
    }

    if (!m) {
        return send(res, 404, { message: "Not Found" });
    }

    const [, owner, repo, filePath] = m;
    if (owner !== OWNER || repo !== REPO) {
        return send(res, 404, { message: "Not Found (нет прав на такой репозиторий)" });
    }

    // GET contents — возвращаем как GitHub (base64)
    if (req.method === "GET") {
        const content = readContent();
        const b64 = Buffer.from(content, "utf8").toString("base64");
        return send(res, 200, {
            name: path.basename(filePath),
            path: filePath,
            sha: shaOf(content),
            size: Buffer.byteLength(content),
            content: b64,
            encoding: "base64",
        });
    }

    // PUT contents — обновляем файл
    if (req.method === "PUT") {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
            let body;
            try {
                body = JSON.parse(raw);
            } catch (e) {
                return send(res, 400, { message: "Неверный JSON" });
            }

            const current = readContent();
            const currentSha = shaOf(current);

            // Если указан sha и он не совпадает — конфликт (как у реального GitHub)
            if (body.sha && body.sha !== currentSha) {
                return send(res, 409, { message: "SHA does not match" });
            }

            const decoded = Buffer.from(body.content, "base64").toString("utf8");
            fs.writeFileSync(STORAGE_FILE, decoded);
            const newSha = shaOf(decoded);
            state = { content: decoded, sha: newSha };

            return send(res, 200, {
                content: {
                    name: path.basename(filePath),
                    path: filePath,
                    sha: newSha,
                    size: Buffer.byteLength(decoded),
                    type: "file",
                },
            });
        });
        return;
    }

    return send(res, 405, { message: "Method Not Allowed" });
});

server.listen(PORT, () => {
    console.log(`GitHub API mock запущен: http://localhost:${PORT}`);
    console.log(`Репозиторий: ${OWNER}/${REPO}, файл: ${FILE_PATH}`);
    console.log(`Хранилище: ${STORAGE_FILE}`);
});
