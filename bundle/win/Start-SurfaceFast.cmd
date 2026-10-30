@echo off
setlocal EnableExtensions
cd /d "%~dp0"
rem Surface Pro Windows ARM64 speed test: GPU + V8/QML JIT enabled.
set "JFD_SURFACE_COMPAT="
set "QV4_FORCE_INTERPRETER="
set "QML_DISABLE_DISK_CACHE="
set "QT_OPENGL="
set "QTWEBENGINE_CHROMIUM_FLAGS="
set "QSG_RHI_DISABLE_DISK_CACHE="
echo Surface Fast mode (GPU and JIT enabled) > "SurfaceFast-startup.log"
"Jellyfin Desktop.exe" --create-profile SurfaceFast-v01 >> "SurfaceFast-startup.log" 2>&1
start "" /wait "Jellyfin Desktop.exe" --profile SurfaceFast-v01 >> "SurfaceFast-startup.log" 2>&1
set "JFD_EXIT=%ERRORLEVEL%"
echo Exit code: %JFD_EXIT% >> "SurfaceFast-startup.log"
if not "%JFD_EXIT%"=="0" (
  echo Surface Fast exited with code %JFD_EXIT%.
  echo Try Start-SurfaceBalanced.cmd instead.
  echo Please send SurfaceFast-startup.log if startup fails.
  pause
)
endlocal
