@echo off
chcp 65001 >nul
title 🚀 Путь - Установка и запуск
color 0A

:start
cls
echo.
echo   ╔═══════════════════════════════════════════════════════╗
echo   ║                                                       ║
echo   ║      ⚡ ПУТЬ - УСТАНОВКА И ЗАПУСК ПРОЕКТА ⚡          ║
echo   ║                                                       ║
echo   ╚═══════════════════════════════════════════════════════╝
echo.

:: Проверка Node.js
node --version >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js не установлен!
    echo.
    echo Скачай и установи Node.js с сайта:
    echo https://nodejs.org/
    echo.
    echo После установки запусти этот файл снова.
    echo.
    pause
    exit
)

:: Показываем версии
echo ✅ Node.js: 
node --version
echo ✅ npm: 
call npm --version
echo.

:: Установка бэкенда
echo 📦 Установка зависимостей бэкенда...
cd backend
if exist "node_modules" (
    echo    ✅ Бэкенд: зависимости уже установлены
) else (
    echo    ⏳ Установка... (это может занять несколько минут)
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки бэкенда
        pause
        exit
    )
    echo    ✅ Бэкенд: зависимости установлены
)
cd ..

echo.

:: Установка фронтенда
echo 📦 Установка зависимостей фронтенда...
cd frontend

:: Проверяем наличие vue-virtual-scroller
if exist "node_modules\vue-virtual-scroller" (
    echo    ✅ vue-virtual-scroller уже установлен
) else (
    echo    ⏳ Установка vue-virtual-scroller...
    call npm install vue-virtual-scroller --save
)

if exist "node_modules" (
    echo    ✅ Фронтенд: зависимости уже установлены
) else (
    echo    ⏳ Установка всех зависимостей... (это может занять несколько минут)
    call npm install
    if %errorlevel% neq 0 (
        echo ❌ Ошибка установки фронтенда
        pause
        exit
    )
    echo    ✅ Фронтенд: зависимости установлены
)
cd ..

echo.
echo ===============================================
echo 🚀 ЗАПУСК ПРОЕКТА...
echo ===============================================
echo.

:: Запуск бэкенда
start "Путь - Бэкенд" cmd /k "cd backend && title Путь - Бэкенд && echo. && echo ✅ Бэкенд запущен && echo 📁 http://localhost:3001 && echo. && npm run dev"

timeout /t 2 /nobreak >nul

:: Запуск фронтенда
start "Путь - Фронтенд" cmd /k "cd frontend && title Путь - Фронтенд && echo. && echo ✅ Фронтенд запущен && echo 🌐 http://localhost:5173 && echo. && npm run dev"

echo.
echo ✅ ПРОЕКТ ЗАПУЩЕН!
echo.
echo 📁 Бэкенд: http://localhost:3001
echo 🌐 Фронтенд: http://localhost:5173
echo.
echo ⏳ Подожди немного, серверы запускаются...
echo.
echo ❌ Для остановки закрой все окна терминалов
echo.
pause