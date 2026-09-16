# TODO.md — Lore Board Project

## Архитектура

```
Google Sheets (только редакторы)
       │
       ├── GET /v4/spreadsheets/{ID}/values/Sheet1?key=API_KEY (viewer, публичный)
       └── GET/PUT /v4/spreadsheets/{ID}/values/Sheet1 + Bearer OAuth (editor)
       │
       ▼
GitHub Pages Viewer (no auth, 24h refresh)    Editor (Google auth)
```

**Без Apps Script. Без верификации Google. Прямое обращение к Google Sheets API v4.**

## Файлы

### Используются
| Файл | Назначение |
|------|------------|
| `js/editor.js` | Fabric.js canvas, tools, grid, shapes, arrows |
| `js/toolbar.js` | Property panel (только editor.html) |
| `js/history.js` | Undo/redo через canvas.toJSON() |
| `js/icons.js` | SVG icons for toolbar buttons |
| `js/auth.js` | Google auth session (только editor.html) |
| `js/sheetlang.js` | Парсер/энкодер SheetLang + renderOnCanvas |
| `js/app.js` | Viewer логика (Sheets API GET + render + 24h refresh) |
| `js/editor-app.js` | Editor логика (Google Sign-In + Sheets API read/write) |
| `css/style.css` | Все стили |
| `data/schema.json` | Stub fallback |

### Новые
| Файл | Назначение |
|------|------------|
| `data/sheetlang-spec.md` | SheetLang спецификация |
| `index.html` | Viewer страница |
| `editor.html` | Editor страница с Google Sign-In |
| `.github/workflows/deploy.yml` | Auto-deploy на GitHub Pages |
| `TODO.md` | Этот файл |

### Удалены
| Файл | Причина |
|------|---------|
| `js/storage.js` | Cloudflare KV — удалён полностью |
| `worker/` | Cloudflare Worker — удалён полностью |
| `apps-script/` | Не нужен — используем Sheets API напрямую |

## SheetLang спецификация

```
TYPE:param1,param2,...

R:x,y,w,h,fill,stroke,strokeWidth   Прямоугольник
D:x,y,w,h,fill,stroke,strokeWidth   Ромб
C:x,y,rx,ry,fill,stroke,strokeWidth Круг/эллипс (x,y — центр)
L:x1,y1,x2,y2,stroke,strokeWidth    Линия
A:x1,y1,x2,y2,stroke,strokeWidth    Стрелка
T:x,y,fontSize,color,text           Текст (запятые не допускаются)
G:line1,line2,...                   Группировка (1-based номера строк)
#                                   Комментарий
```

## Google Sheets структура

- Sheet1, Column A: каждая ячейка = одна строка SheetLang
- Комментарии и пустые строки допустимы (парсер пропускает)

## Google Cloud Setup (один проект)

1. [console.cloud.google.com](https://console.cloud.google.com) → Create Project
2. Enable API: **Google Sheets API v4**
3. **API Key** (для viewer — read-only):
   - Credentials → Create Credentials → API Key
   - Restrict: Google Sheets API only
   - Put in `CONFIG.apiKey` in `js/app.js`
4. **OAuth 2.0 Client ID** (для editor):
   - Credentials → Create Credentials → OAuth 2.0 Client ID → Web Application
   - Authorized JavaScript Origins: `https://mrcecece.github.io`
   - Put in `CONFIG.googleClientId` in `js/editor-app.js`

## Viewer flow (index.html)

1. Открыть `index.html`
2. Fetch `https://sheets.googleapis.com/v4/spreadsheets/{sheetsId}/values/Sheet1?key={apiKey}`
3. Parse response values → SheetLang lines
4. Parse SheetLang → Fabric.js objects
5. Render on canvas (1000x700, grid on)
6. Set 24h timer → re-fetch and re-render
7. Status bar показывает "Updated • X мин назад"

## Editor flow (editor.html)

1. Открыть `editor.html`
2. Google Sign-In (Google Identity Services, scope: Sheets API)
3. Кнопка "Pull" → `GET /v4/spreadsheets/{ID}/values/Sheet1` + Bearer token → render на canvas
4. Редактировать (toolbar + properties panel + hotkeys)
5. Кнопка "Push" → encode SheetLang → `PUT /v4/spreadsheets/{ID}/values/Sheet1!A1:A1000?valueInputOption=RAW` + Bearer token
6. Ctrl+S → Push to Sheets
7. Sign Out → clear session, show Sign-In button

## TODO checklist

### Foundation ✅
- [x] `data/sheetlang-spec.md` — спецификация языка
- [x] `js/sheetlang.js` — парсер, энкодер, рендер SheetLang
- [x] `js/editor.js` — добавлен shapeType: "diamond" для diamond encoding

### Viewer ✅
- [x] `index.html` — viewer страница (no auth, no editor tools)
- [x] `js/app.js` — viewer логика (Sheets API GET, parse, render, 24h refresh)
- [x] CSS добавлен (.google-user, .google-signin)

### Editor ✅
- [x] `editor.html` — editor страница с Google Sign-In
- [x] `js/editor-app.js` — Google auth, Sheets API Pull/Push, hotkeys

### Deployment ✅
- [x] `.github/workflows/deploy.yml` — auto-deploy на GitHub Pages
- [x] Cloudflare Worker удалён полностью
- [x] `js/storage.js` удалён полностью
- [x] Apps Script удалён (заменён на прямой Sheets API)

### Done (сделано)
- [x] Cloudflare Worker удалён полностью
- [x] `js/storage.js` удалён полностью
- [x] Apps Script удалён (заменён на прямой Sheets API)
- [x] Sheet ID твоей таблицы вставлен в `CONFIG.sheetsId` (`js/app.js` и `js/editor-app.js`)
- [x] Таблица: `https://docs.google.com/spreadsheets/d/1e3ut8uuhbwHS0ZpZL-VWvP886mBXwgFUzSRrjkQS15k/edit?usp=drive_link`

### Pending (что осталось сделать тебе)
- [ ] **Шаг 1:** Создать Google Cloud проект, включить Google Sheets API v4
- [ ] **Шаг 2:** Создать API Key (read-only, restricted to Sheets API) → `CONFIG.apiKey` (js/app.js)
- [ ] **Шаг 3:** Создать OAuth Client ID (Web App, JS origin: github.io) → `CONFIG.googleClientId` (js/editor-app.js)
- [ ] **Шаг 4:** Поделиться Google Sheet с редакторами (editor access)
- [ ] **Шаг 5:** Push на GitHub main → Actions деплоит на Pages
- [ ] **Шаг 6:** Открыть `https://mrcecece.github.io/schema-editor/` — viewer
- [ ] **Шаг 7:** Открыть `https://mrcecece.github.io/schema-editor/editor.html` — editor

---

## Детальная инструкция

### Шаг 1: Google Cloud проект

1. Открой https://console.cloud.google.com
2. Нажми **Create Project** (верхняя панель)
3. Назови как угодно, например `schema-editor`
4. После создания выбери проект в выпадающем списке сверху
5. В меню слева: **APIs & Services → Library**
6. Найди **Google Sheets API** → нажми **Enable**

### Шаг 2: API Key (для вьюера)

1. **APIs & Services → Credentials**
2. **Create Credentials → API Key**
3. В появившемся окне нажми **Restrict Key**
4. В **API restrictions** выбери **Restrict key**
5. В списке API выбери **Google Sheets API**
6. Нажми **Save**
7. Скопируй ключ (начинается с `AIza...`)
8. Вставь в `js/app.js` → `CONFIG.apiKey: "твой_ключ"`

### Шаг 3: OAuth Client ID (для редактора)

1. **APIs & Services → Credentials**
2. **Create Credentials → OAuth client ID**
3. Если просит настроить **OAuth consent screen** — пройди (тип External, имя любое)
4. Тип приложения: **Web application**
5. В **Authorized JavaScript origins** добавь:
   - `https://mrcecece.github.io`
6. Нажми **Create**
7. Скопируй **Client ID** (заканчивается на `.apps.googleusercontent.com`)
8. Вставь в `js/editor-app.js` → `CONFIG.googleClientId: "твой_client_id"`

### Шаг 4: Доступ к таблице

1. Открой свою таблицу
2. Нажми **Share** (верхний правый угол)
3. В **General access** выбери **Anyone with the link** → **Viewer** (чтобы вьюер мог читать)
4. Нажми **Done**
5. Для редакторов: в поле **Add people** введи их Google-почты → права **Editor**

### Шаг 5: Деплой

1. `git add .`
2. `git commit -m "connect google sheets"`
3. `git push origin main`
4. GitHub Actions автоматически деплоит на Pages

### Шаг 6: Проверка

1. Открой `https://mrcecece.github.io/schema-editor/`
2. Если таблица пустая — ничего не увидишь, это нормально
3. Открой `https://mrcecece.github.io/schema-editor/editor.html`
4. Нажми **Sign in with Google**
5. Авторизуйся
6. Нажми **Pull** — должно загрузить данные из таблицы

### Шаг 7: Как пользоваться

**Редактор:**
- Открой `editor.html`
- Sign in with Google
- Pull (загрузить из Sheets)
- Рисуй/редактируй
- Push (или Ctrl+S) — сохранить в Sheets

**Вьюер:**
- Просто открой `index.html`
- Данные подгружаются автоматически
- Обновление каждые 24 часа

### Формат данных в таблице

В ячейки столбца A вставляй SheetLang-строки, по одной на ячейку:

```
R:100,200,80,60,#4a90d9,#ffffff,2
C:500,200,40,40,#e74c3c,#ffffff,2
T:150,400,24,#ffffff,Chapter 1
```

Типы: `R` прямоугольник, `D` ромб, `C` круг, `L` линия, `A` стрелка, `T` текст, `G` группа, `#` комментарий.
