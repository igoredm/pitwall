# Compila o leitor de bateria de periféricos sem fio (Battery Hub, GPL-3.0) a partir de um commit revisado do nosso
# fork, github.com/igoredm/Wireless-Device-Battery-Monitor, branch "pitwall".
# Resultado em tools\battery\ (empacotado pelo instalador como programa separado, com licença e código-fonte).
#
# Desde a 1.5 é a versão em Rust do ferloom (v1.7.6), que reescreveu o Battery Hub original do krisgfx9. O branch
# "pitwall" do fork tem só dois acréscimos nossos (veja PITWALL-CHANGES.diff no zip de código-fonte):
#   * src/bin/json.rs: "batteryhub-json", uma leitura de todos os aparelhos em JSON (mesmos campos do --json antigo)
#     e sai; sem janela, sem bandeja, sem atualizador. É o único executável que compilamos;
#   * src/drivers/aula_infortech.rs: mouses AULA nos receptores 38A6 (Kunlun X5, L9, SC880, SC900 V2...).
# Revisão do caminho que entra nesse exe (leitura dos aparelhos, HID, Bluetooth/BLE, drivers): só fala com os
# aparelhos locais; não grava no registro, não abre processos e não acessa a rede. Ainda assim o binário final é
# conferido abaixo: importar qualquer DLL de rede faz o build falhar.
# A versão em Rust fala direto com os headsets, então o HeadsetControl deixou de ser necessário.
#
# Requer git e Rust (rustup, toolchain >= 1.99).
param(
    [string]$Commit = "96d9bf5b4683f029842c46994977264469c4e22e",
    # Hash da árvore de arquivos do commit revisado: garante o mesmo código, venha de onde vier
    [string]$Tree = "26a4b1f06ebbe6d72608b882f02ec6f4bdecc316",
    # Commit do ferloom em que o branch "pitwall" se baseia (tag v1.7.6): o diff das nossas mudanças sai daqui
    [string]$Base = "181b371c4c10301c6810acd18601a177085de95b",
    [string]$Repo = "https://github.com/igoredm/Wireless-Device-Battery-Monitor.git"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "tools\battery"
$work = Join-Path $env:TEMP "pitwall-battery-build"

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    $cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
    if (-not (Test-Path (Join-Path $cargoBin "cargo.exe"))) { throw "Rust não encontrado: winget install Rustlang.Rustup" }
    $env:PATH = "$cargoBin;$env:PATH"
}

Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory $work | Out-Null
Push-Location $work
try {
    git init -q
    git fetch -q --depth 2 $Repo $Commit
    if ($LASTEXITCODE) { throw "commit $Commit não encontrado em $Repo" }
    git checkout -q FETCH_HEAD
    if ($LASTEXITCODE) { throw "checkout de $Commit falhou" }
    if ((git rev-parse "HEAD^{tree}") -ne $Tree) { throw "o código do commit $Commit não é o revisado" }
    if ((git rev-parse "HEAD~1") -ne $Base) { throw "o commit $Commit não está logo acima da base $Base" }

    # --locked: as dependências ficam nas versões do Cargo.lock revisado. No exe só entra a família windows-* (Microsoft);
    # proc-macro2/quote/syn (macros do windows) e embed-resource/cc/toml (ícone e versão) só rodam na compilação.
    cargo build --release --locked --bin batteryhub-json
    if ($LASTEXITCODE) { throw "cargo build falhou" }
    $exe = Join-Path $work "target\release\batteryhub-json.exe"

    # Conferência no binário final: nenhuma DLL de rede importada
    $objdump = Get-Command objdump -ErrorAction SilentlyContinue
    if ($objdump) {
        $imports = & objdump -p $exe | Select-String "DLL Name: (.+)" | ForEach-Object { $_.Matches[0].Groups[1].Value.ToLower() }
    } else {
        $dumpbin = Get-ChildItem "${env:ProgramFiles}\Microsoft Visual Studio", "${env:ProgramFiles(x86)}\Microsoft Visual Studio" -Recurse -Filter dumpbin.exe -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match "Hostx64\\x64" } | Select-Object -First 1
        if (-not $dumpbin) { throw "objdump/dumpbin não encontrado para conferir as DLLs importadas" }
        $imports = & $dumpbin.FullName /nologo /imports $exe | Select-String "^\s+(\S+\.dll)\s*$" | ForEach-Object { $_.Matches[0].Groups[1].Value.ToLower() }
    }
    if (-not $imports -or -not ($imports -contains "hid.dll")) { throw "não consegui ler as DLLs importadas" }
    $net = @($imports | Where-Object { $_ -match "winhttp|wininet|urlmon|ws2_32|wsock32|webio|dnsapi|iphlpapi|mswsock" })
    if ($net.Count) { throw "batteryhub-json.exe importa $($net -join ', ')" }

    New-Item -ItemType Directory -Force $out | Out-Null
    # Restos das versões anteriores (C++ até a 1.4, nome antigo até a 1.2.1, HeadsetControl até a 1.4)
    Remove-Item (Join-Path $out "WirelessBattery.exe"), (Join-Path $out "WirelessBattery-source-*.zip"), `
        (Join-Path $out "BatteryHub-source-*.zip"), (Join-Path $out "headsetcontrol*") -ErrorAction SilentlyContinue
    # O Pitwall chama tools\battery\BatteryHub.exe --json (o argumento é ignorado por este exe)
    Copy-Item $exe (Join-Path $out "BatteryHub.exe") -Force
    Copy-Item LICENSE (Join-Path $out "LICENSE-GPL-3.0.txt") -Force
    # GPL: o código-fonte correspondente (com as nossas mudanças) e o diff delas vão junto
    $zip = Join-Path $out "BatteryHub-source-$($Commit.Substring(0,7))-pitwall.zip"
    git archive --format=zip -o $zip HEAD
    if ($LASTEXITCODE) { throw "git archive falhou" }
    git diff --output=PITWALL-CHANGES.diff $Base HEAD
    Compress-Archive -Path PITWALL-CHANGES.diff -DestinationPath $zip -Update
}
finally {
    Pop-Location
}

Get-ChildItem $out | Select-Object Name, Length
