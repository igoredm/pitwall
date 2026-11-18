# Gera o instalador: build do Angular -> publish .NET self-contained -> Inno Setup.
# Uso: powershell -ExecutionPolicy Bypass -File installer\build.ps1 [-Version 0.1.0]
param([string]$Version = "0.1.0")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$env:PATH = "$env:ProgramFiles\nodejs;$env:ProgramFiles\dotnet;$env:PATH"

Push-Location "$root\web"
npx ng build
if ($LASTEXITCODE) { throw "ng build falhou" }
Pop-Location

Remove-Item "$root\artifacts\publish" -Recurse -Force -ErrorAction SilentlyContinue
dotnet publish "$root\src\Pitwall\Pitwall.csproj" -c Release -r win-x64 --self-contained true `
  -p:PublishReadyToRun=true -p:Version=$Version -o "$root\artifacts\publish"
if ($LASTEXITCODE) { throw "dotnet publish falhou" }

$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw "Inno Setup 6 não encontrado" }
& $iscc "/DAppVersion=$Version" "$root\installer\Pitwall.iss"
if ($LASTEXITCODE) { throw "ISCC falhou" }

Get-Item "$root\artifacts\installer\Pitwall-Setup-$Version.exe"
