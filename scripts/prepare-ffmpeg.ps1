# Prepare the pinned Windows x64 FFmpeg bundle; verify the archive before extracting selected resources.
param([string]$ArchivePath = '')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
function Get-BundleHash([string]$FilePath) {
    $stream = [System.IO.File]::OpenRead($FilePath)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try { return ([System.BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $sha.Dispose(); $stream.Dispose() }
}
$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot 'apps/electron/scripts/ffmpeg-bundle.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$target = Join-Path $repoRoot 'apps/electron/bin/ffmpeg'
if (-not [System.Environment]::Is64BitOperatingSystem -or $env:OS -ne 'Windows_NT') { throw 'This preparation script supports Windows x64 bundles only.' }
if (Test-Path -LiteralPath (Join-Path $target 'bundle.json')) {
    & node (Join-Path $repoRoot 'apps/electron/scripts/check-ffmpeg-bundle.cjs')
    if ($LASTEXITCODE -eq 0) { Write-Host 'Pinned FFmpeg bundle is already ready.'; exit 0 }
    throw 'The existing bundle is incomplete or modified. Keep it for inspection; move its generated files aside before preparing again.'
}
foreach ($name in @('ffmpeg.exe', 'ffprobe.exe', 'LICENSE.txt', 'UPSTREAM-README.txt', 'SOURCE.txt')) {
    if (Test-Path -LiteralPath (Join-Path $target $name)) { throw "Existing $name will not be overwritten. Move it aside before preparing the pinned bundle." }
}
$taskTemp = Join-Path ([System.IO.Path]::GetTempPath()) ('ir-ffmpeg-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $taskTemp | Out-Null
$zip = $null
try {
    if ($ArchivePath) {
        $archive = (Resolve-Path -LiteralPath $ArchivePath).Path
    } else {
        $archive = Join-Path $taskTemp 'bundle.zip'
        Write-Host ('Downloading FFmpeg ' + $config.version + ' Windows x64...')
        Invoke-WebRequest -Uri $config.archiveUrl -OutFile $archive -TimeoutSec 600 -UseBasicParsing
    }
    if ((Get-BundleHash $archive) -ne $config.archiveSha256) { throw 'FFmpeg archive SHA256 mismatch; nothing was installed.' }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($archive)
    $prefix = 'ffmpeg-' + $config.version + '-essentials_build/'
    $files = [ordered]@{ 'ffmpeg.exe' = 'bin/ffmpeg.exe'; 'ffprobe.exe' = 'bin/ffprobe.exe'; 'LICENSE.txt' = 'LICENSE'; 'UPSTREAM-README.txt' = 'README.txt' }
    $hashes = [ordered]@{}
    foreach ($name in $files.Keys) {
        $entry = $zip.GetEntry($prefix + $files[$name])
        if ($null -eq $entry) { throw "Missing archive entry: $name" }
        $stagedFile = Join-Path $taskTemp $name
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $stagedFile)
        $hashes[$name] = Get-BundleHash $stagedFile
        if ($hashes[$name] -ne $config.files.$name) { throw "Extracted $name does not match the pinned executable/resource hash." }
    }
    $source = "FFmpeg $($config.version) Windows x64 essentials build by gyan.dev`nArchive: $($config.archiveUrl)`nArchive SHA256: $($config.archiveSha256)`nFFmpeg source revision: $($config.sourceUrl)`nLicense: $($config.license); see LICENSE.txt and UPSTREAM-README.txt.`nBuild configuration: run ffmpeg.exe -buildconf.`n"
    [System.IO.File]::WriteAllText((Join-Path $taskTemp 'SOURCE.txt'), $source, [System.Text.UTF8Encoding]::new($false))
    $hashes['SOURCE.txt'] = Get-BundleHash (Join-Path $taskTemp 'SOURCE.txt')
    $manifest = [ordered]@{ version = $config.version; platform = $config.platform; arch = $config.arch; archiveSha256 = $config.archiveSha256; files = $hashes }
    [System.IO.File]::WriteAllText((Join-Path $taskTemp 'bundle.json'), ($manifest | ConvertTo-Json -Depth 5) + "`n", [System.Text.UTF8Encoding]::new($false))
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($name in @($hashes.Keys) + @('bundle.json')) { Move-Item -LiteralPath (Join-Path $taskTemp $name) -Destination (Join-Path $target $name) }
    & node (Join-Path $repoRoot 'apps/electron/scripts/check-ffmpeg-bundle.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Installed FFmpeg bundle failed validation.' }
    Write-Host 'FFmpeg and FFprobe are ready for development and packaging.'
} finally {
    if ($null -ne $zip) { $zip.Dispose() }
    $resolvedTemp = [System.IO.Path]::GetFullPath($taskTemp)
    $tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolvedTemp.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -and ([System.IO.Path]::GetFileName($resolvedTemp)).StartsWith('ir-ffmpeg-')) { Remove-Item -LiteralPath $resolvedTemp -Recurse -Force }
}
