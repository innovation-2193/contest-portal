param([string]$OutputDirectory = "$PSScriptRoot\..\production-package")

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$Zip = Join-Path $OutputDirectory "police-innovation-contest-production.zip"
$HashFile = Join-Path $OutputDirectory "police-innovation-contest-production.sha256.txt"
$Manifest = Join-Path $Root "RELEASE_MANIFEST.txt"
$Commit = (git -C $Root rev-parse HEAD).Trim()

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
@"
Police Innovation Contest 2026
Source commit: $Commit
Created at: $([DateTimeOffset]::Now.ToString("yyyy-MM-dd HH:mm:ss zzz"))
Package excludes runtime secrets, database data, uploaded files, logs, node_modules and build output.
"@ | Set-Content -LiteralPath $Manifest -Encoding utf8

try {
  git -C $Root archive --format=zip --output=$Zip HEAD
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $target = [System.IO.Compression.ZipFile]::Open($Zip, [System.IO.Compression.ZipArchiveMode]::Update)
  try {
    $entry = $target.CreateEntry("RELEASE_MANIFEST.txt")
    $entryStream = $entry.Open()
    $fileStream = [System.IO.File]::OpenRead($Manifest)
    try { $fileStream.CopyTo($entryStream) } finally { $fileStream.Dispose(); $entryStream.Dispose() }
  } finally { $target.Dispose() }
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $Zip).Hash.ToLowerInvariant()
  "$hash  $([System.IO.Path]::GetFileName($Zip))" | Set-Content -LiteralPath $HashFile -Encoding ascii
  Write-Output "Package: $Zip"
  Write-Output "SHA256: $hash"
} finally {
  Remove-Item -LiteralPath $Manifest -Force -ErrorAction SilentlyContinue
}
