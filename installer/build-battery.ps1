# Compila o leitor de bateria de periféricos sem fio (WirelessBattery, GPL-3.0) a partir de um commit
# revisado, e baixa o HeadsetControl oficial (GPL-3.0) com verificação de hash.
# Resultado em tools\battery\ (empacotado pelo instalador como programas separados, com licença e código-fonte).
#
# Por que compilar em vez de usar o exe da release: o repositório é novo (criado em 2026-11-16) e os binários
# não são assinados. Commits revisados: 5b872f8 (2026-11-17) e 958a60a (2026-11-18: só HID local nos drivers; o envio de
# "pedir suporte" para a rede e o fallback SearchPathW do headsetcontrol são removidos pelos patches abaixo).
#
# Requer MinGW-w64 (winget install BrechtSanders.WinLibs.POSIX.UCRT) e git.
param(
    [string]$Commit = "958a60a4b219189248c97497291fb362aab2a684",
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

# Patches de segurança (revisão do commit 958a60a). O Pitwall roda elevado e só usa --list.
function Patch([string]$file, [string]$old, [string]$new) {
    $t = Get-Content $file -Raw
    if (-not $t.Contains($old)) { throw "patch não encaixou em $file" }
    Set-Content $file $t.Replace($old, $new) -NoNewline
}
# 1) Sem rede: a janela "pedir suporte" enviaria dados do aparelho para krisgfx.com. Aqui o envio vira no-op.
Patch src\report.cpp "#include <winhttp.h>" "// Pitwall: no network (HTTP client removed)"
$r = Get-Content src\report.cpp -Raw
$r = [regex]::Replace($r, '(?s)int Post\(const std::string& body, std::string& reply\) \{.*?\r?\n\}\r?\n',
    "int Post(const std::string&, std::string&) { return 0; }  // Pitwall: no network`r`n", 1)
if ($r -cmatch "WinHttp") { throw "ainda há WinHttp em report.cpp" }
Set-Content src\report.cpp $r -NoNewline
# 2) Só o headsetcontrol.exe ao lado do exe: o fallback SearchPathW procuraria na pasta atual e no PATH,
#    o que permitiria a um usuário comum plantar um executável que rodaria como administrador.
Patch src\drivers\headsetcontrol.cpp "    if (SearchPathW(nullptr, L`"headsetcontrol.exe`", nullptr, MAX_PATH, found, nullptr)) return found;" `
    "    (void)found;  // Pitwall: only the copy next to the exe (no current dir / PATH lookup)"
if (Select-String -Path src\*.cpp, src\drivers\*.cpp -Pattern "WinHttp|SearchPathW" -CaseSensitive -Quiet) { throw "sobrou WinHttp/SearchPathW" }

New-Item -ItemType Directory -Force build | Out-Null
# Idiomas embutidos (como o build.bat do upstream): lang\*.txt concatenados em build\languages.txt
$langs = foreach ($f in Get-ChildItem lang\*.txt) { "@file $($f.BaseName)"; Get-Content $f.FullName -Raw -Encoding UTF8; "" }
[IO.File]::WriteAllText((Join-Path $work "build\languages.txt"), ($langs -join "`r`n"), [Text.UTF8Encoding]::new($false))
windres -i res/app.rc -o build/app_res.o --include-dir res --include-dir build
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
Compress-Archive -Path src, res, lang, LICENSE, README.md, Makefile, build.bat, PITWALL-CHANGES.diff `
    -DestinationPath (Join-Path $out "WirelessBattery-source-$($Commit.Substring(0,7))-pitwall.zip") -Force
Pop-Location

$hc = Join-Path $out "headsetcontrol.exe"
Invoke-WebRequest "https://github.com/Sapd/HeadsetControl/releases/download/$HeadsetControlVersion/headsetcontrol-windows-x86_64.exe" -OutFile $hc
if ((Get-FileHash $hc -Algorithm SHA256).Hash -ne $HeadsetControlSha256.ToUpper()) { Remove-Item $hc; throw "hash do HeadsetControl não confere" }
Invoke-WebRequest "https://github.com/Sapd/HeadsetControl/releases/download/$HeadsetControlVersion/headsetcontrol-$HeadsetControlVersion.tar.gz" `
    -OutFile (Join-Path $out "headsetcontrol-$HeadsetControlVersion-source.tar.gz")

Get-ChildItem $out | Select-Object Name, Length
