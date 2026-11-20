# 1.2.0 — contrato entre as frentes

Documento de trabalho da 1.2.0. Backend, frontend e design implementam contra isto. Tipos TS em `web/src/app/models.ts`
(seção "1.2"), config C# em `src/Pitwall/Config/AppConfig.cs` (config **v8**). Ao terminar, cada frente registra o que
mudou em `docs/protocol.md` (seção 10).

## Regras que não mudam
- Nada injeta ou toca no processo do jogo (anti-cheat). Atalhos globais = `RegisterHotKey` (API do Windows), nada de hook de teclado.
- CPU < 1% em jogo: nada novo roda em loop quente; o que é caro (Event Log, leitura de CSV) roda sob demanda ou a cada ≥ 10 min.
- PT-BR + EN em tudo (`L.T(pt,en)` no C#, dicionários `ptBR`/`en` em `i18n.ts`).
- Visual do app = tokens da 1.0 (`docs/design-notes.md` › v1.0). Sem gradiente, brilho ou blur.
- Commits com a identidade git configurada, **sem** `Co-Authored-By` nem menção ao Claude.

## Navegação (nova)

| Grupo | Página (id) | PT | EN |
|---|---|---|---|
| — | `overview` | Visão geral | Overview |
| PC | `monitor` | Monitor | Monitor |
| PC | `health` | Relatório do PC | PC report |
| Widget | `widget`, `metrics`, `alerts` | (iguais) | |
| Jogo | `games` | Jogos | Games |
| Jogo | `sessions` | **Relatórios de jogo** | **Game reports** |
| Jogo | `gpu` | Ajuste da GPU | GPU tuning |
| Pitwall | `devices`, `features`, `app` | (iguais) | |

- **Monitor**: tudo ao vivo, em tela cheia (largura toda): estado (jogo, FPS e o motivo quando não há, motivo do clock,
  ajuste da GPU, uptime), grupos GPU · CPU · RAM · FPS · Discos · Rede · Bateria, cada sensor com valor, cor do limite,
  gráfico dos últimos 1/5/15 min, mín/máx desde que o app abriu, e "sem leitura" **com o motivo** quando falta.
  Ações: [Copiar leituras] (texto), [Marcar momento] (marcador). Só calcula enquanto a página está visível.
- **Relatório do PC** (`health`): quedas e desligamentos (com ou sem jogo) — "Última queda" com os últimos 2 min antes,
  a tabela das **últimas medições** de todos os sensores, [Copiar como texto] [Copiar para fórum] [Salvar .txt];
  eventos do Windows encontrados (Kernel-Power 41, desligamento inesperado 6008, BugCheck com código, WHEA, driver de
  vídeo reiniciado / TDR) **sem diagnóstico**, só o que cada um quer dizer; histórico de incidentes; "Agora": ligado há X.
  Âncoras: `latest`, `events`, `history`.
- **Relatórios de jogo** (`sessions`): última sessão (agora com engasgos, marcadores, médias), [Compartilhar] (card PNG +
  texto), **Comparar** duas sessões, histórico, gravação em CSV. Se a sessão terminou numa queda: linha "Terminou numa
  queda do PC → Ver relatório do PC". O bloco de queda sai daqui. Âncoras: `last`, `compare`, `history`, `csv`.
- Deep links antigos: `sessions/crash` → `health/latest`.

## Config v8 (novos campos, todos com padrão)
```jsonc
"hotkeys": { "enabled": true, "toggleWidget": "Ctrl+Alt+P", "marker": "Ctrl+Alt+M" },
"features": { ..., "stutters": true },          // contar engasgos na sessão
"remote":   { ..., "apiEnabled": false },        // endpoint de leitura p/ Home Assistant (precisa remote.enabled)
"widget":   { ..., "layout": "auto|full|mid|compact|strip|mini" }
```
`features.crashReport` passa a cobrir o Relatório do PC (buffer sempre ligado, com ou sem jogo).
Formato dos atalhos: `Ctrl+Alt+Shift+Win+<tecla>` (tecla = A–Z, 0–9, F1–F24); vazio = desligado.

## Protocolo (cliente → servidor)
| tipo | campos | resposta |
|---|---|---|
| `getPcReport` | — | `pcReport` |
| `getPcIncident` | `id` | `pcIncident` |
| `dismissPcIncident` | `id` | novo `pcReport` (e some do catálogo `pcPending`) |
| `getSessionSeries` | `start` (ISO da sessão), `points?` (padrão 120) | `sessionSeries` |
| `addMarker` | `note?` | broadcast `marker` |
| `getSensorDump` | — | `sensorDump` |
| `createApiToken` | `name` | `apiToken` (token mostrado uma vez) + `devices` |

## Protocolo (servidor → cliente)
- `catalog` ganha: `hardware.ramGb?`, `hardware.os?`, `hardware.gpuDriver?`; `pcPending?: PcIncidentSummary`
  (incidente novo não visto); `hotkeys?: HotkeyStatus`; em cada `MetricDef`: `missing?: MissingReason`, `missingText?`.
- `snapshot`/texts: `texts["fps.reason"]` = `FpsReason` quando não há FPS (ver tipos).
- `pcReport`, `pcIncident`, `sessionSeries`, `marker`, `sensorDump`, `apiToken` — tipos em `models.ts`.
- `GameSession` ganha: `avgGpuTemp, avgHotspot, avgGpuPower, avgGpuClock, avgGpuLoad, avgCpuTemp, avgCpuLoad, peakCpuTemp,
  stutters, markers[{ t, at, note?, via? }], animErrorMs?, pcLatencyMs?, endedByCrash?, incidentId?, gpu?, cpu?`.
- Métricas novas no catálogo (desligadas no widget por padrão): `fps.stutters` (engasgos na sessão), `fps.animError`
  (ms, PresentMon 2.x `MsAnimationError`, média do |erro| em 1 s), `fps.pcLatency` (ms, `MsPCLatency`, se existir).

## Engasgo (definição única)
Frame renderizado com `ft ≥ max(2,5 × mediana dos últimos 120 frames, mediana + 10 ms)`, ignorando os primeiros 10 s
da sessão. Conta por sessão; `stuttersPerMin` é derivado no front.

## Buffer do PC (sempre ligado com features.crashReport)
`%LOCALAPPDATA%\Pitwall\pc-ring.json`: 1 amostra/s, **120 s**, séries `PcSeriesId`; grava a cada 5 s em jogo e 10 s fora,
com escrita atômica (WriteThrough + rename) e `last` = todas as métricas na última gravação. Saída normal (sair, logoff,
desligar pelo Windows: `SystemEvents.SessionEnding` / `WM_ENDSESSION`) grava `cleanExit: true`. Ao abrir: sem `cleanExit` +
boot depois de `savedAt` = **desligamento abrupto** → incidente; com eventos do Windows perto (±10 min) anexados.
Boot antes de `savedAt` = o Pitwall fechou sozinho (não é queda do PC; não vira incidente).
Incidentes em `%LOCALAPPDATA%\Pitwall\incidents\<id>.json`, guarda os 20 mais novos.
Eventos do Windows (log System, 30 dias, ≤ 200): Kernel-Power 41, EventLog 6008, BugCheck 1001 (código), WHEA-Logger
(todos; `fatal` se nível Erro/Crítico), Display 4101 e nvlddmkm 13/14/153 (TDR). Lido ao abrir, ao pedir `getPcReport`
e no máximo a cada 10 min.

## Atalhos
- Alternar widget: mostra/esconde (igual à bandeja). Marcador: grava no CSV (coluna `marker`, 1 na linha) e na sessão
  aberta (`markers`), ou só no buffer do PC fora de jogo; aviso curto na bandeja "Marcador 3 · 21:14:05".
- Falha ao registrar (atalho em uso) → `catalog.hotkeys.<nome> = "inUse"`.

## Home Assistant
`GET http://<pc>:48124/api/v1/state` com `Authorization: Bearer <token>`; só se `remote.enabled && remote.apiEnabled`.
Resposta: `{ version, time, game, values: { "<id>": { name, value, unit } } }`. Somente leitura. Token criado em
Celular e TV › Integrações (`createApiToken`), guardado como aparelho `kind: "integration"` (só o hash). Mesmo limite de
taxa do pareamento para tokens errados. Documentar em `docs/home-assistant.md` com o YAML do sensor REST.

## Widget
Layouts novos: `strip` (faixa larga, ≥ 3:1 — Xeneon Edge 2560×720, 1920×480) e `mini` (telinha 5"/7": 800×480,
1024×600, 480×320). O Automático escolhe por proporção e tamanho. Picos com unidade ("máx 101 °C").

## Assistente
Um monitor só → o passo 1 oferece "Ver no celular ou na TV" (leva a Celular e TV) e "Deixar no canto da tela" (compacto).
