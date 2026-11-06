@echo off
setlocal
cd /d "%~dp0"
title Jellyfin C02 B-2STAGE launcher
echo ===================================================
echo    JELLYFIN C02 B-2STAGE - Desktop x64
echo    Launching ONLY the application in this folder.
echo ===================================================
echo.
if not exist "JellyfinSurfaceX64.dll" (
    echo ERROR: Missing JellyfinSurfaceX64.dll.
    echo Please EXTRACT ALL files from the zip first.
    pause
    exit /b 2
)
tasklist /FI "IMAGENAME eq JellyfinSurfaceX64.exe" 2>NUL | find /I "JellyfinSurfaceX64.exe" >NUL
if not errorlevel 1 (
    echo Another C02 is already running.
    echo Close all older C02 windows before launching this version.
    echo Press any key AFTER closing all C02 windows.
    pause >NUL
)
start "" /D "%~dp0" "%~dp0JellyfinSurfaceX64.exe"
exit /b
