@echo off
setlocal
chcp 65001 >nul

set "ROOT=e:\put-roadmap"
set "RUNTIME_DIR=%ROOT%\.runtime"
set "BACKEND_PID_FILE=%RUNTIME_DIR%\backend.pid"
set "FRONTEND_PID_FILE=%RUNTIME_DIR%\frontend.pid"

echo.
echo === PUT Roadmap: остановка ===

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidPath='%BACKEND_PID_FILE%'; if (Test-Path $pidPath) { $procId=(Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1); if ($procId) { cmd /c ('taskkill /PID ' + $procId + ' /T /F >nul 2>&1'); Write-Host '[OK] Остановлен backend по PID'; Remove-Item $pidPath -Force -ErrorAction SilentlyContinue } else { Write-Host '[INFO] backend PID пуст' } } else { Write-Host '[INFO] backend PID-файл не найден' }"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$pidPath='%FRONTEND_PID_FILE%'; if (Test-Path $pidPath) { $procId=(Get-Content $pidPath -ErrorAction SilentlyContinue | Select-Object -First 1); if ($procId) { cmd /c ('taskkill /PID ' + $procId + ' /T /F >nul 2>&1'); Write-Host '[OK] Остановлен frontend по PID'; Remove-Item $pidPath -Force -ErrorAction SilentlyContinue } else { Write-Host '[INFO] frontend PID пуст' } } else { Write-Host '[INFO] frontend PID-файл не найден' }"

taskkill /FI "WINDOWTITLE eq PUT-ROADMAP-BACKEND*" /T /F >nul 2>&1
if errorlevel 1 (
  echo [INFO] Окно PUT-ROADMAP-BACKEND не найдено.
) else (
  echo [OK] Остановлен PUT-ROADMAP-BACKEND
)

taskkill /FI "WINDOWTITLE eq PUT-ROADMAP-FRONTEND*" /T /F >nul 2>&1
if errorlevel 1 (
  echo [INFO] Окно PUT-ROADMAP-FRONTEND не найдено.
) else (
  echo [OK] Остановлен PUT-ROADMAP-FRONTEND
)

for %%P in (3011 3000) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    taskkill /PID %%A /T /F >nul 2>&1
    if not errorlevel 1 echo [OK] Освобожден порт %%P (PID %%A)
  )
)

echo.
exit /b 0
