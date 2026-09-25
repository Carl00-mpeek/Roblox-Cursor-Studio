@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo [RBX Cursor Studio] cursor_helper.exe derleniyor...

where g++ >nul 2>nul
if %ERRORLEVEL%==0 goto :have_gxx

where cl >nul 2>nul
if %ERRORLEVEL%==0 goto :have_cl

REM Ne g++ ne de cl bulunamadi. RBX_ALLOW_AUTO_INSTALL_COMPILER=1 ile
REM cagrildiysak (kur.bat/install.bat'in npm install sonrasi yaptigi gibi)
REM winget uzerinden MinGW-w64 (WinLibs) kurmayi dene. Bu bayrak olmadan
REM (or. uygulama ".ANI Sec" tiklandiginda arka planda kendi kendine
REM  tekrar denedigi zaman) internete cikip dakikalarca beklemeyiz.
if "%RBX_ALLOW_AUTO_INSTALL_COMPILER%"=="1" (
    where winget >nul 2>nul
    if !ERRORLEVEL!==0 (
        echo   - Derleyici bulunamadi. MinGW-w64 ^(WinLibs^) winget ile otomatik kuruluyor...
        echo     Internet hizina gore bu islem birkac dakika surebilir, lutfen bekle.
        winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT --accept-package-agreements --accept-source-agreements --disable-interactivity --silent
        if !ERRORLEVEL!==0 (
            echo   - WinLibs kuruldu, g++.exe araniyor...
            set "GXX_EXE="
            for /f "delims=" %%G in ('dir /s /b "%LOCALAPPDATA%\Microsoft\WinGet\Packages\g++.exe" 2^>nul') do (
                if not defined GXX_EXE set "GXX_EXE=%%G"
            )
            if defined GXX_EXE (
                echo   - Bulundu: !GXX_EXE!
                for %%D in ("!GXX_EXE!") do set "GXX_DIR=%%~dpD"
                set "PATH=!GXX_DIR!;%PATH%"
                where g++ >nul 2>nul
                if !ERRORLEVEL!==0 goto :have_gxx
            )
            echo   - g++.exe kurulum sonrasinda bulunamadi.
        ) else (
            echo   - winget kurulumu basarisiz oldu ^(kod !ERRORLEVEL!^).
        )
    ) else (
        echo   - winget bulunamadi, otomatik derleyici kurulumu atlaniyor.
    )
)

echo.
echo   HATA: Ne MinGW g++ ne de MSVC cl.exe bulunamadi ^(otomatik kurulum da basarisiz oldu ya da atlandi^).
echo   Cozum secenekleri:
echo     1) "winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT" komutunu elle calistirip
echo        derleyiciyi kurun, sonra "kur.bat" ya da bu betigi tekrar calistirin, ya da
echo     2) Visual Studio "Developer Command Prompt" icinden bu betigi calistirin.
goto :fail

:have_gxx
echo   - MinGW g++ bulundu, derleniyor...
g++ -std=c++17 -O2 -static -static-libgcc -static-libstdc++ ^
    cursor_helper.cpp -o cursor_helper.exe ^
    -luser32 -lgdi32 -lwinmm
if %ERRORLEVEL%==0 (
    echo   - Basarili: native\cursor_helper.exe
    goto :done
) else (
    echo   - g++ derlemesi basarisiz oldu.
    where cl >nul 2>nul
    if !ERRORLEVEL!==0 goto :have_cl
    goto :fail
)

:have_cl
echo   - MSVC cl.exe bulundu, derleniyor...
cl /nologo /std:c++17 /O2 /EHsc /DUNICODE /D_UNICODE ^
    cursor_helper.cpp /Fe:cursor_helper.exe ^
    /link user32.lib gdi32.lib winmm.lib
if %ERRORLEVEL%==0 (
    echo   - Basarili: native\cursor_helper.exe
    goto :done
) else (
    echo   - MSVC derlemesi de basarisiz oldu.
    goto :fail
)

:done
del *.obj >nul 2>nul
echo.
echo Bitti. cursor_helper.exe artik main\ tarafindan otomatik baslatilacak.
exit /b 0

:fail
exit /b 1
