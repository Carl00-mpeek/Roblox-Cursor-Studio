@echo off
chcp 65001 >nul
title RBX Cursor Studio - Derleme
cd /d "%~dp0"
where dotnet >nul 2>nul
if errorlevel 1 (
    echo [HATA] .NET SDK bulunamadi. https://dotnet.microsoft.com/download adresinden kurup tekrar dene.
    start https://dotnet.microsoft.com/download
    pause
    exit /b 1
)
dotnet build RBXCursorStudio\RBXCursorStudio.csproj -c Release
if errorlevel 1 ( pause & exit /b 1 )
echo.
echo [OK] Hazir: RBXCursorStudio\bin\Release\net48\RBXCursorStudio.exe
start "" "RBXCursorStudio\bin\Release\net48"
pause
