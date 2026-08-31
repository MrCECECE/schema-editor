# Schema Editor — Подробный план проекта

## Обзор

Canvas-редактор блок-схем, хостящийся бесплатно на GitHub Pages 24/7.
Любой может просматравать схемы, только авторизованные пользователи — редактировать.
Данные хранятся в JSON-файле в репозитории, обновляются через GitHub API.

---

## Стек технологий

| Компонент       | Технология                                      |
|-----------------|-------------------------------------------------|
| Хостинг         | GitHub Pages (бесплатно, HTTPS, кастомный домен) |
| Canvas-движок   | Fabric.js v6 (CDN)                              |
| Стили           | Чистый CSS, CSS Variables для тем                |
| Язык            | Vanilla JavaScript (ES Modules)                 |
| Хранение данных | GitHub Contents API (JSON в репозитории)        |
| Авторизация     | Список логинов + SHA-256 хеши паролей           |
| Иконки          | SVG-иконки (inline или файлы)                   |

---

## Структура файлов

```
schema-editor/
├── index.html              # Единая страница: логин + редактор
├── PLAN.md                 # Этот файл
├── css/
│   └── style.css           # Все стили приложения
├── js/
│   ├── app.js              # Точка входа, роутинг, глобальное состояние
│   ├── auth.js             # Авторизация (проверка логина/пароля)
│   ├── editor.js           # Fabric.js canvas: инструменты, события
│   ├── storage.js          # GitHub API: загрузка/сохранение schema.json
│   ├── toolbar.js          # Логика тулбара (выбор инструмента, свойства)
│   └── history.js          # Undo/Redo (стек состояний)
├── assets/
│   └── icons/              # SVG-иконки для кнопок тулбара
└── data/
    └── schema.json         # Файл схемы в репозитории (создаётся вручную или через API)
```

---

## Детальное описание модулей

### 1. index.html

Единая точка входа. Содержит:

- **Экран логина** (`#login-screen`): форма ввода логина и пароля, кнопка "Войти"
- **Экран редактора** (`#editor-screen`):
  - Верхняя панель: название файла, кнопки Сохранить / Загрузить / Экспорт PNG / Экспорт SVG
  - Левая панель (тулбар): инструменты рисования
  - Центр: холст Fabric.js
  - Правая панель (свойства): цвет заливки, обводки, ширина линии, шрифт текста
  - Нижняя панель: зум, координаты курсора, статус сохранения

Подключение скриптов через `<script type="module">`.

### 2. css/style.css

- CSS Variables для цветовой схемы (легко менять тему)
- Тёмная тема по умолчанию (удобна для работы с canvas)
- Адаптивная вёрстка (min-width: 768px для десктопа)
- Стили для: логин-экрана, тулбара, панели свойств, холста, модальных окон
- Анимации для кнопок и переходов

### 3. js/app.js — Точка входа

```javascript
// Глобальное состояние приложения
const AppState = {
    mode: 'view',           // 'view' | 'edit'
    currentUser: null,      // { username, hash }
    canvas: null,           // Fabric.js Canvas instance
    isDirty: false,         // Есть несохранённые изменения
    autoSaveTimer: null,    // Таймер автосохранения
};
```

Логика:
1. При загрузке: проверить sessionStorage → если токен есть, сразу в редактор
2. Если нет → показать логин-экран
3. После логина → скрыть логин, показать редактор, загрузить схему с GitHub
4. Регистрация горячих клавиш: Ctrl+S (сохранить), Ctrl+Z (undo), Ctrl+Y (redo)

### 4. js/auth.js — Авторизация

**Список пользователей** (захардкожен в `js/auth.js`):
```javascript
const USERS = [
    { username: "admin", passwordHash: "184fd0...fc1", role: "editor" },  // пароль по умолчанию: AdminPass!2026
    { username: "user1", passwordHash: "08a6cd...e67", role: "viewer" },  // пароль по умолчанию: SchemaUser2026
];
```
> ⚠️ Обязательно смените пароли по умолчанию перед публикацией!

Для смены пароля замените хеш. Сгенерировать SHA-256:
```powershell
$sha=[System.Security.Cryptography.SHA256]::Create()
($sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes("новый_пароль")) | ForEach-Object {$_.ToString("x2")}) -join ""
```

Функции:
- `hashPassword(password)` → SHA-256 хеш через `crypto.subtle.digest`
- `login(username, password)` → проверка в списке USERS
- `logout()` → очистка sessionStorage
- `isAuthenticated()` → проверка текущей сессии
- `getUserRole(username)` → 'editor' | 'viewer'

### 5. js/editor.js — Canvas-редактор

**Инициализация:**
```javascript
const canvas = new fabric.Canvas('schema-canvas', {
    backgroundColor: '#1a1a2e',
    selection: true,
    preserveObjectStacking: true,
});
```

**Инструменты (тулбар):**

| Инструмент  | Описание                                      | Fabric.js                     |
|-------------|-----------------------------------------------|-------------------------------|
| Select      | Выбор и перемещение объектов (по умолчанию)    | `canvas.selection = true`     |
| Rectangle   | Прямоугольник (для блоков схемы)               | `new fabric.Rect()`           |
| Diamond     | Ромба (для условий)                            | `new fabric.Rect({angle:45})` |
| Circle      | Круг/овал                                     | `new fabric.Ellipse()`        |
| Arrow       | Стрелка (линия + треугольник)                  | `new fabric.Line()` + groups  |
| Line        | Линия                                         | `new fabric.Line()`           |
| Text        | Текст                                         | `new fabric.IText()`          |
| Pencil      | Свободное рисование (карандаш)                 | `canvas.freeDrawingBrush`     |
| Eraser      | Ластик (удаление объектов под курсором)         | Кастомная логика              |
| Group       | Группировка выбранных объектов                  | `fabric.Group`                |
| Ungroup     | Разгруппировка                                 | `group.toActiveSelection()`   |

**Сетка (Snap-to-grid):**
- Шаг: 20px
- При перетаскивании объекта: `Math.round(obj.left / gridSize) * gridSize`
- Визуальная сетка: рисуется как фон через `canvas.setBackgroundColor` с паттерном

**Свойства объектов** (правая панель при выделении):
- Fill color (цвет заливки)
- Stroke color (цвет обводки)
- Stroke width (толщина обводки)
- Font size (для текста)
- Opacity (прозрачность)
- Angle (поворот)
- Locked (заблокировать от редактирования)

**События canvas:**
- `object:added` → пометить `isDirty = true`
- `object:modified` → пометить `isDirty = true`
- `object:removed` → пометить `isDirty = true`
- `mouse:move` → обновить координаты в статус-баре

### 6. js/history.js — Undo/Redo

**Подход:** Snapshots (сериализация состояния canvas в JSON).

```javascript
const History = {
    stack: [],         // Массив JSON-состояний
    currentIndex: -1,  // Текущая позиция в стеке
    maxSize: 50,       // Максимум шагов
};
```

Функции:
- `saveState()` — сериализовать canvas → `canvas.toJSON()`, добавить в стек, обрезать newIndex+1
- `undo()` — `currentIndex--`, `canvas.loadFromJSON(stack[currentIndex])`
- `redo()` — `currentIndex++`, `canvas.loadFromJSON(stack[currentIndex])`
- Вызывать `saveState()` после каждого завершённого действия (mouse:up на объекте)

### 7. js/storage.js — GitHub API

**Конфигурация** (пользователь должен заполнить):
```javascript
const CONFIG = {
    owner: 'ВАШ_LITHUB_USERNAME',
    repo: 'schema-editor',
    path: 'data/schema.json',
    token: 'ghp_ВАШ_PAT_ТОКЕН',   // PAT с правами repo
};
```

**Функции:**

```javascript
async function loadSchema() {
    // GET /repos/{owner}/{repo}/contents/{path}
    // → декодировать base64 content → JSON.parse → canvas.loadFromJSON
}

async function saveSchema() {
    // Сначала GET для получения current SHA (нужен для обновления)
    // PUT /repos/{owner}/{repo}/contents/{path}
    // body: { message, content: btoa(JSON), sha }
}

async function checkConnection() {
    // GET /repos/{owner}/{repo} → проверить доступ
}
```

**Автосохранение:**
- Таймер каждые 30 секунд, если `isDirty === true`
- Дебаунс 2 секунды после последнего изменения
- При сохранении: показать индикатор "Сохраняется..." → "Сохранено ✓"
- При ошибке: показать "Ошибка сохранения" + retry через 5 сек

### 8. js/toolbar.js — Тулбар

- Управление состоянием активного инструмента
- Переключение курсора при смене инструмента
- Обновление панели свойств при выделении объекта
- Группировка кнопок: основные инструменты / фигуры / рисование / вид

---

## Порядок реализации (шаги)

### Шаг 1: Базовая структура
- [x] Создать `index.html` с разметкой (логин-экран + экран редактора)
- [x] Создать `css/style.css` с базовыми стилями и тёмной темой
- [x] Подключить Fabric.js через CDN в `index.html`

### Шаг 2: Авторизация
- [x] Реализовать `js/auth.js` (список пользователей, хеширование, проверка)
- [x] Реализовать логин-экран в HTML
- [x] Подключить к `js/app.js`

### Шаг 3: Canvas-редактор
- [x] Инициализация Fabric.js canvas в `js/editor.js`
- [x] Инструмент Select (выбор, перемещение, resize)
- [x] Инструмент Rectangle, Diamond, Circle, Line
- [x] Инструмент Text (редактируемый текст)
- [x] Инструмент Pencil (свободное рисование)
- [x] Инструмент Arrow (линия с наконечником)
- [x] Snap-to-grid
- [x] Визуальная сетка

### Шаг 4: Панель свойств
- [x] Цвет заливки (color picker)
- [x] Цвет обводки
- [x] Толщина обводки
- [x] Шрифт и размер текста
- [x] Прозрачность

### Шаг 5: Undo/Redo
- [x] Реализовать `js/history.js`
- [x] Подключить к событиям canvas
- [x] Горячие клавиши Ctrl+Z / Ctrl+Y

### Шаг 6: Сохранение через GitHub API
- [x] Реализовать `js/storage.js` (load, save, checkConnection)
- [x] Автосохранение по таймеру
- [x] Ручное сохранение (Ctrl+S)
- [x] Индикатор статуса сохранения

### Шаг 7: Экспорт
- [x] Экспорт в PNG (`canvas.toDataURL('png')`)
- [x] Экспорт в SVG (`canvas.toSVG()`)
- [x] Кнопки экспорта в UI

### Шаг 8: Финализация
- [x] Группировка/разгруппировка объектов
- [x] Ластик (удаление объектов)
- [x] Горячие клавиши (Delete для удаления, Escape для сброса выделения)
- [x] Тестирование всех функций
- [x] Оптимизация производительности

---

## Настройка GitHub

1. Создать репозиторий `schema-editor` на GitHub
2. Включить GitHub Pages (Settings → Pages → main branch)
3. Создать Personal Access Token:
   - GitHub Settings → Developer settings → Fine-grained tokens
   - Scope: `Contents: Read and Write` на репозиторий `schema-editor`
4. Заполнить `CONFIG` в `storage.js` (owner, repo, token)
5. Создать файл `data/schema.json` в репозитории со стартовым содержимым:
   ```json
   {
     "version": "1.0",
     "objects": [],
     "background": "#1a1a2e"
   }
   ```

---

## Локальное тестирование (эмулятор GitHub)

Чтобы проверить загрузку/сохранение без реального GitHub, есть `test/github-mock.js` — локальный эмулятор GitHub Contents API. Он хранит `schema.json` в папке `test/data-files/`.

**Запуск обоих серверов одной командой:**
```powershell
powershell -ExecutionPolicy Bypass -File test/start-dev.ps1
```

Затем открыть в браузере:
```
http://localhost:8099/index.html?apiBase=http://localhost:9000&owner=testowner&repo=schema-editor&token=fake-token
```
- Логин: `admin` / `AdminPass!2026` (редактор)

**Остановить:**
```powershell
powershell -ExecutionPolicy Bypass -File test/start-dev.ps1 -Stop
```

**Как это работает:**
- `js/storage.js` принимает переопределения конфига через URL-параметры: `apiBase`, `owner`, `repo`, `token`
- Если `apiBase` задан — запросы идут на эмулятор вместо `api.github.com`
- Эмулятор (порт 9000) реализует GET/PUT `/repos/{owner}/{repo}/contents/{path}` и проверку соединения, с корректным SHA-версионированием и CORS

**Гибкость:** в `js/storage.js` можно задать `apiBase` прямо в `CONFIG`, тогда URL-параметры не нужны (удобно, если эмулятор всегда включён).

---

## Безопасность

- **Пароли** хранятся как SHA-256 хеши (никогда в открытом виде)
- **PAT-токен** в клиентском коде — ограничение статического хостинга. Для личного проекта допустимо. Для публичного проекта нужен прокси (Cloudflare Worker)
- **Сессия** хранится в `sessionStorage` (очищается при закрытии вкладки)
- Редакторы — только захардкоженные пользователи, нельзя "зарегистрироваться"

---

## Ограничения и будущее

**Текущие ограничения:**
- PAT-токен виден в исходном коде (для GitHub Pages это неизбежно без бэкенда)
- Один человек редактирует в один момент (нет operational transform)
- Максимум 50 шагов undo

**Возможные улучшения:**
- Реалтайм-синхронизация через WebSocket (нужен сервер)
- Экспорт в Mermaid/PlantUML формат
- Импорт схем из других форматов
- Тёмная/светлая тема
- Масштабирование колесом мыши
- Миникарта в углу холста
