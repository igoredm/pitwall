# Compila o leitor de bateria de periféricos sem fio (WirelessBattery, GPL-3.0) a partir de um commit
# revisado, e baixa o HeadsetControl oficial (GPL-3.0) com verificação de hash.
# Resultado em tools\battery\ (empacotado pelo instalador como programas separados, com licença e código-fonte).
#
# Por que compilar em vez de usar o exe da release: o repositório é novo (criado em 2026-11-16) e os binários
# não são assinados. O código deste commit foi revisado (só HID local, Bluetooth RFCOMM local, nenhum acesso à rede).
#
# Requer MinGW-w64 (winget install BrechtSanders.WinLibs.POSIX.UCRT) e git.
param(
    [string]$Commit = "5b872f8f5217a18d5adbbb3b7cc96419b62b9317",
    [string]$HeadsetControlVersion = "4.3.0",
    [string]$HeadsetControlSha256 = "e371da043710ddb8fc70af77f2ccad1cd03f8c6f49ba423e08764ad7a94a3c40"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "tools\battery"
$work = Join-Path $env:TEMP "pitwall-battery-build"

if (-not (Get-Command g++ -ErrorAction SilentlyContinue)) {
    $mingw = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter g++.exe -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $mingw) { throw "MinGW não encontrado: winget install BrechtSanders.WinLibs.POSIX.UCRT" }
    $env:PATH = "$($mingw.DirectoryName);$env:PATH"
}

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
git clone -q https://github.com/krisgfx9/Wireless-Device-Battery-Monitor $work
Push-Location $work
git checkout -q $Commit

# Drivers próprios do Pitwall (tools\battery-patches): hoje o AULA "Infortech" (Kunlun X5, L9, SC880, SC900 V2...).
$patches = Join-Path $root "tools\battery-patches"
Copy-Item (Join-Path $patches "aula_infortech.cpp") src\drivers\ -Force
$h = Get-Content src\drivers\drivers.h -Raw
if ($h -notmatch "PollAulaInfortech") {
    $h = $h -replace "(void PollAula\(PollContext& ctx\);[^\r\n]*)", "`$1`r`nvoid PollAulaInfortech(PollContext& ctx);  // AULA mice on the 38A6 `"AULA Receiver`" (Kunlun X5, L9, SC880, SC900 V2...)"
    Set-Content src\drivers\drivers.h $h -NoNewline
}
$dv = Get-Content src\devices.cpp -Raw
if ($dv -notmatch "PollAulaInfortech") {
    $dv = $dv -replace "(\s+PollAula\(ctx\);[^\r\n]*)", "`$1`r`n    PollAulaInfortech(ctx);"
    Set-Content src\devices.cpp $dv -NoNewline
}
if (-not (Select-String -Path src\devices.cpp -Pattern "PollAulaInfortech" -Quiet)) { throw "não consegui registrar o driver AULA" }

New-Item -ItemType Directory -Force build | Out-Null
windres -i res/app.rc -o build/app_res.o --include-dir res
if ($LASTEXITCODE) { throw "windres falhou" }
$src = @(Get-ChildItem src\*.cpp, src\drivers\*.cpp | ForEach-Object { $_.FullName })
g++ -std=c++17 -Os -municode -mwindows -static -s -ffunction-sections -fdata-sections "-Wl,--gc-sections" `
    -D_WIN32_WINNT=0x0A00 -DWINVER=0x0A00 -Wall -Wno-missing-field-initializers @src build/app_res.o `
    -o WirelessBattery.exe -lhid -lsetupapi -lcfgmgr32 -lole32 -loleaut32 -lcomctl32 -lgdi32 -lruntimeobject -lws2_32
if ($LASTEXITCODE) { throw "g++ falhou" }

New-Item -ItemType Directory -Force $out | Out-Null
Copy-Item WirelessBattery.exe $out -Force
Copy-Item LICENSE (Join-Path $out "LICENSE-GPL-3.0.txt") -Force
# GPL: o código-fonte correspondente (com as modificações do Pitwall) vai junto
Remove-Item (Join-Path $out "WirelessBattery-source-*.zip") -ErrorAction SilentlyContinue
git add -N src\drivers\aula_infortech.cpp
git diff > PITWALL-CHANGES.diff
Compress-Archive -Path src, res, LICENSE, README.md, Makefile, build.bat, PITWALL-CHANGES.diff `
    -DestinationPath (Join-Path $out "WirelessBattery-source-$($Commit.Substring(0,7))-pitwall.zip") -Force
Pop-Location

$hc = Join-Path $out "headsetcontrol.exe"
Invoke-WebRequest "https://github.com/Sapd/HeadsetControl/releases/download/$HeadsetControlVersion/headsetcontrol-windows-x86_64.exe" -OutFile $hc
if ((Get-FileHash $hc -Algorithm SHA256).Hash -ne $HeadsetControlSha256.ToUpper()) { Remove-Item $hc; throw "hash do HeadsetControl não confere" }
Invoke-WebRequest "https://github.com/Sapd/HeadsetControl/releases/download/$HeadsetControlVersion/headsetcontrol-$HeadsetControlVersion.tar.gz" `
    -OutFile (Join-Path $out "headsetcontrol-$HeadsetControlVersion-source.tar.gz")

Get-ChildItem $out | Select-Object Name, Length
