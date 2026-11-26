# Compila o leitor de bateria de periféricos sem fio (Battery Hub, ex-WirelessBattery, GPL-3.0) a partir de um
# commit revisado, e baixa o HeadsetControl oficial (GPL-3.0) com verificação de hash.
# Resultado em tools\battery\ (empacotado pelo instalador como programas separados, com licença e código-fonte).
#
# Por que compilar em vez de usar o exe da release: o repositório é novo (criado em 2026-11-16), cresce muito rápido
# e os binários não são assinados. Commits revisados: 5b872f8 (2026-11-17), 958a60a (2026-11-18) e 7cc44f2 (tag v1.1.0,
# 2026-11-19, quando virou "Battery Hub"). Em todos, os drivers só falam HID/Bluetooth local; o envio de "pedir suporte"
# para a rede, o atualizador automático (baixa e roda instaladores) e o fallback SearchPathW do headsetcontrol saem
# pelos patches abaixo. O Pitwall só usa "--json".
#
# Requer MinGW-w64 (winget install BrechtSanders.WinLibs.POSIX.UCRT) e git.
param(
    [string]$Commit = "7cc44f2b2c63341e2b478463c7467759837a74a9",
    # Hash da árvore de arquivos do commit revisado: garante o mesmo código, venha de onde vier
    [string]$Tree = "e3b0176baec2f5964762cb8c5ec93e9bda63fd6d",
    [string]$UpstreamVersion = "1.1.0",
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
# O repositório original (krisgfx9) saiu do ar em 2026-11-22 (conta suspensa) e o ferloom reescreveu o histórico em
# 2026-11-25. O commit revisado fica guardado no nosso fork (branch pitwall-cpp-7cc44f2); o hash da árvore abaixo
# garante que é o mesmo código.
New-Item -ItemType Directory $work | Out-Null
Push-Location $work
git init -q
git fetch -q --depth 1 https://github.com/igoredm/Wireless-Device-Battery-Monitor.git $Commit
if ($LASTEXITCODE) { throw "commit $Commit não encontrado no fork igoredm" }
git checkout -q FETCH_HEAD
if ($LASTEXITCODE) { throw "checkout de $Commit falhou" }
if ((git rev-parse "HEAD^{tree}") -ne $Tree) { throw "o código do commit $Commit não é o revisado" }

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

# Patches de segurança (revisão do commit 7cc44f2). O Pitwall roda elevado e só usa --json.
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
# 2) Sem atualizador automático (consulta o GitHub, baixa e executa instaladores): src\update_*.cpp saem do build e
#    no_updates.cpp entra no lugar, com as mesmas funções que o main.cpp chama, todas inertes.
Remove-Item src\update_win.cpp, src\update_apply.cpp, src\update_core.cpp, src\update_signature.cpp
Copy-Item (Join-Path $patches "no_updates.cpp") src\ -Force
# 3) Só o headsetcontrol.exe ao lado do exe: o fallback SearchPathW procuraria na pasta atual e no PATH,
#    o que permitiria a um usuário comum plantar um executável que rodaria como administrador.
Patch src\drivers\headsetcontrol.cpp "    if (SearchPathW(nullptr, L`"headsetcontrol.exe`", nullptr, MAX_PATH, found, nullptr)) return found;" `
    "    (void)found;  // Pitwall: only the copy next to the exe (no current dir / PATH lookup)"
if (Select-String -Path src\*.cpp, src\drivers\*.cpp -Pattern "WinHttp|SearchPathW|URLDownload|InternetOpen" -CaseSensitive -Quiet) {
    throw "sobrou acesso à rede ou SearchPathW"
}

New-Item -ItemType Directory -Force build | Out-Null
# build\version.h (usado pelo res\app.rc e pelo main.cpp), como o build.bat do upstream
& .\scripts\generate-version.ps1 -Version $UpstreamVersion -Channel stable
# Idiomas embutidos (como o build.bat do upstream): lang\*.txt concatenados em build\languages.txt
$langs = foreach ($f in Get-ChildItem lang\*.txt) { "@file $($f.BaseName)"; Get-Content $f.FullName -Raw -Encoding UTF8; "" }
[IO.File]::WriteAllText((Join-Path $work "build\languages.txt"), ($langs -join "`r`n"), [Text.UTF8Encoding]::new($false))
windres -i res/app.rc -o build/app_res.o --include-dir res --include-dir build
if ($LASTEXITCODE) { throw "windres falhou" }
$src = @(Get-ChildItem src\*.cpp, src\drivers\*.cpp | ForEach-Object { $_.FullName })
g++ -std=c++17 -Os -municode -mwindows -static -s -ffunction-sections -fdata-sections "-Wl,--gc-sections" `
    -D_WIN32_WINNT=0x0A00 -DWINVER=0x0A00 -Wall -Wno-missing-field-initializers @src build/app_res.o `
    -o BatteryHub.exe -lhid -lsetupapi -lcfgmgr32 -lole32 -loleaut32 -lcomctl32 -lgdi32 -lruntimeobject -lws2_32 `
    -lbcrypt -lversion -lbluetoothapis
if ($LASTEXITCODE) { throw "g++ falhou" }
# Conferência no binário final: nenhuma DLL de rede HTTP importada
$imports = & objdump -p BatteryHub.exe | Select-String "DLL Name: (.+)" | ForEach-Object { $_.Matches[0].Groups[1].Value.ToLower() }
$net = @($imports | Where-Object { $_ -match "winhttp|wininet|urlmon" })
if ($net.Count) { throw "BatteryHub.exe importa $($net -join ', ')" }

New-Item -ItemType Directory -Force $out | Out-Null
# Nome antigo (até a 1.2.1 do Pitwall)
Remove-Item (Join-Path $out "WirelessBattery.exe"), (Join-Path $out "WirelessBattery-source-*.zip") -ErrorAction SilentlyContinue
Copy-Item BatteryHub.exe $out -Force
Copy-Item LICENSE (Join-Path $out "LICENSE-GPL-3.0.txt") -Force
# GPL: o código-fonte correspondente (com as modificações do Pitwall) vai junto
Remove-Item (Join-Path $out "BatteryHub-source-*.zip") -ErrorAction SilentlyContinue
git add -A src
git diff --cached > PITWALL-CHANGES.diff
Compress-Archive -Path src, res, lang, scripts, LICENSE, README.md, Makefile, build.bat, PITWALL-CHANGES.diff `
    -DestinationPath (Join-Path $out "BatteryHub-source-$($Commit.Substring(0,7))-pitwall.zip") -Force
Pop-Location

$hc = Join-Path $out "headsetcontrol.exe"
Invoke-WebRequest "https://github.com/Sapd/HeadsetControl/releases/download/$HeadsetControlVersion/headsetcontrol-windows-x86_64.exe" -OutFile $hc
if ((Get-FileHash $hc -Algorithm SHA256).Hash -ne $HeadsetControlSha256.ToUpper()) { Remove-Item $hc; throw "hash do HeadsetControl não confere" }
Invoke-WebRequest "https://github.com/Sapd/HeadsetControl/releases/download/$HeadsetControlVersion/headsetcontrol-$HeadsetControlVersion.tar.gz" `
    -OutFile (Join-Path $out "headsetcontrol-$HeadsetControlVersion-source.tar.gz")

Get-ChildItem $out | Select-Object Name, Length
