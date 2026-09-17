# Schema Editor

Редактор схем на чистом JS и canvas для GitHub Pages. Хранит данные в Google Sheets.

## Страницы

| Файл | Назначение |
|------|---------|
| `index.html` | Публичная стартовая страница: две кнопки + горячие клавиши + переключатель темы |
| `login.html` | Только вход через Google; автоматически перенаправляет в редактор, если сессия существует |
| `editor.html` | Полный редактор (защищён сессией), панель инструментов, панель свойств |
| `view.html` | Публичный просмотрщик (только чтение), автообновление из Sheets через API-ключ |

## Архитектура

- `assets/js/config.js` — Google Client ID
- `assets/js/auth.js` — Google OAuth + сессия (`schema_editor_session` в localStorage)
- `assets/js/theme.js` — Светлая/тёмная тема (`schema_editor_theme` в localStorage)
- `assets/js/hotkeys.js` — Общий модуль горячих клавиш
- `assets/css/theme.css` — CSS-переменные для тем
- `assets/js/editor.js` — Canvas на Fabric.js, инструменты, сетка, фигуры, стрелки
- `assets/js/toolbar.js` — Панель свойств
- `assets/js/history.js` — Отмена/повтор (максимум 50 состояний)
- `assets/js/sheetlang.js` — Парсинг/сериализация SheetLang ↔ формат Google Sheets
- `assets/js/icons.js` — SVG-иконки
- `assets/js/editor-app.js` — Точка входа редактора: Google OAuth, синхронизация с Sheets (Pull/Push), горячие клавиши
- `assets/js/app.js` — Точка входа просмотрщика: только чтение, автообновление из Sheets через API-ключ

## Локальная разработка

```powershell
python -m http.server 8099
```

Откройте:
- http://localhost:8099/index.html
- http://localhost:8099/view.html
- http://localhost:8099/editor.html
- http://localhost:8099/login.html

## Хранение

- **Editor** (`editor-app.js`): OAuth-токен → `sheets.googleapis.com` (чтение/запись)
- **Viewer** (`app.js`): API-ключ → `sheets.googleapis.com` (только чтение, автообновление раз в 24 ч)
- Оба используют один и тот же `CONFIG.sheetsId`, указывающий на один Google Sheet

## Формат листа (SheetLang)

Одна строка = одна линия (`R:`, `D:`, `C:`, `L:`, `A:`, `T:`, `G:`)

```
R:x,y,w,h,fill,stroke,sw           Прямоугольник
D:x,y,w,h,fill,stroke,sw           Ромб (ограничивающий прямоугольник)
C:cx,cy,rx,ry,fill,stroke,sw       Круг/эллипс (центр)
L:x1,y1,x2,y2,stroke,sw            Линия
A:x1,y1,x2,y2,stroke,sw            Стрелка
T:x,y,fontSize,color,text          Текст (без запятых)
G:n1,n2,...                        Группа (номера строк с 1)
# ...                              Комментарий
```

Полная спецификация: `data/sheetlang-spec.md`

## Горячие клавиши

### Все страницы
| Клавиша | Действие |
|-----|--------|
| `V` | Открыть Viewer |
| `E` | Открыть Login (Editor) |
| `D` | Переключить тему |
| `?` / `H` | Показать справку по горячим клавишам |

### Только в редакторе
| Клавиша | Действие |
|-----|--------|
| `V` | Инструмент выделения |
| `R` | Прямоугольник |
| `D` | Ромб |
| `O` | Круг |
| `L` | Линия |
| `A` | Стрелка |
| `T` | Текст |
| `P` | Карандаш |
| `E` | Ластик |
| `H` / `Space` | Инструмент панорамирования |
| `Ctrl+G` | Группировать |
| `Ctrl+Shift+G` | Разгруппировать |
| `Ctrl+Z` / `Ctrl+Y` | Отменить / Повторить |
| `Ctrl+S` | Отправить в Sheets |
| `Del` | Удалить выбранное |
| `Esc` | Снять выделение |
| Wheel | Масштаб у курсора |
| Middle button / Space+LMB | Панорамирование |

## Тема

- Сохраняется в `localStorage.schema_editor_theme`
- Встроенный скрипт в `<head>` каждой страницы применяет тему до первой отрисовки (без мигания)
- CSS-переменные: `--bg`, `--text`, `--accent`, `--obj-stroke`, `--obj-fill`, `--obj-text`, `--pencil-color`
- `editor.js:updateObjectsForTheme()` перекрашивает существующие объекты canvas при смене темы

## Развёртывание

`.github/workflows/deploy.yml` — push в `main` → GitHub Pages. Без шагов сборки. Убедитесь, что весь HTML использует относительные пути (`assets/css/`, `assets/js/`, `view.html` и т.д.).
