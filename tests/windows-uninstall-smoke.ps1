$ErrorActionPreference = "Stop"

function Invoke-CheckedProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList
  )
  $process = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru
  if ($process.ExitCode -ne 0) {
    throw "Process failed with exit code $($process.ExitCode): $FilePath $($ArgumentList -join ' ')"
  }
}

function Find-Uninstaller {
  param([Parameter(Mandatory = $true)][string]$InstallDirectory)
  $uninstaller = Get-ChildItem -Path $InstallDirectory -Filter "Uninstall*.exe" -File | Select-Object -First 1
  if (-not $uninstaller) {
    throw "The NSIS install did not create an uninstaller in $InstallDirectory"
  }
  return $uninstaller.FullName
}

$installer = Get-ChildItem -Path "release" -Filter "MedNote-Reader-Setup-*.exe" -File | Select-Object -First 1
if (-not $installer) {
  throw "Windows installer artifact was not found"
}

$installDirectory = Join-Path $env:RUNNER_TEMP "mednote-reader-uninstall-smoke"
$appDataDirectory = Join-Path $env:APPDATA "mednote-reader"
$sentinel = Join-Path $appDataDirectory "uninstall-smoke-sentinel.txt"

if (Test-Path $installDirectory) {
  Remove-Item -Path $installDirectory -Recurse -Force
}
if (Test-Path $appDataDirectory) {
  Remove-Item -Path $appDataDirectory -Recurse -Force
}

try {
  Invoke-CheckedProcess -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDirectory")
  $uninstaller = Find-Uninstaller -InstallDirectory $installDirectory
  New-Item -ItemType Directory -Path $appDataDirectory -Force | Out-Null
  Set-Content -Path $sentinel -Value "preserve-on-default-uninstall"

  Invoke-CheckedProcess -FilePath $uninstaller -ArgumentList @("/S")
  if (Test-Path (Join-Path $installDirectory "MedNote Reader.exe")) {
    throw "Default uninstall left the MedNote executable installed"
  }
  if (-not (Test-Path $sentinel)) {
    throw "Default uninstall deleted user data"
  }

  Invoke-CheckedProcess -FilePath $installer.FullName -ArgumentList @("/S", "/D=$installDirectory")
  $uninstaller = Find-Uninstaller -InstallDirectory $installDirectory
  Invoke-CheckedProcess -FilePath $uninstaller -ArgumentList @("/S", "--delete-app-data")
  if (Test-Path $appDataDirectory) {
    throw "Explicit data-removal uninstall left MedNote user data behind"
  }
} finally {
  if (Test-Path $installDirectory) {
    Remove-Item -Path $installDirectory -Recurse -Force
  }
  if (Test-Path $appDataDirectory) {
    Remove-Item -Path $appDataDirectory -Recurse -Force
  }
}

Write-Output "Windows install/uninstall and app-data policy smoke test passed"
