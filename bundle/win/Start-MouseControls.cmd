@echo off
cd /d "%~dp0"
"Jellyfin Desktop.exe" --create-profile MouseControls-v03
start "" "Jellyfin Desktop.exe" --profile MouseControls-v03
