<img src="assets/logo/pitwall-256.png" width="96" alt="" align="right">

# Pitwall

**English** · [Português](README.pt-BR.md)

A hardware monitor for Windows that shows a widget on a secondary monitor — no overlay, nothing touches the game process.
A lightweight alternative to MSI Afterburner/RTSS: FPS, 1% / 0.1% lows, frametime, temperatures (including GPU hot spot and
memory junction), clocks, power, RAM, wireless mouse/headset battery, a CSV log per game session and optional GPU tuning
(power limit + max clock).

- **Anti-cheat safe:** FPS comes from PresentMon (Windows ETW events); nothing is injected into the game.
- **Lightweight:** ~0.3% CPU for the app + ~1.3% for WebView2, ~50–80 MB.
- **5 themes** (Lumen, Mínimo, Neon, Terminal, Splash), light/dark, and 5 layouts (full, medium, compact, plus
  **strip** for ultrawide bars and **mini** for 5–8" screens).
- **Monitor:** every sensor live with a recent graph, min/max and why a sensor has no reading.
- **PC report:** when the PC shuts off or blue-screens, the last 2 minutes of readings plus that hour's Windows events.
- **Game reports:** every match with FPS, stutters, markers and temperatures; compare two matches or share a PNG card.
- **Hotkeys** (show/hide the widget, mark a moment) and a read-only **Home Assistant** API.
- **Languages:** English and Portuguese (follows Windows, or pick one in Settings).

## Screenshots

![Widget, full layout, Lumen dark theme, live demo values](docs/screenshots/widget.gif)

| | |
|---|---|
| ![Monitor: every sensor live with graph, min and max](docs/screenshots/settings-monitor.png) | ![PC report: the last 2 minutes before the PC shut off, with Windows events](docs/screenshots/settings-pc-report.png) |
| ![Game report: the whole match with markers and stutters](docs/screenshots/settings-game-report.png) | ![Comparing two matches side by side](docs/screenshots/settings-compare.png) |
| ![Share card: 1200×630 PNG of a match](docs/screenshots/share-card.png) | ![Settings: Overview with the widget preview](docs/screenshots/settings-overview.png) |
| ![Widget, strip layout for ultrawide bar screens](docs/screenshots/widget-strip-lumen-dark.png) | ![Widget, mini layout for small screens](docs/screenshots/widget-mini-lumen-dark.png) |

More in [docs/screenshots](docs/screenshots) (every widget theme, medium and compact layouts, Settings in light and dark, phone and TV pairing, the first-run tour).

## Install

Download `Pitwall-Setup-<version>.exe` from [Releases](../../releases). The installer also sets up:

- [PresentMon](https://github.com/GameTechDev/PresentMon) (Intel, MIT) — FPS capture via ETW.
- [PawnIO](https://pawnio.eu) — signed driver used by LibreHardwareMonitor for CPU sensors (replaces the flagged WinRing0).
- Microsoft WebView2 Runtime, if missing.

Pitwall runs as administrator (sensors and ETW require it). "Start with Windows" uses a Task Scheduler task with highest privileges.

## Is it safe?

Short version: Pitwall only reads. It never touches the game, and everything it runs is open source and built in public CI.

- **Anti-cheat:** no overlay, no DLL injection, no reading of game memory. FPS comes from Windows ETW events through
  Intel's PresentMon, the same data Windows already produces for every app. Tested daily with EA FC (EA Javelin). No
  anti-cheat vendor certifies third-party tools, but there is nothing in the game process for one to detect. If an
  anti-cheat blocks ETW, Pitwall just shows "FPS —" with the reason and keeps the temperatures.
- **Why administrator:** CPU/motherboard sensors (through the signed [PawnIO](https://pawnio.eu) driver), the ETW session
  for FPS and the optional NVIDIA power limit all require it. "Start with Windows" uses a Task Scheduler task so there is no
  UAC prompt every boot.
- **Not code-signed (yet):** Windows SmartScreen may warn on the first run (*More info → Run anyway*). Every installer is
  built by the [public GitHub Actions workflow](.github/workflows/build.yml) and its SHA-256 is in `SHA256SUMS.txt` on the
  release. The built-in updater checks that hash before installing.
- **GPU tuning is off by default** and uses only NVIDIA's official NVML API. Nothing is written to the card's firmware;
  limits are undone when the game or Pitwall closes (and after a crash, on the next start).
- **Network:** no telemetry, no account. The only outbound request is the update check against GitHub. The phone/TV view
  and the Home Assistant endpoint are off by default, local network only and read-only.
- **Found a problem?** See [SECURITY.md](SECURITY.md) (private vulnerability reporting is on).

## Architecture

- `src/Pitwall` — .NET 10 WinForms (tray + WebView2 window).
  - Sensors: LibreHardwareMonitorLib 0.9.6 (PawnIO driver).
  - FPS: `tools/PresentMon.exe` read from stdout; FPS, frametime, 1% and 0.1% lows.
  - WebSocket `ws://localhost:48123/ws` (HttpListener, per-run token + origin allowlist) — a snapshot every `refreshMs`.
    Full message reference: [docs/protocol.md](docs/protocol.md).
  - Optional phone view on the LAN (off by default): a separate, read-only server on port 48124 with device pairing.
  - CSV in `%LOCALAPPDATA%\Pitwall\logs`, flushed to disk on every line (useful when the PC crashes); old logs are pruned
    (30 days / 500 MB by default). A crash report shows the last 60 s before an unexpected shutdown.
  - GPU tuning through NVIDIA's official NVML only; restored on exit, on game exit and after a crash.
  - Wireless battery: bundled [WirelessBattery](https://github.com/krisgfx9/Wireless-Device-Battery-Monitor) (built from a
    reviewed commit, plus our AULA driver in `tools/battery-patches`) and [HeadsetControl](https://github.com/Sapd/HeadsetControl).
- `web` — Angular 22: widget (`#/widget`) and settings (`#/settings`), served to WebView2 at `https://pitwall.local`.
- `tests/Pitwall.Tests` — xUnit (`dotnet test`).
- `installer` — Inno Setup script and build scripts.

## Building

Requirements: .NET 10 SDK, Node 24, Inno Setup 6, MinGW-w64 (for the battery reader).

```bash
cd web && npm ci && npx ng build
powershell -ExecutionPolicy Bypass -File installer/fetch-deps.ps1      # PresentMon, PawnIO, WebView2 (pinned, verified)
powershell -ExecutionPolicy Bypass -File installer/build-battery.ps1   # WirelessBattery + HeadsetControl
powershell -ExecutionPolicy Bypass -File installer/build.ps1 -Version 0.7.0
```

Output: `artifacts/installer/Pitwall-Setup-<version>.exe`. GitHub Actions (`.github/workflows/build.yml`) does the same on every
push; a `v*` tag creates a draft release with the installer and SHA-256 checksums.

Useful flags: `Pitwall.exe --dump-sensors [file]` lists every sensor and the mapping. For frontend dev with live data, run
`npx ng serve` and open `http://localhost:4200/?port=48123#/widget` with the app running (`&theme=neon&mode=light&lang=en` to preview).

## Code signing

Releases are **not code-signed yet**, so Windows SmartScreen may warn on first run (*More info → Run anyway*).
Every release is built by the public GitHub Actions workflow in this repository (`.github/workflows/build.yml`) from the
tagged commit, and each release lists the installer's SHA-256 in `SHA256SUMS.txt`; the built-in updater checks that hash
before installing. Third-party programs bundled in the installer keep their own signatures and licenses
(see [installer/THIRD-PARTY-NOTICES.txt](installer/THIRD-PARTY-NOTICES.txt)).

## Privacy

Pitwall does not collect or transfer any personal data and has no telemetry. It only connects to the internet to check
GitHub Releases for updates (no user data is sent; it can be turned off in Settings › App) and, after you agree, to
download the update from GitHub. Sensor data, logs and settings stay on your PC (`%APPDATA%\Pitwall`,
`%LOCALAPPDATA%\Pitwall`). The optional phone/TV view is off by default and only reachable from your local network,
after pairing with a code.

## License

Pitwall's code: [MIT](LICENSE). `tools/battery-patches/` is GPL-3.0 (it modifies WirelessBattery).
Bundled third-party programs keep their own licenses — see [installer/THIRD-PARTY-NOTICES.txt](installer/THIRD-PARTY-NOTICES.txt).
