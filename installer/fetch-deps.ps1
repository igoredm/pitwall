# Baixa as dependências binárias de terceiros que o instalador empacota (não ficam no repositório).
# Versões fixas, conferidas por SHA-256; o bootstrapper do WebView2 muda sem versão, então é conferido pela
# assinatura Authenticode da Microsoft.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$deps = @(
    @{ Url = "https://github.com/GameTechDev/PresentMon/releases/download/v2.6.0/PresentMon-2.6.0-x64.exe"
       Out = "tools\PresentMon.exe"; Sha256 = "b2a706bc6ad475749e3b7e3409263aa1e6906d45bdcf993f6dbc0f660188f1af" },
    @{ Url = "https://github.com/namazso/PawnIO.Setup/releases/download/2.2.0/PawnIO_setup.exe"
       Out = "installer\redist\PawnIO_setup.exe"; Sha256 = "1f519a22e47187f70a1379a48ca604981c4fcf694f4e65b734aaa74a9fba3032" },
    @{ Url = "https://go.microsoft.com/fwlink/p/?LinkId=2124703"
       Out = "installer\redist\MicrosoftEdgeWebview2Setup.exe"; Signer = "Microsoft Corporation" }
)

foreach ($d in $deps) {
    $path = Join-Path $root $d.Out
    New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null
    if (-not (Test-Path $path)) {
        Write-Host "baixando $($d.Url)"
        Invoke-WebRequest $d.Url -OutFile $path -UseBasicParsing
    }
    if ($d.Sha256) {
        $hash = (Get-FileHash $path -Algorithm SHA256).Hash.ToLower()
        if ($hash -ne $d.Sha256) { Remove-Item $path; throw "hash inesperado em $($d.Out): $hash" }
    } else {
        $sig = Get-AuthenticodeSignature $path
        if ($sig.Status -ne "Valid" -or $sig.SignerCertificate.Subject -notmatch [regex]::Escape($d.Signer)) {
            Remove-Item $path; throw "assinatura inválida em $($d.Out): $($sig.Status) $($sig.SignerCertificate.Subject)"
        }
    }
    Write-Host "ok  $($d.Out)"
}
