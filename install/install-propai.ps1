param(
  [string]$PackageName = "@propai/cli",
  [switch]$FromSource,
  [switch]$TryNpmLink,
  [switch]$SkipSourceUpdate,
  [switch]$SkipDoctor
)

$ErrorActionPreference = "Stop"

function Write-Info([string]$Message) {
  Write-Host "[info] $Message" -ForegroundColor Cyan
}

function Write-WarnLine([string]$Message) {
  Write-Host "[warn] $Message" -ForegroundColor Yellow
}

function Write-Ok([string]$Message) {
  Write-Host "[ok] $Message" -ForegroundColor Green
}

function Write-Fail([string]$Message) {
  Write-Host "[error] $Message" -ForegroundColor Red
}

function Has-Command([string]$Name) {
  return $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Assert-ExitCode([string]$Step) {
  if ($LASTEXITCODE -ne 0) {
    throw "$Step failed with exit code $LASTEXITCODE."
  }
}

function Get-NodeMajor([string]$NodeVersion) {
  $match = [regex]::Match($NodeVersion, "^v(?<major>\d+)\.")
  if (-not $match.Success) {
    return $null
  }
  return [int]$match.Groups["major"].Value
}

function Try-UpdateSourceRepo([string]$RepoRoot) {
  if (-not (Has-Command "git")) {
    Write-WarnLine "git is not installed. Skipping source auto-update check."
    return
  }

  if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
    Write-Info "No git repository found at source path. Skipping source auto-update check."
    return
  }

  Write-Info "Checking source updates (git pull --ff-only)."

  Push-Location $RepoRoot
  try {
    $statusOutput = & git status --porcelain
    if ($LASTEXITCODE -ne 0) {
      Write-WarnLine "Could not read git status. Continuing with current local source."
      return
    }
    $status = if ($null -eq $statusOutput) { "" } else { (@($statusOutput) -join "`n").Trim() }

    if (-not [string]::IsNullOrWhiteSpace($status)) {
      Write-WarnLine "Local git changes detected. Skipping source auto-update pull."
      return
    }

    $upstreamOutput = & git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>$null
    $upstream = if ($null -eq $upstreamOutput) { "" } else { (@($upstreamOutput) -join "`n").Trim() }
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($upstream)) {
      Write-WarnLine "No upstream tracking branch configured. Skipping source auto-update pull."
      return
    }

    & git pull --ff-only
    if ($LASTEXITCODE -eq 0) {
      Write-Ok "Source repository updated."
    }
    else {
      Write-WarnLine "git pull failed. Continuing with current local source."
    }
  }
  finally {
    Pop-Location
  }
}

function Install-FromSource([string]$RepoRoot) {
  if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
    throw "Local source install requested, but package.json was not found at $RepoRoot."
  }

  Write-Info "Installing from local source: $RepoRoot"
  Push-Location $RepoRoot
  try {
    if (Test-Path (Join-Path $RepoRoot "node_modules")) {
      Write-Info "Detected node_modules. Skipping npm install."
    }
    else {
      Write-Info "node_modules not found. Running npm install."
      & npm install
      Assert-ExitCode "npm install"
    }

    & npm run build
    Assert-ExitCode "npm run build"

    $installed = $false

    if ($TryNpmLink) {
      & npm link
      if ($LASTEXITCODE -eq 0) {
        $installed = $true
      }
      else {
        Write-WarnLine "npm link failed. Falling back to local shim command."
        Install-LocalShim -RepoRoot $RepoRoot
        $installed = $true
      }
    }
    else {
      Write-Info "Using local shim command (skip npm link)."
      Install-LocalShim -RepoRoot $RepoRoot
      $installed = $true
    }

    if (-not $installed) {
      Write-WarnLine "Global npm install failed. Falling back to local shim command."
      Install-LocalShim -RepoRoot $RepoRoot
    }
  }
  finally {
    Pop-Location
  }
}

function Install-LocalShim([string]$RepoRoot) {
  $binDir = Resolve-ShimBinDir -RepoRoot $RepoRoot

  $entryPoint = Join-Path $RepoRoot "dist\cli\propai.js"
  if (-not (Test-Path $entryPoint)) {
    throw "Expected CLI entrypoint not found: $entryPoint"
  }

  $cmdPath = Join-Path $binDir "propai.cmd"
  $ps1Path = Join-Path $binDir "propai.ps1"

  $cmdContent = "@echo off`r`nnode `"$entryPoint`" %*`r`n"
  Set-Content -Path $cmdPath -Value $cmdContent -Encoding Ascii

  $ps1Content = "node `"$entryPoint`" `$args"
  Set-Content -Path $ps1Path -Value $ps1Content -Encoding Ascii

  Write-Ok "Shim installed at $cmdPath"
  if ($binDir -like "$RepoRoot*") {
    Write-WarnLine "Add this folder to PATH for global usage: $binDir"
  }
}

function Resolve-ShimBinDir([string]$RepoRoot) {
  $candidates = New-Object System.Collections.Generic.List[string]

  $prefixOutput = & npm config get prefix
  $prefix = if ($null -eq $prefixOutput) { "" } else { (@($prefixOutput) -join "`n").Trim() }
  if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace($prefix) -and $prefix -ne "undefined") {
    [void]$candidates.Add($prefix)
  }

  if (-not [string]::IsNullOrWhiteSpace($env:APPDATA)) {
    [void]$candidates.Add((Join-Path $env:APPDATA "npm"))
  }

  [void]$candidates.Add((Join-Path $RepoRoot ".local-bin"))

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-WritableDirectory -Path $candidate) {
      return $candidate
    }
  }

  throw "No writable install path found for propai shim."
}

function Test-WritableDirectory([string]$Path) {
  try {
    if (-not (Test-Path $Path)) {
      New-Item -ItemType Directory -Path $Path -Force | Out-Null
    }

    $probe = Join-Path $Path ".write-test"
    Set-Content -Path $probe -Value "ok" -Encoding Ascii
    Remove-Item -Force $probe
    return $true
  }
  catch {
    return $false
  }
}

function Run-Doctor([string]$RepoRoot, [bool]$PreferSource) {
  if (Has-Command "propai") {
    Write-Info "Running: propai doctor"
    & propai doctor
    Assert-ExitCode "propai doctor"
    return
  }

  if ($PreferSource -and (Test-Path (Join-Path $RepoRoot "dist\cli\propai.js"))) {
    Write-WarnLine "Global 'propai' not available in PATH for this shell. Running local dist binary."
    & node (Join-Path $RepoRoot "dist\cli\propai.js") doctor
    Assert-ExitCode "node dist/cli/propai.js doctor"
    return
  }

  Write-WarnLine "Install finished, but 'propai' is not visible in current PATH."
  Write-WarnLine "Open a new terminal and run: propai doctor"
}

function Has-TuiRuntime([string]$RepoRoot) {
  $vuePath = Join-Path $RepoRoot "node_modules\vue\package.json"
  $termuiPath = Join-Path $RepoRoot "node_modules\@vue-termui\core\package.json"
  return (Test-Path $vuePath) -and (Test-Path $termuiPath)
}

try {
  $scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
  $repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
  $installedVia = ""
  $localNpmCache = Join-Path $repoRoot ".npm-cache"

  if (-not (Test-Path $localNpmCache)) {
    New-Item -ItemType Directory -Path $localNpmCache -Force | Out-Null
  }
  $env:npm_config_cache = $localNpmCache

  Write-Host ""
  Write-Host "===================================="
  Write-Host "PropAI One-Click Installer"
  Write-Host "===================================="
  Write-Host ""

  if (-not (Has-Command "node")) {
    throw "Node.js is not installed. Install Node LTS first (example: winget install OpenJS.NodeJS.LTS)."
  }

  if (-not (Has-Command "npm")) {
    throw "npm is not available. Reinstall Node.js LTS and retry."
  }

  $nodeVersion = (& node --version).Trim()
  Write-Info "Node detected: $nodeVersion"
  $nodeMajor = Get-NodeMajor -NodeVersion $nodeVersion
  if ($null -ne $nodeMajor -and ($nodeMajor -lt 25 -or $nodeMajor -gt 25)) {
    Write-WarnLine "Node $nodeVersion is outside tested range (25.x). Recommended: Node 25.x."
  }

  if (-not $FromSource) {
    Write-Info "Trying global npm install: $PackageName"
    & npm install -g $PackageName
    if ($LASTEXITCODE -eq 0) {
      $installedVia = "npm-global"
      Write-Ok "Installed via npm global package."
    }
    else {
      Write-WarnLine "Global package install failed (package unavailable or npm auth issue). Falling back to local source install."
    }
  }

  if ([string]::IsNullOrWhiteSpace($installedVia)) {
    if (-not $SkipSourceUpdate) {
      Try-UpdateSourceRepo -RepoRoot $repoRoot
    }
    else {
      Write-Info "Skipping source auto-update check (-SkipSourceUpdate)."
    }

    Install-FromSource -RepoRoot $repoRoot
    $installedVia = "source"
    Write-Ok "Installed via local source path."
  }

  if (-not $SkipDoctor) {
    Run-Doctor -RepoRoot $repoRoot -PreferSource ($installedVia -eq "source")
  }

  Write-Host ""
  Write-Ok "Installer complete."
  if (Has-TuiRuntime -RepoRoot $repoRoot) {
    Write-Host "Next command: propai chat"
  }
  else {
    Write-WarnLine "TUI runtime packages are missing. Start with: propai classic"
    Write-WarnLine "Install TUI packages later with: npm install vue vue-termui"
  }
}
catch {
  Write-Fail $_.Exception.Message
  exit 1
}
