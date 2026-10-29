@echo off
cd /d "%~dp0"
"Jellyfin Desktop.exe" --create-profile TouchControls-v01
start "" "Jellyfin Desktop.exe" --profile TouchControls-v01
