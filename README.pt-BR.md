# Pitwall

[English](README.md) · **Português**

Monitor de hardware para Windows que mostra um widget num monitor secundário — sem overlay e sem tocar no processo do jogo.
Uma alternativa leve ao MSI Afterburner/RTSS: FPS, 1% / 0.1% low, frametime, temperaturas (incluindo hot spot e memory junction da GPU),
clocks, consumo, RAM, bateria de mouse/headset sem fio, log CSV por sessão de jogo e ajuste opcional da GPU (power limit + clock máximo).

- **Seguro para anti-cheat:** o FPS vem do PresentMon (eventos ETW do Windows); nada é injetado no jogo.
- **Leve:** ~0,3% de CPU no app + ~1,3% no WebView2, ~50–80 MB.
- **5 temas** (Lumen, Mínimo, Neon, Terminal, Splash), claro/escuro, e 3 layouts (completo, médio, compacto).
- **Idiomas:** português e inglês (segue o Windows, ou escolha nas configurações).
Spec: [docs/spec.md](docs/spec.md) · Design: [docs/design-notes.md](docs/design-notes.md)

## Arquitetura

- `src/Pitwall` — .NET 10 WinForms (bandeja + janela WebView2), roda como administrador.
  - Sensores: LibreHardwareMonitorLib 0.9.6 (driver **PawnIO**, sem WinRing0).
  - FPS: `tools/PresentMon.exe` (Intel, ETW) lido pelo stdout; FPS, frametime, 1% e 0.1% low.
  - WebSocket `ws://localhost:48123/ws` (HttpListener) — snapshot a cada `refreshMs`.
  - CSV em `%LOCALAPPDATA%\Pitwall\logs`, todas as métricas disponíveis, `FlushFileBuffers` por linha.
  - Iniciar com o Windows: Agendador de Tarefas com "privilégios mais altos".
- `web` — Angular 22: widget (`#/widget`) e configurações (`#/settings`, carregada sob demanda), 5 temas
  (Lumen, Mínimo, Neon, Terminal, Splash) com tokens em `src/styles.scss`. Servido ao WebView2 via `https://pitwall.local`.
  - Métricas "Outros" (discos, placa-mãe, rede) só são lidas do hardware quando habilitadas.
- `installer` — Inno Setup: inclui PresentMon e instala PawnIO e WebView2 Runtime se faltarem.

## Desenvolvimento

```bash
cd web && npx ng build          # frontend -> web/dist (copiado para wwwroot no build .NET)
cd src/Pitwall && dotnet build  # app; rodar bin/Debug/.../Pitwall.exe (pede UAC)
```

- `Pitwall.exe --dump-sensors [arquivo]` lista todos os sensores e o mapeamento.
- Dev do frontend com dados ao vivo: `npx ng serve` e abrir `http://localhost:4200/?port=48123#/widget` com o app rodando.
  Pré-visualizar outro tema sem mudar a config: `?port=48123&theme=neon&mode=light#/widget`.
- Em Debug, `{"type":"quit"}` no WebSocket fecha o app (o processo é elevado).

## Instalador

```bash
powershell -ExecutionPolicy Bypass -File installer/fetch-deps.ps1      # PresentMon, PawnIO, WebView2 (versões fixas, verificadas)
powershell -ExecutionPolicy Bypass -File installer/build-battery.ps1   # WirelessBattery (requer MinGW) + HeadsetControl
powershell -ExecutionPolicy Bypass -File installer/build.ps1 -Version 0.1.0
```

Gera `artifacts/installer/Pitwall-Setup-<versão>.exe`.

O GitHub Actions (`.github/workflows/build.yml`) faz o mesmo a cada push; uma tag `v*` gera um rascunho de release com o instalador.

## Licença

Código do Pitwall: [MIT](LICENSE). `tools/battery-patches/` é GPL-3.0 (modifica o WirelessBattery).
Programas de terceiros empacotados: ver [installer/THIRD-PARTY-NOTICES.txt](installer/THIRD-PARTY-NOTICES.txt).
