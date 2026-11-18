# Security policy

**English** · [Português](#português)

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Use GitHub's private vulnerability reporting: go to the repository's **Security** tab →
**Report a vulnerability** (<https://github.com/igoredm/pitwall/security/advisories/new>).
Include the Pitwall version, Windows version, steps to reproduce and, if possible, a proof of concept.

You should get a first answer within 7 days. Fixes are released as a new version through the normal release channel
(and the in-app updater); the advisory is published after the fix is available, crediting you unless you prefer otherwise.

Only the latest release is supported.

## Why Pitwall runs as administrator, and what it does with it

Pitwall's manifest requests elevation (`requireAdministrator`). It needs it for:

| What | Why it needs admin |
|---|---|
| CPU/motherboard sensors (LibreHardwareMonitor via the signed **PawnIO** driver) | Reading MSRs and SMBus goes through a kernel driver. |
| FPS capture (**PresentMon**, ETW) | Starting a real-time ETW trace session for DXGI/D3D present events. Nothing is injected into the game. |
| Optional GPU tuning (NVIDIA **NVML**) | Setting the power limit and locking max clocks. Off by default; restored on exit, on game exit and after a crash. |
| "Start with Windows" | A Task Scheduler task with highest privileges (so the app starts elevated without a UAC prompt). |

What it does **not** do:

- No telemetry, analytics or accounts. The only outgoing network request is the update check to
  `api.github.com` (User-Agent `Pitwall-Updater`, no user data) and, after you agree to update, the download from GitHub.
- No code injection, no overlay, no access to game memory.
- The local WebSocket (`localhost:48123`) only accepts connections with a per-run random token and the app's own origin.
- The CSV log folder cannot be pointed at system or network folders.

### Updater

Because the app is elevated, the updater is treated as the most sensitive part. It only talks to GitHub hosts over HTTPS,
checks every redirect, verifies the SHA-256 from the release's `SHA256SUMS.txt` on a write-locked file in an
admin-only folder, and verifies the Authenticode signature (same signer as the running build) when the build is signed.
Details: [docs/updater.md](docs/updater.md).

### Bundled third-party binaries

PresentMon and PawnIO are downloaded by the build from their official releases at pinned versions and verified by SHA-256;
the WebView2 bootstrapper is verified by Microsoft's Authenticode signature; WirelessBattery is built from a reviewed commit
and HeadsetControl is pinned by hash. See `installer/fetch-deps.ps1`, `installer/build-battery.ps1` and
[installer/THIRD-PARTY-NOTICES.txt](installer/THIRD-PARTY-NOTICES.txt).

---

## Português

**Não abra uma issue pública** para problemas de segurança. Use o relato privado do GitHub: aba **Security** →
**Report a vulnerability** (<https://github.com/igoredm/pitwall/security/advisories/new>), com versão do Pitwall, versão do
Windows e passos para reproduzir. Resposta inicial em até 7 dias; só a última versão recebe correções.

O Pitwall roda como administrador para: ler sensores da CPU pelo driver assinado PawnIO, capturar FPS por ETW (PresentMon,
sem injetar nada no jogo), aplicar o ajuste opcional da GPU via NVML e criar a tarefa agendada de "Iniciar com o Windows".
Não há telemetria; a única conexão de saída é a verificação de atualização no GitHub (sem dados do usuário) e, com o seu
consentimento, o download do instalador, que é verificado por SHA-256 e assinatura antes de rodar
(ver [docs/updater.md](docs/updater.md)).
