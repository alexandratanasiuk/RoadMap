@echo off
setlocal
setlocal enabledelayedexpansion
chcp 65001 >nul

set "ROOT=e:\put-roadmap"
set "RUNTIME_DIR=%ROOT%\.runtime"
set "BACKEND_PID_FILE=%RUNTIME_DIR%\backend.pid"
set "FRONTEND_PID_FILE=%RUNTIME_DIR%\frontend.pid"
set "BACKEND_PORT=3011"
set "FRONTEND_PORT=3000"

echo.
echo === PUT Roadmap: статус ===
echo.

if exist "%BACKEND_PID_FILE%" (
  set /p BACKEND_PID=<"%BACKEND_PID_FILE%"
  if defined BACKEND_PID (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id !BACKEND_PID! -ErrorAction SilentlyContinue) { Write-Host '[OK] Backend процесс активен (PID !BACKEND_PID!)' } else { Write-Host '[WARN] Backend PID найден, но процесс не активен (PID !BACKEND_PID!)' }"
  ) else (
    echo [WARN] Backend PID-файл пуст.
  )
) else (
  echo [INFO] Backend PID-файл не найден.
)

if exist "%FRONTEND_PID_FILE%" (
  set /p FRONTEND_PID=<"%FRONTEND_PID_FILE%"
  if defined FRONTEND_PID (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Id !FRONTEND_PID! -ErrorAction SilentlyContinue) { Write-Host '[OK] Frontend процесс активен (PID !FRONTEND_PID!)' } else { Write-Host '[WARN] Frontend PID найден, но процесс не активен (PID !FRONTEND_PID!)' }"
  ) else (
    echo [WARN] Frontend PID-файл пуст.
  )
) else (
  echo [INFO] Frontend PID-файл не найден.
)

set "BACKEND_PORT_STATE=free"
set "BACKEND_PORT_PID="
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%BACKEND_PORT% .*LISTENING"') do (
  set "BACKEND_PORT_STATE=listening"
  set "BACKEND_PORT_PID=%%A"
  goto :backend_port_done
)
:backend_port_done

set "FRONTEND_PORT_STATE=free"
set "FRONTEND_PORT_PID="
for /f "tokens=5" %%A in ('netstat -ano ^| findstr /R /C:":%FRONTEND_PORT% .*LISTENING"') do (
  set "FRONTEND_PORT_STATE=listening"
  set "FRONTEND_PORT_PID=%%A"
  goto :frontend_port_done
)
:frontend_port_done

if /i "%BACKEND_PORT_STATE%"=="listening" (
  echo [OK] Порт %BACKEND_PORT% слушается ^(PID %BACKEND_PORT_PID%^)
) else (
  echo [INFO] Порт %BACKEND_PORT% свободен
)

if /i "%FRONTEND_PORT_STATE%"=="listening" (
  echo [OK] Порт %FRONTEND_PORT% слушается ^(PID %FRONTEND_PORT_PID%^)
) else (
  echo [INFO] Порт %FRONTEND_PORT% свободен
)

echo.
echo URL:
echo   Backend:  http://127.0.0.1:%BACKEND_PORT%
echo   Frontend: http://127.0.0.1:%FRONTEND_PORT%
echo.
exit /b 0
