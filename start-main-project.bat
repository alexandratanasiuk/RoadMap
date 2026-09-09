@echo off
setlocal
chcp 65001 >nul

set "ROOT=e:\put-roadmap"
set "BACKEND_DIR=%ROOT%\backend"
set "FRONTEND_DIR=%ROOT%\frontend"
set "BACKEND_PORT=3011"
set "FRONTEND_PORT=3000"

echo.
echo === PUT Roadmap: запуск ===
echo ROOT: %ROOT%
echo.

if not exist "%BACKEND_DIR%\package.json" (
  echo [ERROR] Не найден backend: %BACKEND_DIR%
  exit /b 1
)
if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] Не найден frontend: %FRONTEND_DIR%
  exit /b 1
)

for %%P in (%BACKEND_PORT% %FRONTEND_PORT%) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
  if not errorlevel 1 (
    echo [WARN] Порт %%P уже занят. Проверь, не запущен ли уже проект.
  )
)

start "PUT-ROADMAP-BACKEND" /min cmd /k "cd /d "%BACKEND_DIR%" && title PUT-ROADMAP-BACKEND && npm run dev"
timeout /t 2 /nobreak >nul
start "PUT-ROADMAP-FRONTEND" /min cmd /k "cd /d "%FRONTEND_DIR%" && title PUT-ROADMAP-FRONTEND && npm run dev"

echo [OK] Backend:  http://127.0.0.1:%BACKEND_PORT%
echo [OK] Frontend: http://127.0.0.1:%FRONTEND_PORT%
echo.
exit /b 0
