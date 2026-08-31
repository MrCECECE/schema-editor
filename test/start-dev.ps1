# Запускает два сервера для локального тестирования:
#   1. Статический сервер приложения (http://localhost:8099)
#   2. Эмулятор GitHub API (http://localhost:9000)
#
# После запуска откройте в браузере:
#   http://localhost:8099/index.html?apiBase=http://localhost:9000&owner=testowner&repo=schema-editor&token=fake-token
#
# Использование:
#   powershell -ExecutionPolicy Bypass -File test/start-dev.ps1
#   powershell -ExecutionPolicy Bypass -File test/start-dev.ps1 -Stop

param(
    [int]$StaticPort = 8099,
    [int]$MockPort = 9000,
    [switch]$Stop
)

$Root = Split-Path -Parent $PSScriptRoot

if ($Stop) {
    Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*github-mock*" } | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like "*http.server*$StaticPort*" } | ForEach-Object { Stop-Process -Id $_.Id -Force }
    Write-Host "Серверы остановлены." -ForegroundColor Yellow
    exit
}

# Открываем новый терминал чтобы не блокировать текущий
Start-Process powershell -ArgumentList "-NoExit", "-Command", "python -m http.server $StaticPort --directory `"$Root`""
Start-Sleep -Seconds 1
Start-Process powershell -ArgumentList "-NoExit", "-Command", "node `"$Root\test\github-mock.js`" $MockPort testowner schema-editor"
Start-Sleep -Seconds 2

Write-Host "" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Статический сервер:   http://localhost:$StaticPort" -ForegroundColor White
Write-Host "  Mock GitHub API:       http://localhost:$MockPort" -ForegroundColor White
Write-Host ""
Write-Host "  Открой тестовый адрес:" -ForegroundColor Green
Write-Host "  http://localhost:$StaticPort/index.html?apiBase=http://localhost:$MockPort&owner=testowner&repo=schema-editor&token=fake-token" -ForegroundColor White
Write-Host ""
Write-Host "  Логин: admin / AdminPass!2026" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Чтобы остановить: powershell -ExecutionPolicy Bypass -File test/start-dev.ps1 -Stop" -ForegroundColor Yellow
