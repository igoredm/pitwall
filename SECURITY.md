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

### LAN view and Home Assistant API (off by default)

The optional LAN server (port 48124, "View on phone or TV") is separate from the local control socket and **read-only**.
Since 1.2 it can also serve `GET /api/v1/state` for Home Assistant, only when both `remote.enabled` and
`remote.apiEnabled` are on (otherwise 404).

- Tokens are 256-bit random values; only their SHA-256 is stored, compared in constant time. API tokens are created only
  from the local settings page (`createApiToken`), never from the network, and shown once.
- **Token separation (decision):** integration tokens (`kind: "integration"`) are accepted **only** on the API and are
  rejected by the LAN WebSocket view; phone/TV tokens are **not** accepted on the API. A Home Assistant token sits in a
  plain config file and a phone token sits in browser storage, so each one only grants what its client needs, and revoking
  one never breaks the other.
- Wrong or missing tokens count toward the same per-IP limit as pairing (5 failures/min → 5-minute block, then 429).
- Responses carry `Cache-Control: no-store` and no CORS headers (other web pages can't read them, and the `Authorization`
  header doesn't survive a cross-origin preflight). The Host header must be an IP or this PC's name (DNS-rebinding defense).
- Plain HTTP on the LAN: don't forward the port to the internet. Guide: [docs/home-assistant.md](docs/home-assistant.md).

### Sensor list (bug reports)

"Copy sensor list" produces plain text with hardware names and readings. Machine name, user name, file paths, GUIDs, MAC
addresses and anything that looks like a serial number are removed before it leaves the app.

### Updater

Because the app is elevated, the updater is treated as the most sensitive part. It only talks to GitHub hosts over HTTPS,
checks every redirect, verifies the SHA-256 from the release's `SHA256SUMS.txt` on a write-locked file in an
admin-only folder, and verifies the Authenticode signature (same signer as the running build) when the build is signed.
Details: [docs/updater.md](docs/updater.md).

### Bundled third-party binaries

PresentMon and PawnIO are downloaded by the build from their official releases at pinned versions and verified by SHA-256;
the WebView2 bootstrapper is verified by Microsoft's Authenticode signature; Battery Hub is built from a reviewed commit of our fork
(only a windowless JSON reader, checked to import no network libraries). See `installer/fetch-deps.ps1`, `installer/build-battery.ps1` and
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

**Rede local e Home Assistant (desligados por padrão).** O servidor da rede (porta 48124) é somente leitura. A API
`GET /api/v1/state` só responde com `remote.enabled` e `remote.apiEnabled` ligados; o token (256 bits, guardado só como
SHA-256) é criado apenas pela tela local e mostrado uma vez. **Decisão:** token de integração só vale na API e não abre a
visualização (WebSocket); token de celular/TV não vale na API. Tokens errados entram no mesmo limite por IP do pareamento.
Sem CORS, `Cache-Control: no-store`. Não exponha a porta para a internet. Guia: [docs/home-assistant.md](docs/home-assistant.md).

A lista de sensores (para issues) sai sem nome do PC, usuário, caminhos, GUIDs, MACs e números de série.
