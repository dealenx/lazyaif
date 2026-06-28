#requires -Version 5.1
# lazyaif installer (windows)
# Usage: irm https://raw.githubusercontent.com/dealenx/lazyaif/main/scripts/install.ps1 | iex
#   $env:LAZYAIF_INSTALL_DIR = "C:\path"   custom install dir (default: $env:LOCALAPPDATA\lazyaif)
#   $env:LAZYAIF_INSTALL_DEBUG = "1"       enable verbose output
#   $env:GITHUB_API_TOKEN = "xxx"          optional token to avoid rate limits
# Exit codes: 0 ok · 2 unsupported arch · 3 checksum · 4 download · 5 api

[CmdletBinding()]
param(
  [switch]$Verbose
)

$ErrorActionPreference = "Stop"
$script:ExitCode = 0

if ($Verbose -or $env:LAZYAIF_INSTALL_DEBUG -eq "1") {
  $VerbosePreference = "Continue"
  Set-PSDebug -Trace 1
}

function Write-Install { param([string]$Msg) Write-Host "[install] $Msg" }
function Write-InstallDebug { param([string]$Msg) Write-Verbose "[install:debug] $Msg" }
function Write-InstallError { param([string]$Msg) Write-Error "[install:error] $Msg" }

try {

  # --- 1. Banner ------------------------------------------------------------
  Write-Install "lazyaif installer (windows)"

  # --- 2. Detect arch --------------------------------------------------------
  $archRaw = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture.ToString()
  Write-InstallDebug "raw arch: $archRaw"
  $arch = switch ($archRaw) {
    "X64"   { "x64"; break }
    "Arm64" { "arm64"; break }
    default { Write-InstallError "unsupported arch: $archRaw (expected X64 or Arm64)"; $script:ExitCode = 2; exit 2 }
  }
  Write-Install "detected os=windows arch=$arch"

  # --- 3. Resolve install dir ------------------------------------------------
  $InstallDir = if ($env:LAZYAIF_INSTALL_DIR) { $env:LAZYAIF_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA "lazyaif" }
  if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  }
  Write-Install "install dir: $InstallDir"

  # --- 4. Fetch latest release metadata --------------------------------------
  $apiUrl = "https://api.github.com/repos/dealenx/lazyaif/releases/latest"
  $headers = @{ "User-Agent" = "lazyaif-installer" }
  if ($env:GITHUB_API_TOKEN) {
    $headers["Authorization"] = "Bearer $env:GITHUB_API_TOKEN"
  }
  Write-Install "fetching latest release: $apiUrl"
  try {
    $release = Invoke-RestMethod -Uri $apiUrl -Headers $headers -ErrorAction Stop
  } catch {
    Write-InstallError "failed to fetch release metadata: $_"
    $script:ExitCode = 5; exit 5
  }

  $tagName = $release.tag_name
  if (-not $tagName) {
    Write-InstallError "could not parse tag_name from API response"
    $script:ExitCode = 5; exit 5
  }
  Write-Install "latest tag: $tagName"

  # --- 5. Find asset + checksums ----------------------------------------------
  $assetName = "lazyaif-$tagName-windows-$arch.exe"
  $checksumsName = "checksums.txt"

  $binAsset = $release.assets | Where-Object { $_.name -eq $assetName } | Select-Object -First 1
  if (-not $binAsset) {
    Write-InstallError "asset not found in release: $assetName"
    Write-Host "available assets:" -ForegroundColor Yellow
    $release.assets | ForEach-Object { Write-Host "  $($_.name)" } | Out-Host
    $script:ExitCode = 4; exit 4
  }
  Write-Install "binary url: $($binAsset.browser_download_url)"

  $checksumsAsset = $release.assets | Where-Object { $_.name -eq $checksumsName } | Select-Object -First 1
  if (-not $checksumsAsset) {
    Write-InstallError "checksums.txt not found in release"
    $script:ExitCode = 4; exit 4
  }
  Write-Install "checksums url: $($checksumsAsset.browser_download_url)"

  # --- 6. Download ----------------------------------------------------------
  $tmpDir = Join-Path $env:TEMP "lazyaif-install-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
  New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
  Write-Install "temp dir: $tmpDir"

  $tmpExe = Join-Path $tmpDir $assetName
  $tmpChecksums = Join-Path $tmpDir $checksumsName

  Write-Install "downloading binary..."
  try {
    Invoke-WebRequest -Uri $binAsset.browser_download_url -OutFile $tmpExe -Headers @{ "User-Agent" = "lazyaif-installer" } -ErrorAction Stop
  } catch {
    Write-InstallError "failed to download binary: $_"
    $script:ExitCode = 4; exit 4
  }
  $size = (Get-Item $tmpExe).Length
  Write-Install "downloaded: $size bytes"

  Write-Install "downloading checksums..."
  try {
    Invoke-WebRequest -Uri $checksumsAsset.browser_download_url -OutFile $tmpChecksums -Headers @{ "User-Agent" = "lazyaif-installer" } -ErrorAction Stop
  } catch {
    Write-InstallError "failed to download checksums: $_"
    $script:ExitCode = 4; exit 4
  }

  # --- 7. Verify SHA-256 ----------------------------------------------------
  $checksumsContent = Get-Content $tmpChecksums -Raw
  $expectedHash = $null
  foreach ($line in ($checksumsContent -split "`n")) {
    $parts = $line -split '\s+', 2
    if ($parts.Count -eq 2 -and $parts[1].Trim() -eq $assetName) {
      $expectedHash = $parts[0].Trim().ToLower()
      break
    }
  }
  if (-not $expectedHash) {
    Write-InstallError "no checksum found for $assetName in checksums.txt"
    Write-Host $checksumsContent -ForegroundColor Yellow
    $script:ExitCode = 3; exit 3
  }
  Write-Install "expected sha256: $expectedHash"

  $actualHash = (Get-FileHash -Algorithm SHA256 $tmpExe).Hash.ToLower()
  Write-Install "actual sha256:   $actualHash"

  if ($actualHash -ne $expectedHash) {
    Write-InstallError "checksum mismatch!"
    $script:ExitCode = 3; exit 3
  }
  Write-Install "checksum verified"

  # --- 8. Install ----------------------------------------------------------
  $dest = Join-Path $InstallDir "lazyaif.exe"
  Move-Item -Path $tmpExe -Destination $dest -Force
  Write-Install "installed: $dest"

  # --- 9. Confirm + PATH hint -----------------------------------------------
  & $dest --version
  if ($LASTEXITCODE -ne 0) { Write-InstallError "warning: binary launched but --version exited $LASTEXITCODE" }

  $pathParts = ($env:PATH -split ';')
  if ($pathParts -notcontains $InstallDir) {
    Write-Host ""
    Write-Install "NOTE: $InstallDir is not on your PATH."
    Write-Host "  Add it with:"
    Write-Host "    [Environment]::SetEnvironmentVariable('PATH', `"$InstallDir;`$([Environment]::GetEnvironmentVariable('PATH', 'User'))`, 'User')"
  }

  Write-Host ""
  Write-Install "done. Run \`lazyaif --help\` to get started."

}
catch {
  Write-InstallError "unexpected error: $_"
  if ($script:ExitCode -eq 0) { $script:ExitCode = 1 }
  exit $script:ExitCode
}
finally {
  if ($tmpDir -and (Test-Path $tmpDir)) { Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue }
}