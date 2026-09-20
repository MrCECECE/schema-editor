# Schema Editor

Редактор схем на чистом JS и canvas для GitHub Pages. Хранит данные в Google Sheets.

## Страницы

| Файл          | Назначение                                                               |
|---------------|--------------------------------------------------------------------------|
| `index.html`  | Публичная стартовая страница: две кнопки + переключатель темы + хоткеи   |
| `login.html`  | Google OAuth вход. Если сессия есть — редирект на `editor.html`          |
| `editor.html` | Полный редактор (защищён сессией): toolbar, properties, Pull/Push        |
| `view.html`   | Публичный просмотрщик (read-only), автообновление из Sheets по API-ключу |

## Стек

- **Vanilla JS** + ES-модули
- **Fabric.js 5.3.0** — подключается с CDN на каждой странице
- **Vite 5** — dev-сервер (HMR) и сборка
- **Google Sheets API** — хранилище данных (OAuth для Editor, API-ключ для Viewer)
- **GitHub Actions** — деплой на GitHub Pages

## Структура

```
├── index.html, login.html, editor.html, view.html    ← точки входа (MPA)
│
├── assets/
│   ├── css/
│   │   └── screen.css                                ← все стили и темы
│   └── js/                                           ← ES-модули (собираются Vite)
│       ├── app.js                                    ← entry Viewer
│       ├── editor-app.js                             ← entry Editor
│       ├── editor.js                                 ← canvas, инструменты, сетка
│       ├── sheetlang.js                              ← parse/serialize SheetLang
│       ├── history.js                                ← undo/redo (50 снапшотов)
│       ├── toolbar.js                                ← панель свойств
│       └── icons.js                                  ← SVG-иконки
│
├── public/                                           ← копируется в dist/ как есть
│   └── assets/js/
│       ├── config.js                                 ← Google Client ID
│       ├── auth.js                                   ← Google OAuth + сессия
│       ├── theme.js                                  ← светлая/тёмная тема
│       └── hotkeys.js                                ← общий модуль хоткеев
│
├── data/
│   └── sheetlang-spec.md                             ← спецификация формата
│
├── .github/workflows/deploy.yml                      ← GitHub Actions: сборка + деплой
├── vite.config.js
├── package.json
└── README.md
```

**Почему два места для JS:** `assets/js/` — ES-модули (Vite их бандлит), `public/assets/js/` — классические скрипты,
которые подключаются через `<script src="...">` без `type="module"` и используют глобалы (`window.Theme`,
`window.Hotkeys`, `window.Auth`, `window.APP_CONFIG`). Vite копирует `public/` в `dist/` без обработки. В будущем (Фаза

4) они переедут в модули, и `public/` исчезнет.

## Локальная разработка

```powershell
npm install      # один раз
npm run dev      # dev-сервер с HMR на http://localhost:8099
```

Скрипты:

| Команда           | Что делает                                             |
|-------------------|--------------------------------------------------------|
| `npm run dev`     | Vite dev-сервер с hot module replacement               |
| `npm run build`   | Сборка в `dist/` (минификация, хеши)                   |
| `npm run preview` | Предпросмотр собранного сайта на http://localhost:4173 |

Страницы в dev-режиме:

- http://localhost:8099/index.html
- http://localhost:8099/view.html
- http://localhost:8099/login.html
- http://localhost:8099/editor.html

**Google OAuth на localhost:** добавь `http://localhost:8099` и `http://localhost:4173` в **Authorized JavaScript
origins** твоего OAuth-клиента в [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Иначе Google
заблокирует вход.

## Хранение

- **Editor** (`editor-app.js`): OAuth-токен → `sheets.googleapis.com` (чтение/запись)
- **Viewer** (`app.js`): API-ключ → `sheets.googleapis.com` (только чтение, автообновление раз в 24 ч)
- Оба используют один `CONFIG.sheetsId`

## Формат листа (SheetLang)

Одна строка = один объект. Подробнее — `data/sheetlang-spec.md`.

```
R:x,y,w,h,fill,stroke,sw           Прямоугольник
D:x,y,w,h,fill,stroke,sw           Ромб (bounding box)
C:cx,cy,rx,ry,fill,stroke,sw       Круг/эллипс (x,y — центр)
L:x1,y1,x2,y2,stroke,sw            Линия
A:x1,y1,x2,y2,stroke,sw            Стрелка
T:x,y,fontSize,color,text          Текст (без запятых)
G:n1,n2,...                        Группа (1-based номера строк листа)
# ...                              Комментарий
```

## Горячие клавиши

### Все страницы

| Клавиша   | Действие         |
|-----------|------------------|
| `D`       | Переключить тему |
| `?` / `H` | Показать справку |

### Только редактор

| Клавиша                           | Действие                                                     |
|-----------------------------------|--------------------------------------------------------------|
| `V` / `R` / `D` / `O` / `L` / `A` | Инструменты: select, rectangle, diamond, circle, line, arrow |
| `T` / `P` / `E`                   | Текст, карандаш, ластик                                      |
| `H` / `Space`                     | Рука (панорамирование)                                       |
| `Ctrl+G` / `Ctrl+Shift+G`         | Группировать / разгруппировать                               |
| `Ctrl+Z` / `Ctrl+Y`               | Undo / Redo                                                  |
| `Ctrl+S`                          | Push в Google Sheets                                         |
| `Del`                             | Удалить выделенное                                           |
| `Esc`                             | Снять выделение                                              |
| Колесо                            | Zoom вокруг курсора                                          |

## Тема

- Хранится в `localStorage.schema_editor_theme`
- Инлайн-скрипт в `<head>` каждой страницы применяет тему до первой отрисовки (без мигания)
- CSS-переменные: `--bg`, `--text`, `--accent`, `--obj-stroke`, `--obj-fill`, `--obj-text`, `--pencil-color`
- `editor.js:updateObjectsForTheme()` перекрашивает объекты canvas при смене темы

## Развёртывание

`.github/workflows/deploy.yml` — push в `main` → GitHub Actions:

1. `npm ci`
2. `npm run build` → собирает `dist/`
3. Публикует `dist/` на GitHub Pages через `actions/deploy-pages`

**Важно:** в репозитории **Settings → Pages → Source** должно быть выбрано **GitHub Actions**, а не
`Deploy from a branch`. Иначе Pages отдаёт содержимое ветки `main`, а не собранный артефакт, и классические скрипты из
`public/` дают 404.
