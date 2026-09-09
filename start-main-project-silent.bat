@echo off
setlocal
chcp 65001 >nul

set "ROOT=e:\put-roadmap"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "RUNTIME_DIR=%ROOT%\.runtime"
set "BACKEND_PID=%RUNTIME_DIR%\backend.pid"
set "FRONTEND_PID=%RUNTIME_DIR%\frontend.pid"

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Не найден backend: %BACKEND_DIR%
  exit /b 1
)
if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Не найден frontend: %FRONTEND_DIR%
  exit /b 1
)
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

echo.
echo === PUT Roadmap: тихий запуск ===

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidPath='%BACKEND_PID%'; if (Test-Path $pidPath) { $oldPid=(Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1); if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { Write-Host '[INFO] Backend уже запущен'; exit 0 } }; $p=Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory '%BACKEND_DIR%' -WindowStyle Hidden -PassThru; Set-Content -Path $pidPath -Value $p.Id -Encoding Ascii; Write-Host ('[OK] Backend PID: ' + $p.Id)"

ping 127.0.0.1 -n 3 >nul

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidPath='%FRONTEND_PID%'; if (Test-Path $pidPath) { $oldPid=(Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1); if ($oldPid -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { Write-Host '[INFO] Frontend уже запущен'; exit 0 } }; $p=Start-Process -FilePath 'node.exe' -ArgumentList 'node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000 --strictPort' -WorkingDirectory '%FRONTEND_DIR%' -WindowStyle Hidden -PassThru; Set-Content -Path $pidPath -Value $p.Id -Encoding Ascii; Write-Host ('[OK] Frontend PID: ' + $p.Id)"

echo [OK] Тихий режим включен. UI: http://127.0.0.1:3000
echo.
exit /b 0
