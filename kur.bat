@echo off
chcp 65001 >nul
title RBX Cursor Studio - Kurulum
color 0B

echo ================================================
echo   RBX Cursor Studio - Kurulum Baslatiliyor
echo ================================================
echo.

REM ---- Node.js kurulu mu kontrol et ----
where node >nul 2>nul
if errorlevel 1 (
    echo [HATA] Node.js bulunamadi!
    echo.
    echo Bu uygulamanin calismasi icin once Node.js kurmalisin.
    echo Indirmek icin tarayici aciliyor: https://nodejs.org
    echo Kurulumdan sonra bu dosyayi tekrar calistir.
    start https://nodejs.org/en/download
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODEVER=%%v
echo [OK] Node.js bulundu: %NODEVER%
echo.

REM ---- npm kurulu mu kontrol et ----
where npm >nul 2>nul
if errorlevel 1 (
    echo [HATA] npm bulunamadi. Node.js kurulumunu kontrol et.
    pause
    exit /b 1
)

REM ---- Script'in bulundugu klasore gec ----
cd /d "%~dp0"

echo [1/2] Bagimliliklar indiriliyor (npm install)...
echo       Bu islem internet hizina gore birkac dakika surebilir.
echo.
call npm install
if errorlevel 1 (
    echo.
    echo [HATA] npm install basarisiz oldu. Yukaridaki hata mesajina bak.
    pause
    exit /b 1
)

echo.
echo [2/2] Kurulum tamamlandi!
echo.
echo ================================================
echo   Uygulamayi baslatmak icin "baslat.bat" dosyasina
echo   cift tikla, ya da simdi baslatmak icin bir tusa bas.
echo ================================================
pause >nul

call npm start
