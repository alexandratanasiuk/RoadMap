@echo off
setlocal
chcp 65001 >nul

set "ROOT=e:\put-roadmap"
set "START_SCRIPT=%ROOT%\start-main-project-silent.bat"
set "STARTUP_DIR=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LAUNCHER=%STARTUP_DIR%\PUT-Roadmap-Autostart.cmd"

if not exist "%START_SCRIPT%" (
  echo [ERROR] Не найден %START_SCRIPT%
  exit /b 1
)

echo @echo off>"%LAUNCHER%"
echo start "" /min cmd /c ""%START_SCRIPT%"">>"%LAUNCHER%"

if exist "%LAUNCHER%" (
  echo [OK] Автозапуск установлен: %LAUNCHER%
  exit /b 0
)

echo [ERROR] Не удалось создать файл автозапуска.
exit /b 1
