@echo off
chcp 65001 >nul
title RBX Cursor Studio
cd /d "%~dp0"

if not exist "node_modules" (
    echo [!] Once "kur.bat" dosyasini calistirman gerekiyor.
    echo     Bagimliliklar henuz kurulmamis.
    pause
    exit /b 1
)

call npm start
