# Pitwall

**English** · [Português](README.pt-BR.md)

A hardware monitor for Windows that shows a widget on a secondary monitor — no overlay, nothing touches the game process.
A lightweight alternative to MSI Afterburner/RTSS: FPS, 1% / 0.1% lows, frametime, temperatures (including GPU hot spot and
memory junction), clocks, power, RAM, wireless mouse/headset battery, a CSV log per game session and optional GPU tuning
(power limit + max clock).

- **Anti-cheat safe:** FPS comes from PresentMon (Windows ETW events); nothing is injected into the game.
- **Lightweight:** ~0.3% CPU for the app + ~1.3% for WebView2, ~50–80 MB.
- **5 themes** (Lumen, Mínimo, Neon, Terminal, Splash), light/dark, and 3 layouts (full, medium, compact).
- **Languages:** English and Portuguese (follows Windows, or pick one in Settings).

## Install

Download `Pitwall-Setup-<version>.exe` from [Releases](../../releases). The installer also sets up:

- [PresentMon](https://github.com/GameTechDev/PresentMon) (Intel, MIT) — FPS capture via ETW.
- [PawnIO](https://pawnio.eu) — signed driver used by LibreHardwareMonitor for CPU sensors (replaces the flagged WinRing0).
- Microsoft WebView2 Runtime, if missing.

Pitwall runs as administrator (sensors and ETW require it). "Start with Windows" uses a Task Scheduler task with highest privileges.

## Architecture

- `src/Pitwall` — .NET 10 WinForms (tray + WebView2 window).
  - Sensors: LibreHardwareMonitorLib 0.9.6 (PawnIO driver).
  - FPS: `tools/PresentMon.exe` read from stdout; FPS, frametime, 1% and 0.1% lows.
  - WebSocket `ws://localhost:48123/ws` (HttpListener, origin allowlist) — a snapshot every `refreshMs`.
  - CSV in `%LOCALAPPDATA%\Pitwall\logs`, flushed to disk on every line (useful when the PC crashes).
  - GPU tuning through NVIDIA's official NVML only; restored on exit, on game exit and after a crash.
  - Wireless battery: bundled [WirelessBattery](https://github.com/krisgfx9/Wireless-Device-Battery-Monitor) (built from a
    reviewed commit, plus our AULA driver in `tools/battery-patches`) and [HeadsetControl](https://github.com/Sapd/HeadsetControl).
- `web` — Angular 22: widget (`#/widget`) and settings (`#/settings`), served to WebView2 at `https://pitwall.local`.
- `installer` — Inno Setup script and build scripts.

## Building

Requirements: .NET 10 SDK, Node 24, Inno Setup 6, MinGW-w64 (for the battery reader).

```bash
cd web && npm ci && npx ng build
powershell -ExecutionPolicy Bypass -File installer/fetch-deps.ps1      # PresentMon, PawnIO, WebView2 (pinned, verified)
powershell -ExecutionPolicy Bypass -File installer/build-battery.ps1   # WirelessBattery + HeadsetControl
powershell -ExecutionPolicy Bypass -File installer/build.ps1 -Version 0.1.0
```

Output: `artifacts/installer/Pitwall-Setup-<version>.exe`. GitHub Actions (`.github/workflows/build.yml`) does the same on every
push; a `v*` tag creates a draft release with the installer and SHA-256 checksums.

Useful flags: `Pitwall.exe --dump-sensors [file]` lists every sensor and the mapping. For frontend dev with live data, run
`npx ng serve` and open `http://localhost:4200/?port=48123#/widget` with the app running (`&theme=neon&mode=light&lang=en` to preview).

## License

Pitwall's code: [MIT](LICENSE). `tools/battery-patches/` is GPL-3.0 (it modifies WirelessBattery).
Bundled third-party programs keep their own licenses — see [installer/THIRD-PARTY-NOTICES.txt](installer/THIRD-PARTY-NOTICES.txt).
