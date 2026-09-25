@echo off
chcp 65001 >nul
title RBX Cursor Studio - EXE Paketleme
cd /d "%~dp0"

if not exist "node_modules" (
    echo [!] Once "kur.bat" dosyasini calistirip bagimliliklari kurman gerekiyor.
    pause
    exit /b 1
)

echo ================================================
echo   Hazirlik: eski dosyalar temizleniyor
echo ================================================
REM Uygulama acik kalmissa exe/dosyalar kilitli olur ve paketleme
REM "EBUSY / dosya kullanimda" hatasiyla basarisiz olur. Once kapatiyoruz.
taskkill /IM "RBX Cursor Studio.exe" /F >nul 2>nul
if exist "dist" (
    rd /s /q "dist" >nul 2>nul
)
echo.

echo ================================================
echo   .exe dosyasi olusturuluyor (electron-builder)
echo   Ilk calistirmada Electron/NSIS indirilecegi icin
echo   birkac dakika surebilir.
echo ================================================
echo.

call npm run dist
if errorlevel 1 (
    echo.
    echo ================================================
    echo   [HATA] Paketleme basarisiz oldu.
    echo ================================================
    echo   Yukaridaki kirmizi/hata metnini oku. Siklikla su nedenlerden
    echo   biri olur:
    echo.
    echo   1. "RBX Cursor Studio.exe" hala calisiyor olabilir.
    echo      Tum pencerelerini kapatip tekrar dene.
    echo   2. Antivirus / Windows Defender "dist" klasorunu kilitlemis
    echo      olabilir. Bir kere disardan izin verip tekrar dene.
    echo   3. Ilk paketlemede internet baglantisi gerekir (NSIS indirilir).
    echo   4. Bazi sistemlerde "Gelistirici Modu" kapaliysa sembolik link
    echo      hatasi alinabilir: Ayarlar - Gizlilik ve guvenlik -
    echo      Gelistiriciler icin - Gelistirici Modu'nu ac, tekrar dene.
    echo   5. "kur.bat" dosyasini tekrar calistirip bagimliliklari
    echo      guncellemeyi dene.
    echo.
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Tamamlandi! Kurulum dosyan "dist" klasorunde:
echo   dist\RBX-Cursor-Studio-Kurulum-<surum>.exe
echo ================================================
start "" "%~dp0dist"
pause
