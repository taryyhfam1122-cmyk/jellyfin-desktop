@echo off
setlocal
cd /d "%~dp0"
set "JFD_SURFACE_COMPAT=1"
echo Surface compatibility diagnostic v0.2 > "Surface-startup.log"
"Jellyfin Desktop.exe" --create-profile SurfaceCompat-v02 >> "Surface-startup.log" 2>&1
start "" /wait "Jellyfin Desktop.exe" --profile SurfaceCompat-v02 >> "Surface-startup.log" 2>&1
set "JFD_EXIT=%ERRORLEVEL%"
echo Exit code: %JFD_EXIT% >> "Surface-startup.log"
if not "%JFD_EXIT%"=="0" (
  echo Startup failed. Please send Surface-startup.log and the newest app log.
  pause
)
endlocal
