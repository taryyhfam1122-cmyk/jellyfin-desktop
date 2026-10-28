param([Parameter(Mandatory=$true)][string]$ZipPath)
$ErrorActionPreference = 'Stop'
$ZipPath = (Resolve-Path $ZipPath).Path
$stage = Join-Path $env:RUNNER_TEMP 'jfd-mouse-v03-portable-check'
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
Expand-Archive -LiteralPath $ZipPath -DestinationPath $stage
$required = @(
    'Jellyfin Desktop.exe', 'portable', 'qt.conf', 'libmpv-2.dll', 'libmpv-fallback.dll',
    'Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Network.dll', 'Qt6Qml.dll', 'Qt6Quick.dll',
    'Qt6Xml.dll', 'Qt6WebChannel.dll', 'Qt6WebEngineCore.dll', 'Qt6WebEngineQuick.dll',
    'Qt6Widgets.dll', 'Qt6OpenGL.dll', 'QtWebEngineProcess.exe',
    'platforms/qwindows.dll', 'resources/icudtl.dat', 'resources/qtwebengine_resources.pak',
    'resources/v8_context_snapshot.bin', 'translations/qtwebengine_locales/en-US.pak',
    'vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll',
    'Start-MouseControls.cmd', 'MouseControls-README.txt'
)
foreach ($file in $required) {
    if (-not (Test-Path (Join-Path $stage $file))) { throw "Portable is missing: $file" }
}
if (-not (Test-Path (Join-Path $stage 'qml/QtWebEngine'))) { throw 'QtWebEngine QML module is missing' }
$report = Join-Path $PWD 'build/portable-validation'
New-Item -ItemType Directory -Force $report | Out-Null
Get-ChildItem $stage -Recurse -File | ForEach-Object {
    [PSCustomObject]@{Path=$_.FullName.Substring($stage.Length+1); Bytes=$_.Length; SHA256=(Get-FileHash $_.FullName -Algorithm SHA256).Hash}
} | Export-Csv (Join-Path $report 'manifest.csv') -NoTypeInformation
(Get-FileHash $ZipPath -Algorithm SHA256).Hash | Set-Content (Join-Path $report 'zip-sha256.txt')
# Prevent the installed Qt SDK from masking missing Portable dependencies.
$originalPath = $env:PATH
$env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
Remove-Item Env:QT_PLUGIN_PATH,Env:QML2_IMPORT_PATH,Env:QML_IMPORT_PATH -ErrorAction SilentlyContinue
$process = $null
$config = Join-Path $env:RUNNER_TEMP 'jfd-mouse-v03-smoke-config'
try {
    $exe = Join-Path $stage 'Jellyfin Desktop.exe'
    $process = Start-Process -FilePath $exe -WorkingDirectory $stage -ArgumentList @('--config-dir', "`"$config`"") -PassThru -RedirectStandardOutput (Join-Path $report 'stdout.txt') -RedirectStandardError (Join-Path $report 'stderr.txt')
    Start-Sleep -Seconds 12
    $process.Refresh()
    if ($process.HasExited) {
        Get-Content (Join-Path $report 'stdout.txt'),(Join-Path $report 'stderr.txt')
        throw "Portable startup failed: exit $($process.ExitCode)"
    }
    'PASS: extracted Portable remained running for 12 seconds with Qt SDK removed from PATH.' | Tee-Object -FilePath (Join-Path $report 'result.txt')
} finally {
    if ($process -and -not $process.HasExited) { Stop-Process -Id $process.Id -Force }
    $env:PATH = $originalPath
    if (Test-Path $config) { Copy-Item $config (Join-Path $report 'config') -Recurse -Force }
}
