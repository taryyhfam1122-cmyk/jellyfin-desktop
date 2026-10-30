@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Fallback: software OpenGL but keep JS JIT enabled.
set "JFD_SURFACE_COMPAT="
set "QV4_FORCE_INTERPRETER="
set "QML_DISABLE_DISK_CACHE="
set "QT_OPENGL=software"
set "QTWEBENGINE_CHROMIUM_FLAGS=--disable-gpu"
echo Surface Balanced mode (software GPU, JIT enabled) > "SurfaceBalanced-startup.log"
"Jellyfin Desktop.exe" --create-profile SurfaceBalanced-v01 >> "SurfaceBalanced-startup.log" 2>&1
start "" /wait "Jellyfin Desktop.exe" --profile SurfaceBalanced-v01 >> "SurfaceBalanced-startup.log" 2>&1
set "JFD_EXIT=%ERRORLEVEL%"
echo Exit code: %JFD_EXIT% >> "SurfaceBalanced-startup.log"
if not "%JFD_EXIT%"=="0" (
  echo Surface Balanced exited with code %JFD_EXIT%.
  echo Use original Start-SurfaceCompat.cmd as last resort.
  echo Please send SurfaceBalanced-startup.log if startup fails.
  pause
)
endlocal
