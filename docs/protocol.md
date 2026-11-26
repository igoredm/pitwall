# Pitwall — protocolo WebSocket (v0.7 + 1.0)

Referência para o frontend (Angular, `web/`). Os tipos TypeScript estão em `web/src/app/models.ts`
(`ServerMessage`, `ClientMessage`, `RemoteServerMessage`, `RemoteClientMessage`). O que é novo na 0.7 vem marcado com **[0.7]**;
o que mudou para a 1.0 está resumido na seção [7. Pitwall 1.0](#7-pitwall-10) (e marcado com **[1.0]** onde altera o texto antigo).

Há **dois** sockets, com regras diferentes:

| | Socket local (controle) | Socket da rede (celular) **[0.7]** |
|---|---|---|
| URL | `ws://localhost:48123/ws?token=<token>` (`127.0.0.1` também) | `ws://<ip-do-pc>:48124/ws` |
| Quem usa | widget e configurações (WebView2) | página `#/mobile` aberta no celular |
| Escuta em | só loopback | todas as interfaces (firewall: só sub-rede local) |
| Ligado | sempre | só com `remote.enabled = true` (padrão: desligado) |
| Autenticação | token da execução na query + `Origin` do app | 1ª mensagem `auth` (token do dispositivo) ou `pair` (código) |
| Mensagens do cliente | todas da seção 3 | só `auth`/`pair` (1ª) e `ping`; o resto é ignorado |
| Dados | tudo | catálogo, config e snapshot **sanitizados** |

Convenções: JSON UTF-8, uma mensagem por frame de texto, nomes em camelCase. Campos `null` normalmente são **omitidos**
(exceto dentro de `snapshot`, onde `values`/`texts` mandam `null` explícito). Datas são ISO 8601 com fuso
(`"2026-11-18T21:04:05.123-03:00"`); `t` é epoch em ms.

---

## 1. Socket local — conexão

- Porta: `config.webSocketPort` (padrão 48123). A página recebe `?port=<porta>&token=<token>` na URL do WebView2.
- O servidor recusa com HTTP 403 se: o caminho não for `/ws`, faltar `Origin` ou ele não for `https://pitwall.local`
  (em Debug também `http://localhost:4200`), ou o `token` não for o desta execução (256 bits, muda a cada abertura do app).
- Ao conectar, o servidor manda, nesta ordem: `catalog`, `config`, `sessions`, `extremes` **[0.7]**. Depois, um `snapshot`
  a cada `config.refreshMs`.
- Respostas a pedidos (`startPairing`, `listDevices`, `getState`, erros) vão **só para quem pediu**; o resto é broadcast.

## 2. Socket local — servidor → cliente

### 2.1 `catalog`
Enviado ao conectar, quando o idioma muda, quando o relatório de crash aparece/some e quando o servidor do celular liga/desliga.

| Campo | Tipo | |
|---|---|---|
| `lang` | `"pt-BR" \| "en"` | idioma efetivo |
| `version` | `string` | ex.: `"0.7.0"` |
| `admin` | `boolean` | |
| `presentMon` | `boolean` | PresentMon presente |
| `battery` | `boolean` | leitor de bateria presente |
| `hardware` | `{ cpu?, gpu?, gpu2? }` | nomes |
| `monitors` | `MonitorInfo[]` | |
| `metrics` | `MetricDef[]` | `{ id, group, name, unit, isTemperature, available, source?, defaultWarn?, defaultCrit? }` |
| `tuning` | `TuningCaps` | |
| `tuningPresets` | `{ balanced, cool: { powerW, clockMhz } }` | |
| `crashReport` **[0.7]** | `CrashReport?` | ver 2.6 |
| `remote` **[0.7]** | `{ running: boolean, port?: number, error?: string }` | estado do servidor do celular |

Métricas novas no catálogo **[0.7]**:
- `fps.displayed` (unit `fps`, opcional): FPS que chegou à tela.
- `gpu.perfcap` (unit `text`): agora disponível em NVIDIA (fonte NVML). O valor vem em `snapshot.texts`, não em `values`.

### 2.2 `config`
`{ type: "config", config: AppConfig }` — enviado ao conectar e a cada mudança (de qualquer origem: página, bandeja, backend).
Campos novos **[0.7]** (sempre presentes; o backend corrige `null` e valores fora da faixa):

```jsonc
{
  "log": { "enabled": true, "folder": "C:\\Users\\...\\Pitwall\\logs", "intervalMs": 1000,
           "keepDays": 30,      // [1.0] só 1 | 5 | 15 | 30 | 90 | 0 (0 = para sempre); ver 7.1
           "maxTotalMb": 500 }, // 0 = sem teto
  "games": { "autoDetect": true, "include": [], "ignore": ["explorer.exe", "..."],
             "profiles": { "FC25.exe": { "tuningPreset": "cool", "layout": "compact" } },
             "dismissedSuggestions": ["Slack.exe"] },
  "firstRunDone": true,  // assistente de primeira execução concluído; instalação nova = false (config v5)
  "alerts": { "enabled": false, "sound": false, "minIntervalMin": 5 },   // 1–1440
  "remote": { "enabled": false, "port": 48124,
              "pairedDevices": [ { "id": "04388cc23d523135", "name": "Pixel 8", "created": "2026-11-18T21:04:05-03:00" } ] }
}
```

- `games.profiles[exe]`: `tuningPreset?: "off"|"balanced"|"cool"|"custom"`, `layout?: "auto"|"full"|"mid"|"compact"`.
  Valor ausente = usa a config geral. Chave sem diferenciar maiúsculas. Valores inválidos são descartados.
- `remote.pairedDevices` é **somente leitura** para a página: vem sem o hash do token e é ignorado no `setConfig`
  (muda só por `startPairing`/`revokeDevice`). `remote.port` precisa ser 1024–65535 e diferente de `webSocketPort`.

### 2.3 `sessions`
`{ type: "sessions", sessions: GameSession[] }` — ao conectar e quando um jogo começa/termina (até 20, mais recente primeiro).

| Campo | Tipo | |
|---|---|---|
| `exe`, `start`, `end?` | | como antes; `end` ausente = em andamento ou o PC caiu |
| `durationSec?` **[0.7]** | `number` | |
| `avgFps?`, `low1?`, `low01?` **[0.7]** | `number` | sessão inteira (histograma, não janela de 30 s) |
| `peakGpuTemp?`, `peakHotspot?`, `peakHotspotDelta?`, `peakGpuPower?` **[0.7]** | `number` | °C / W |
| `secondsAboveWarn?` **[0.7]** | `Record<id, number>` | s com valor ≥ amarelo (inclui o tempo no vermelho) |
| `secondsAboveCrit?` **[0.7]** | `Record<id, number>` | s com valor ≥ vermelho |
| `csvFile?` **[0.7]** | `string` | nome do CSV (sem pasta) |

As estatísticas são atualizadas a cada ~30 s durante a sessão e no fim (a lista só é reenviada quando uma sessão começa/termina).
Sessões de menos de 30 s são descartadas. `sessions.json` antigo continua válido (campos novos ausentes).

### 2.4 `snapshot`
A cada `refreshMs`.

| Campo | Tipo | |
|---|---|---|
| `t` | `number` | epoch ms |
| `game` | `{ exe, mode } \| null` | |
| `values` | `Record<id, number \| null>` | 2 casas |
| `texts` **[0.7]** | `Record<id, string \| null>` | `gpu.perfcap`: `thermal \| power \| voltage \| idle \| sync \| none` |
| `extremes?` **[0.7]** | `{ epoch: number, values: Record<id, [min, max]> }` | ver 2.5 |
| `profile` **[0.7]** | `{ exe, tuningPreset?, layout? } \| null` | perfil do jogo atual |
| `gameSuggestion` **[0.7]** | `{ exe } \| null` | "Marcar como jogo?" |
| `frames?` | `number[]` | frametimes desde o último snapshot (só com `fps.graph` ligado) |
| `fpsStatus` | `string \| null` | motivo legível de não haver FPS (ex.: bloqueio do anti-cheat do EA FC) |
| `presentMonError` | `string \| null` | só quando o PresentMon não existe |
| `batteries` | `WirelessDevice[] \| null` | |
| `tuning` | `TuningStatus` | ajuste **efetivo** (inclui o do perfil) |
| `log` | `{ file, size } \| null` | |

FPS **[0.7]**: o PresentMon agora roda com as métricas v2 e rastreio até a tela.
- `fps.current`, `fps.frametime`, `fps.low1`, `fps.low01`, `fps.avg` = frames **renderizados/apresentados** pelo jogo.
  Frames que o PresentMon marca como gerados (coluna `FrameType` ≠ `Application`, ex.: Intel XeFG, AMD AFMF) não contam aqui.
- `fps.displayed` = frames que **chegaram à tela** (inclui os gerados; descartados não contam). Em jogo em janela composto
  pelo DWM fica limitado à taxa do monitor. `null` quando o PresentMon caiu para o formato v1.
- DLSS Frame Generation: os frames gerados passam pelo `Present` do jogo, então o PresentMon só os separa se o driver
  marcar o `FrameType`. Sem essa marca, `fps.current` inclui os gerados (como antes) e `fps.displayed` ≈ `fps.current`.

Layout por perfil: se `profile.layout` existir, o widget deve usá-lo **no lugar** de `config.widget.layout` enquanto o jogo roda.
Nada é gravado no config; quando o jogo fecha, `profile` volta a `null`.

### 2.5 `extremes` **[0.7]**
Mín/máx por métrica desde o início da sessão de jogo (ou do último `resetExtremes`). Inclui todas as métricas numéricas de `values`.

- Mensagem completa `{ type: "extremes", epoch, values }`: ao conectar e após `resetExtremes`.
- Parcial em `snapshot.extremes`: só as métricas que mudaram, no máximo 1x por segundo; ausente quando nada mudou.
- Regra do cliente: se `epoch` ≠ epoch guardado → descartar tudo e começar do que veio; senão, sobrescrever as chaves recebidas.
- Zera sozinho quando um jogo começa (o epoch muda).

```json
{ "type": "extremes", "epoch": 3, "values": { "gpu.temp": [61, 79.5], "gpu.hotspot": [74, 98.2], "fps.current": [88.4, 165.1] } }
```

### 2.6 `crashReport` (no `catalog`) **[0.7]**
Calculado uma vez ao abrir o app (em segundo plano; o `catalog` é reenviado quando fica pronto). Existe se a última sessão de
`sessions.json` não terminou, **ou** se o log System do Windows tem Kernel-Power 41 depois do início dela — e o usuário ainda
não dispensou o relatório dessa sessão. A bandeja mostra um balão; clicar abre as configurações.

| Campo | Tipo | |
|---|---|---|
| `reason` | `"unfinishedSession" \| "kernelPower41" \| "both"` | |
| `session` | `GameSession` | |
| `time` | `string` | hora estimada (última gravação do buffer; senão o evento; senão o início da sessão) |
| `kernelPowerTime?` | `string` | |
| `intervalMs` | `number` | 1000 |
| `series?` | `Record<"gpu.temp"\|"gpu.hotspot"\|"gpu.power"\|"gpu.clock"\|"fps.current"\|"cpu.temp", (number\|null)[]>` | até 60 pontos, mais antigo primeiro; só quando a sessão não terminou e o buffer é dela |
| `csvFile?` | `string` | |

Uma sessão também fica "sem fim" se o app for morto no meio do jogo (ex.: Gerenciador de Tarefas) — por isso o `reason`.

```json
{ "reason": "both", "session": { "exe": "FC25.exe", "start": "2026-10-22T21:00:00-03:00", "csvFile": "pitwall_2026-10-22_21-00-00_FC25.csv" },
  "time": "2026-10-22T21:42:10-03:00", "kernelPowerTime": "2026-10-22T21:44:31-03:00", "intervalMs": 1000,
  "series": { "gpu.hotspot": [104.1, 104.6, 105.2], "fps.current": [143.2, 141.9, null] },
  "csvFile": "pitwall_2026-10-22_21-00-00_FC25.csv" }
```

### 2.7 `pairing` **[0.7]** (resposta a `startPairing`) — **[1.0]** código de 6 dígitos, ver 7.3
```json
{ "type": "pairing", "ok": true, "code": "482913", "expiresAt": "2026-11-18T21:06:05Z",
  "url": "http://192.168.0.20:48124/index.html#/mobile?pair=482913",
  "urls": ["http://192.168.0.20:48124/index.html#/mobile?pair=482913"],
  "typeUrl": "http://192.168.0.20:48124/", "typeUrls": ["http://192.168.0.20:48124/"] }
```
```json
{ "type": "pairing", "ok": false, "error": "disabled" }
```
- `url`: o frontend desenha o QR desta URL (o backend não gera imagem). `urls`: alternativas (outros adaptadores), melhor primeiro.
- O código vale **2 minutos**, uma vez só; um novo `startPairing` invalida o anterior; **[1.0]** 20 erros com o mesmo código
  (somando todos os IPs) também.
- `error`: `disabled` (ligar `remote.enabled` primeiro), `notRunning` (porta ocupada etc.; `message` traz o erro), `noNetwork`.

### 2.8 `devices` **[0.7]**
`{ type: "devices", devices: [{ id, name, created, lastSeen?, online }], paired?: string }` — resposta a `listDevices` e broadcast
quando um celular pareia (`paired` = id dele), é revogado, **[1.0]** conecta (autentica) ou desconecta. `lastSeen`/`online`: ver 7.3.

### 2.9 `error`
`{ type: "error", message }` — exceção no tick (broadcast) ou mensagem inválida (só para quem mandou).

## 3. Socket local — cliente → servidor

| `type` | Campos | Efeito | Resposta |
|---|---|---|---|
| `setConfig` | `config: AppConfig` | substitui a config (posição da janela, pasta de log inválida e `remote.pairedDevices` são preservados pelo backend) | broadcast `config` |
| `placeTopRight` | `layout: "compact" \| "mid"`, `corner?: "tl" \| "tr" \| "bl" \| "br"` **[1.2]** (padrão `tr`) | widget no canto do monitor escolhido | |
| `fillMonitor` **[1.2]** | | widget ocupa o monitor inteiro (telinha, faixa); layout volta ao Automático | broadcast `config` |
| `refreshBatteries` | | | |
| `restoreDefaults` | | config de fábrica (mantém a janela; desliga o celular e esquece os pareados) | broadcast `config` |
| `getState` | | | `catalog` |
| `resetExtremes` **[0.7]** | | zera mín/máx | broadcast `extremes` |
| `dismissCrashReport` **[0.7]** | | some com o relatório (lembrado em disco) | broadcast `catalog` |
| `acceptGameSuggestion` **[0.7]** | `exe?: string` | põe a sugestão atual em `games.include` | broadcast `config` |
| `dismissGameSuggestion` **[0.7]** | `exe?: string` | põe em `games.dismissedSuggestions` | broadcast `config` |
| `startPairing` **[0.7]** | | gera código | `pairing` |
| `listDevices` **[0.7]** | | | `devices` |
| `revokeDevice` **[0.7]** | `id: string` | apaga o dispositivo e derruba a conexão dele | broadcast `config` + `devices` |

`accept/dismissGameSuggestion` só valem para a sugestão atual: se `exe` vier e for diferente, nada acontece.

```json
{ "type": "revokeDevice", "id": "04388cc23d523135" }
```

## 4. Regras do servidor do backend (o que a página precisa saber)

- **Alertas** **[0.7]** (`alerts.enabled`): métrica com limite vermelho (`metrics[].crit`) e valor ≥ limite por 5 s seguidos →
  balão do Windows pela bandeja (som opcional), no máximo uma vez a cada `minIntervalMin` por métrica. Vale para todas as
  métricas com `crit`, visíveis ou não. Nada vai pelo socket.
- **"Marcar como jogo?"** **[0.7]**: processo em foco, em janela (não tela cheia), apresentando ≥ 20 FPS por 60 s
  (pausas de até 5 s não zeram), fora de `include`/`ignore`/`dismissedSuggestions` e que não é o jogo atual.
- **Perfis** **[0.7]**: `tuningPreset` vale só enquanto o jogo roda (`off` desliga o ajuste geral naquele jogo); `custom` usa
  `gpuTuning.powerLimitW/maxClockMhz`. Ao sair do jogo (ou se o app cair) o `GpuTuner` desfaz, como no ajuste normal.
- **Retenção de logs** **[0.7]**: ao abrir, 1x/dia e **[1.0]** ~5 s depois de mudar `keepDays`, `maxTotalMb` ou `folder`; só `pitwall_*.csv` da pasta; nunca o arquivo atual, o da sessão mais recente,
  o mais novo da pasta nem o do relatório de crash.
- **CSV** **[0.7]**: primeira linha `# pitwall-csv v2`, depois o cabeçalho `timestamp,game,<ids>`. Novas colunas `fps.displayed` e
  `gpu.perfcap` (texto). Para ler no pandas: `read_csv(path, comment="#")`.

---

## 5. Socket da rede (celular) **[0.7]**

### 5.1 HTTP
`remote.enabled = true` sobe um segundo servidor em `http://+:<remote.port>/` (padrão 48124) e cria a regra de firewall
`Pitwall-PhoneView` (TCP, só `localsubnet`). Desligar remove a regra; o desinstalador também.

- **[1.0]** `GET/HEAD /` (e `/mobile`) → **302** para `/index.html#/mobile` (ver 7.3).
- `GET/HEAD /…` → arquivos do `wwwroot` (o mesmo build do Angular). Só extensões conhecidas
  (html, js, css, json, webmanifest, ico, png, jpg, svg, webp, woff, woff2, ttf, txt); `..`, `\`, `:`, arquivos com `.` no
  início → 404. Cabeçalhos: `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`,
  `Cache-Control: no-cache`.
- `Host` precisa ser um IP ou o nome deste PC (`<nome>`, `.local`, `.lan`, `.home`) → senão 421 (defesa contra DNS rebinding).
- IP com 5 erros de autenticação/pareamento em 1 min fica bloqueado por 5 min → 429 em qualquer requisição.
- Outros métodos → 405.

### 5.2 Conexão
- `ws://<host>:<porta>/ws`, com `Origin` = `http://<Host>` (a própria página) → senão 403. Até 8 conexões (503).
- A **primeira mensagem** precisa chegar em 10 s (senão fecha) e ser `auth` ou `pair`; qualquer outra mensagem conta
  como erro para o limite por IP e fecha.
- Mensagens de até 4 KB; maior → fecha.

```json
{ "type": "auth", "token": "T9xvla_Tq4AJfg8lwggZWbihPvlOc227zJPK8goHNz8" }
```
→ `{ "type": "auth", "ok": true, "deviceId": "04388cc23d523135", "name": "Pixel 8" }`
→ ou `{ "type": "auth", "ok": false, "error": "invalidToken" }` e fecha (1008).

```json
{ "type": "pair", "code": "482913", "name": "Pixel 8" }
```
→ `{ "type": "paired", "ok": true, "deviceId": "04388cc23d523135", "name": "Pixel 8", "token": "<43 caracteres base64url>" }`
→ ou `{ "type": "paired", "ok": false, "error": "invalidCode" | "expired" | "noPending" }` e fecha.

- O código vem do fragmento da URL do QR (`#/mobile?pair=<código>`; o fragmento não vai em requisições HTTP nem no Referer)
  **ou é digitado** **[1.0]** (6 dígitos; espaços e hífens são ignorados). `name` é opcional (o backend limpa: até 40 caracteres
  imprimíveis; sugestão: derivar do user agent, ou deixar a pessoa digitar, ex.: "TV da sala").
- Após `paired ok`, a conexão já está autenticada. A página deve guardar `token` no `localStorage` e usar `auth` nas próximas
  vezes; o backend só guarda o SHA-256 do token. `invalidToken` = dispositivo revogado → voltar para a tela de parear.

### 5.3 Servidor → celular (depois de autenticado)
1. `catalog` sanitizado: sem `admin`, `crashReport`, `remote`, `tuning`, `tuningPresets`, `monitors`.
2. `config` sanitizado (`RemoteViewConfig`): `refreshMs, appTheme, widgetTheme, themeMode, accent, language, groupLabels,
   widget: { layout }, battery: { enabled, hidden, lowPercent }, metrics` — sem pastas, ajuste da GPU, jogos ou dispositivos.
   Reenviado a cada mudança.
3. `snapshot` a cada `refreshMs`, igual ao local **sem** `log`, `tuning`, `gameSuggestion` e `profile.tuningPreset`.
   `extremes` parcial vem nele; a mensagem `extremes` completa **não** é enviada ao celular (o mín/máx se completa conforme muda).
4. `pong` em resposta a `ping`: `{ "type": "pong", "t": 1795013878898 }`.

Não há `sessions`, `devices`, `pairing` nem `error` no socket da rede.

### 5.4 Celular → servidor (depois de autenticado)
Só `{ "type": "ping" }`. **Todas as outras mensagens são ignoradas** (sem resposta) — o socket é somente leitura.
Ao ser revogado, a conexão fecha com 1008 `revoked`.

---

## 6. Mensagens do host nativo (WebView2, fora do WebSocket)
Página → host via `chrome.webview.postMessage`: `openSettings`, `hide` (widget); `pickFolder`, `pickExe`,
`identifyMonitors`, `openLogFolder`, `openLogFile { file? }`, `showWidget` (configurações). Host → página: `folderPicked { path }`,
`exePicked { name }`, **[1.0]** `startTutorial` (ver 7.4).

## Adições finais da v0.7

- `config.alerts.sustainSec` (número, padrão 10, 1–120): segundos no vermelho antes do aviso.
- Cliente → servidor `{ "type": "testAlert" }`: mostra um aviso de exemplo na bandeja.
- `update.size` (bytes, opcional): tamanho do instalador quando há versão disponível.
- Mensagem do host (WebView2, não WebSocket) `{ "type": "openLogFile", "file": "pitwall_....csv" }`: seleciona o CSV no Explorer.
  Só aceita um nome de arquivo `.csv` dentro da pasta de logs; sem `file`, abre o log atual; se não existir, abre a pasta.
- Instalação nova (`firstRunDone: false`): o app abre as configurações sozinho e o assistente aparece por cima.

---

## 7. Pitwall 1.0

Versão do app nesta etapa: `0.9.0` (`catalog.version`); o dono corta a `1.0.0` no fim. Config passa para a **v6**
(migração automática; nada para a página fazer além de mandar os campos novos de volta no `setConfig`).

### 7.1 Retenção dos CSVs
- `log.keepDays` aceita só **`1`, `5`, `15`, `30`, `90`** ou **`0` (= para sempre)**. Padrão `30`.
  Outro valor (config antiga ou `setConfig`) é ajustado pelo backend: sobe para a próxima opção (nunca apaga antes do que
  foi escolhido: `7 → 15`, `60 → 90`), acima de 90 vira `0`, negativo vira `0`. O `config` que volta já vem corrigido.
- `log.maxTotalMb` continua: MB, `0` = sem teto (0–1.000.000).
- A limpeza roda ~5 s depois de mudar `keepDays`, `maxTotalMb` ou `folder` (além de ao abrir e 1x/dia). Regras de proteção
  iguais (seção 4). Nada vai pelo socket.
- Sugestão de UI: um seletor com as 6 opções (`1 dia`, `5 dias`, `15 dias`, `30 dias`, `90 dias`, `Para sempre`); a lista
  está em `LOG_KEEP_DAYS` no `models.ts`.

### 7.2 Recursos / feature switches
Uma página "Recursos" pode ligar todos os interruptores do app. Os quatro novos ficam em `config.features` (padrão `true`);
os antigos continuam onde estavam. Tudo muda pelo `setConfig` normal.

| Recurso | Campo no config | Desligado = |
|---|---|---|
| Relatório de crash **[1.0]** | `features.crashReport` | sem buffer de 60 s (nem memória nem `crash-ring.json`), sem detecção ao abrir, sem balão; `catalog.crashReport` some (o `catalog` é reenviado ao mudar) |
| "Marcar como jogo?" **[1.0]** | `features.gameSuggestions` | não olha a janela em foco; `snapshot.gameSuggestion` sempre `null` (a pendente some) |
| Picos da sessão (mín/máx) **[1.0]** | `features.sessionPeaks` | sem rastreio; sem mensagem `extremes` (nem ao conectar) e sem `snapshot.extremes`; `resetExtremes` é ignorado. Ao religar chega um `extremes` completo com `epoch` novo (vazio) |
| Motivo do limite de clock **[1.0]** | `features.clockReason` | não consulta o NVML; `texts["gpu.perfcap"]` some, sem `snapshot.clockReasons` nem `session.clockReasonSec`. A coluna `gpu.perfcap` do CSV fica (vazia) para não partir o arquivo da sessão. `catalog.metrics[gpu.perfcap].available` continua dizendo se o hardware suporta |
| Detectar jogos | `games.autoDetect` | só `games.include` conta como jogo |
| Log CSV | `log.enabled` | não grava CSV |
| Bateria sem fio | `battery.enabled` | `snapshot.batteries = null` |
| Ajuste da GPU | `gpuTuning.enabled` | não aplica limite de consumo/clock (perfil `tuningPreset` ainda pode ligar durante um jogo) |
| Avisos no vermelho | `alerts.enabled` | sem balão de alerta |
| Celular / TV na rede | `remote.enabled` | servidor da rede e regra do firewall desligados |
| Procurar atualizações | `update.autoCheck` | não consulta o GitHub sozinho (`checkUpdate` manual continua) |

Custo desligado: ~0 (o tick só testa o booleano). Ligar/desligar vale no próximo tick, sem reiniciar.

```jsonc
"features": { "crashReport": true, "gameSuggestions": true, "sessionPeaks": true, "clockReason": true }
```

### 7.3 Pareamento por código digitado (celular ou TV)
- **Código**: 6 dígitos (`"000000"`–`"999999"`, aleatório por CSPRNG), uso único, vale 2 min. Um `startPairing` novo
  invalida o anterior. Limites: 5 erros/min por IP → IP bloqueado 5 min (HTTP 429), e **20 erros no total com o mesmo código**
  (qualquer IP) → o código deixa de valer (a próxima tentativa recebe `noPending`; gerar outro).
- **`startPairing` → `pairing`** (ver 2.7): `code` (mostrar grande ao lado do QR, ex.: `482 913`), `expiresAt`, `url`/`urls`
  (QR, com o código no fragmento) e `typeUrl`/`typeUrls` (`http://<ip>:<porta>/`, curto para digitar na TV).
- **Raiz do servidor da rede**: `GET http://<ip>:<porta>/` responde **302** para `/index.html#/mobile` (também `/mobile`).
  O fragmento não vai na requisição, por isso o destino é `/index.html` e não `/`. Assim quem digita só `ip:porta` cai na página
  do celular/TV. Os cabeçalhos de segurança são os mesmos dos arquivos.
- **Página `#/mobile` sem `?pair=` e sem token salvo**: mostra a entrada do código (6 dígitos, teclado numérico:
  `inputmode="numeric"`) e, opcionalmente, um nome; ao enviar, abre o WebSocket e manda como 1ª mensagem
  `{ "type": "pair", "code": "482913", "name": "TV da sala" }`. Respostas iguais às da 5.2 (`paired ok` com `token` → guardar no
  `localStorage`; erro → fecha o socket com 1008, a página reconecta para tentar de novo). Com `?pair=` continua automático.
- **`name`**: vem do cliente; o backend tira caracteres de controle e invisíveis (ex.: U+202E), junta espaços repetidos e corta
  em 40 caracteres sem partir emoji. Vazio → "Celular"/"Phone".
- **`lastSeen`** (ISO 8601, por dispositivo): gravado ao autenticar (`auth` ou `pair`) e no máximo 1x/min enquanto conectado.
  Vai em `devices` e em `config.remote.pairedDevices` (no `config` pode estar até um minuto atrasado: atualizar o "visto há" não
  reenvia a config; use a mensagem `devices`). Ausente = nunca conectou depois da 1.0.
- **`online`** (só em `devices`): conexão autenticada aberta agora → "Vendo agora". O backend manda `devices` sempre que um
  aparelho conecta ou desconecta, então a lista fica ao vivo sem polling.

```json
{ "type": "devices", "devices": [
  { "id": "04388cc23d523135", "name": "iPhone · Safari", "created": "2026-11-12T20:00:00-03:00", "lastSeen": "2026-11-18T21:04:05-03:00", "online": true },
  { "id": "5be2c0a9d14f7e30", "name": "TV da sala", "created": "2026-11-16T19:30:00-03:00", "online": false } ] }
```

### 7.4 Tutorial (rever)
- `config.tutorialDone` (bool): instalação nova = `false`; configs que já existiam viram `true` (migração v6). `firstRunDone`
  não muda de sentido (assistente de primeira execução).
- **Regra da página de configurações**: com `tutorialDone === false`, mostrar o tutorial (depois do assistente, se
  `firstRunDone` também for `false`); ao terminar ou pular, `setConfig` com `tutorialDone: true`.
- Gatilhos para começar **agora** (além da regra acima): o hash `#/settings?tutorial=1` (janela aberta pela bandeja) e a mensagem
  do host `{ "type": "startTutorial" }` via `chrome.webview` (janela que já estava aberta). Tratar os gatilhos como idempotentes:
  se o tutorial já está na tela, não reiniciar.
- **Bandeja → "Rever tutorial" / "Replay tutorial"**: grava `tutorialDone = false` (broadcast `config`), abre as configurações e
  manda o gatilho acima (URL se a janela era nova, `startTutorial` se já existia).
- **Cliente → servidor** `{ "type": "replayTutorial" }`: grava `tutorialDone = false` → broadcast `config` (a página reage pela regra).

### 7.5 "Por que o clock caiu": segundos por motivo
- `GameSession.clockReasonSec?: Record<"thermal"|"power"|"voltage"|"idle"|"sync"|"none", number>` — segundos (inteiros) em cada
  motivo durante a sessão (só ticks com leitura do NVML). Salvo a cada ~30 s e no fim, como as outras estatísticas.
  Percentual = valor / soma de todos.
- `snapshot.clockReasons?: { live: boolean, exe: string, sec: Record<motivo, number> }` — em jogo, a sessão atual (`live: true`,
  atualizado a cada snapshot); fora de jogo, a última sessão que tem esses dados (`live: false`). Ausente sem dados, sem NVML ou
  com `features.clockReason` desligado. Também vai para o celular.

```json
"clockReasons": { "live": true, "exe": "FC25.exe", "sec": { "voltage": 1490, "power": 812, "thermal": 166, "none": 228 } }
```

### 7.6 Abrir o CSV de uma sessão
Já existe (verificado na 1.0): mensagem do host `{ "type": "openLogFile", "file": session.csvFile }` → Explorer com o arquivo
selecionado. Só aceita nome de arquivo `.csv` sem pasta, procurado dentro de `log.folder`; sem `file` abre o log atual; se o
arquivo não existir (ex.: apagado pela retenção) abre a pasta.

### 7.7 Resumo das mudanças de tipos (`models.ts`)
- `AppConfig`: `tutorialDone?`, `features?: FeaturesConfig`, `log.keepDays?: LogKeepDays`.
- `PairedDevice`: `lastSeen?`, `online?`.
- `GameSession`: `clockReasonSec?`. Snapshot: `clockReasons?: ClockReasonStats`.
- `PairingMessage` (ok): `code`, `typeUrl`, `typeUrls`.
- `ClientMessage`: `{ type: 'replayTutorial' }`.
- Demo (`?demo=v07`): `scene=tutorial`, `features=a,b`, dispositivos com `lastSeen`/`online`, código de 6 dígitos, `clockReasons`.

---

## 8. 1.0 — rodada 2

Versão do app continua `0.9.0`. Config passa para a **v7** (migração automática). Tudo abaixo já está no backend.

### 8.1 Erros de pareamento (socket da rede)
```jsonc
{ "type": "paired", "ok": false, "error": "invalidCode", "attemptsLeft": 3 }   // também "expired" | "noPending"
{ "type": "paired", "ok": false, "error": "blocked", "retryAfterSec": 300 }
```
- `attemptsLeft`: quantos erros este IP ainda pode cometer antes de ser bloqueado (5 por minuto). Vem com `invalidCode`,
  `expired` e `noPending` (os três contam como erro). Depois o socket fecha (1008), como antes.
- `blocked`: o erro que acabou de acontecer bloqueou o IP (ou ele já estava bloqueado) → `retryAfterSec` (segundos até liberar,
  ~300) e **sem** `attemptsLeft`. Enquanto bloqueado, o HTTP responde 429 (a página nem consegue abrir o socket; tratar o
  fechamento sem resposta como "bloqueado, tente mais tarde").
- Limites iguais aos de antes: 5 erros/min por IP → 5 min de bloqueio; 20 erros com o mesmo código (somando IPs) → o código
  morre (`noPending`).

### 8.2 Tipo do aparelho
`devices[].kind` e `config.remote.pairedDevices[].kind`: `"phone" | "tv" | "desktop" | "unknown"`. Deduzido do User-Agent no
pareamento e gravado; aparelhos pareados antes disso ficam `unknown`. Só exibição (ícone/nome), nada de segurança depende disso.
- TV: `SmartTV`, `SMART-TV`, `Tizen`, `Web0S`, `webOS`, `BRAVIA`, `Android TV`, `GoogleTV`/`Google TV`, `CrKey`, `HbbTV`, `Roku`,
  `AFT…` (Fire TV). Testado antes de celular, porque essas TVs também dizem "Android".
- Celular: `Mobi` (inclui `Mobile`) ou `iPhone`.
- PC: `Windows`, `Macintosh`, `X11` ou `CrOS`, sem `Mobi`.
- O resto (inclui tablet Android, que não diz "Mobile") → `unknown`. iPad moderno se apresenta como Mac → `desktop`.

### 8.3 Prévia da retenção dos CSVs
Cliente → servidor: `{ "type": "getLogStats", "keepDays"?: number, "maxTotalMb"?: number }`. Resposta **só para quem pediu**:
```json
{ "type": "logStats", "totalBytes": 734003200, "files": 42, "oldest": "2026-08-20T21:04:05-03:00",
  "wouldDeleteFiles": 12, "wouldDeleteBytes": 209715200 }
```
- `files`/`totalBytes`/`oldest`: `pitwall_*.csv` da pasta de logs (`oldest` = última gravação do mais antigo; `null` sem arquivos).
- `wouldDelete*`: o que a retenção apagaria **agora** com os valores dados (mesma seleção e mesmas proteções da limpeza real:
  arquivo atual, o da sessão mais recente, o mais novo e o do relatório de crash). Campo ausente = valor da config.
  `keepDays` passa pelo mesmo ajuste do `setConfig` (`7 → 15`, `> 90 → 0`); `maxTotalMb` fica em 0–1.000.000.
- Nunca apaga nada. Só lista a pasta (barato): dá para chamar a cada mudança do seletor.

### 8.4 Histórico de sessões paginado
- `sessions.json` guarda até **500** sessões (antes 20). O broadcast `sessions` (2.3) continua igual: as **20** mais recentes.
- Cliente → servidor: `{ "type": "getSessions", "offset": number, "limit": number, "exe"?: string }`. Resposta **só para quem pediu**:
```json
{ "type": "sessionsPage", "total": 137, "offset": 20, "sessions": [ { "exe": "FC25.exe", "start": "2026-11-18T20:00:00-03:00" } ] }
```
- Mais recente primeiro. `limit` fica em 1–100 (ausente = 100); `offset` ≥ 0 (o `offset` da resposta já vem corrigido).
- `exe`: só as sessões daquele executável (nome inteiro, sem diferenciar maiúsculas); vazio ou ausente = todas. `total` conta
  depois do filtro.
- A sessão em andamento aparece (sem `end`), como no `sessions`.

### 8.5 Tour
```jsonc
"tour": { "step": 0, "done": false, "dismissed": false }   // dentro de config
```
- Migração v7: `done = tutorialDone`, `step = 0`, `dismissed = false`. Instalação nova: `false`/`0`.
- `tutorialDone` continua no config como **apelido** de `tour.done` (o backend sempre deixa os dois iguais). No `setConfig` quem
  manda é o `tour`; um cliente antigo, que não manda `tour` e só muda `tutorialDone`, continua funcionando (`true` = concluído,
  `false` = tour do começo).
- `replayTutorial` e a bandeja "Rever tutorial" gravam `tour = { step: 0, done: false, dismissed: false }` (e `tutorialDone = false`).
  A bandeja continua mandando `startTutorial` (janela já aberta) ou `#/settings?tutorial=1` (janela nova), sem mudança.
- `step` fica em 0–1000; o backend não interpreta o número.

### 8.6 Deep links das configurações
- Páginas: `overview | appearance | metrics | alerts | games | sessions | gpu | phone | features | app`.
- Janela nova: `…/index.html?port=…&token=…#/settings/<página>[/<âncora>]` (o `token` continua na query, como antes). Junto com
  "Rever tutorial": `…#/settings/<página>?tutorial=1`.
- Janela já aberta: mensagem do host `{ "type": "navigate", "page": "sessions", "anchor": "crash" }` (`anchor` omitido quando não há).
- Âncora: só `a-z`, `0-9` e `-` (até 40); outra coisa é descartada. Página fora da lista = só abre/traz a janela, sem navegar.
- Quem usa: balão de crash → `sessions/crash`; balão de alerta vermelho → `alerts`; balões de atualização → `app/updates`;
  falha ao mudar "Iniciar com o Windows" → `app`. Duplo clique na bandeja e o menu abrem sem página (como antes).
- O widget também pode pedir: mensagem do host `{ "type": "openSettings", "page"?: "...", "anchor"?: "..." }` (sem os campos = como antes).

### 8.7 Sobre
`catalog.about` (só no socket local; o catálogo do celular não leva):
```json
"about": { "app": "0.9.0", "dotnet": "10.0.0", "webView2": "131.0.2903.70", "presentMon": "2.3.0.0", "pawnIO": "2.0.1" }
```
Os cinco campos sempre vêm: `string` com a versão ou `null` explícito (componente não encontrado). `presentMon` = versão do arquivo
`tools\PresentMon.exe` (o executável oficial não tem recurso de versão; aí vale o SHA-256 conhecido do `fetch-deps.ps1`, hoje 2.6.0); `pawnIO` = `DisplayVersion` em `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO`;
`webView2` = runtime instalado; `dotnet` = `Environment.Version`. Lido uma vez e guardado em cache.

### 8.8 Aparência das configurações
- `config.appearance: "system" | "light" | "dark"` vale só para as configurações (página e barra de título nativa). `themeMode`
  continua só para o widget (e o celular). Migração v7: `appearance = themeMode` (`"system"` continua `"system"`). Instalação nova:
  `"system"`. Valor inválido → `"system"`.
- `"system"` segue o tema de apps do Windows (`AppsUseLightTheme`), inclusive se ele mudar com a janela aberta.
- Fundo nativo da janela (antes de a página carregar) e cor da barra de título: `--bg` do app (`#0E1014` escuro / `#F3F4F6` claro).

### 8.9 Resumo para o `models.ts`
- `AppConfig`: `tour: { step, done, dismissed }`, `appearance: 'system'|'light'|'dark'`. `PairedDevice`: `kind`.
- `CatalogMessage`: `about?: { app, dotnet, webView2, presentMon, pawnIO: string | null }` (sempre presente no socket local).
- `ClientMessage`: `getLogStats { keepDays?, maxTotalMb? }`, `getSessions { offset, limit, exe? }`.
- `ServerMessage`: `logStats`, `sessionsPage`. Host → página: `navigate { page, anchor? }`.
- Socket da rede: `paired` com erro ganha `attemptsLeft?`, `retryAfterSec?` e o erro `blocked`.

## 9. Últimos ajustes da 1.0

- `config.features.openSummaryOnGameEnd` (bool, padrão `false`): quando uma sessão de jogo termina e entra no histórico
  (>= 30 s), o app espera 3 s e, se nenhum outro jogo começou, abre as configurações em `sessions` / `last`.
- Mensagem do host (WebView2) `{ "type": "openLatestCsv" }`: seleciona no Explorer o CSV mais recente da pasta de logs
  (os últimos dados gravados, úteis depois de um desligamento abrupto); sem CSV, abre a pasta.
- Bandeja: "Resumo da última sessão…", "Abrir últimos dados gravados (CSV)" e, quando há relatório de queda pendente,
  "Relatório da queda (últimos 60 s)…".

## 10. 1.2

### 10.1 Relatório do PC
Cliente → servidor (socket local; o celular não recebe nada disto):

| tipo | campos | resposta (só para quem pediu) |
|---|---|---|
| `getPcReport` | — | `pcReport` |
| `getPcIncident` | `id` | `pcIncident` (id inexistente/inválido = sem resposta) |
| `dismissPcIncident` | `id` | `pcReport`; marca `seen` e faz broadcast do `catalog` (sem `pcPending` se não houver outro não visto) |

```json
{ "type": "pcReport", "bootTime": "2026-11-18T21:16:02-03:00", "uptimeSec": 5400, "lastCleanExit": "2026-11-17T23:40:11-03:00",
  "incidents": [ { "id": "20261118-211405", "kind": "abruptShutdown", "time": "2026-11-18T21:14:05-03:00", "bootTime": "2026-11-18T21:16:02-03:00",
                   "exe": "FC25.exe", "sessionStart": "2026-11-18T20:34:05-03:00", "uptimeSec": 10800, "events": [], "seen": false } ],
  "events": [ { "time": "2026-11-18T21:16:10-03:00", "kind": "kernelPower41", "source": "Microsoft-Windows-Kernel-Power 41", "eventId": 41,
                "message": "The system has rebooted without cleanly shutting down first. …" } ],
  "ringActive": true }
```
- `pcIncident` = `{ "type": "pcIncident", ...PcIncident }`: o resumo + `intervalMs`, `series` (as `PcSeriesId` que existem no PC,
  até 120 pontos), `last` (todas as métricas numéricas na última gravação) e `csvFile?` (quando havia jogo).
- `catalog.pcPending` = incidente mais novo com `seen: false` (some com `features.crashReport` desligado e no catálogo do celular).
- `id` = hora local da última gravação, `yyyyMMdd-HHmmss`. Ficam os 20 mais novos em `%LOCALAPPDATA%\Pitwall\incidents\`.
- Regra ao abrir: `pc-ring.json` sem `cleanExit` e boot do Windows depois de `savedAt` → incidente (`bugcheck` se houver BugCheck
  1001, ou Kernel-Power 41 com código, por perto); boot antes de `savedAt` = o Pitwall fechou sozinho (sem incidente).
- Eventos anexados: de `time − 10 min` até `bootTime + 10 min`. Relidos ao abrir, no `getPcReport` (cache de 10 min) e uma vez
  10 min depois de um incidente novo (o BugCheck 1001 chega minutos após o boot); os que chegarem depois são anexados e podem
  mudar `kind` para `bugcheck`.
- Saída normal (Sair, logoff ou desligar pelo Windows: `WM_QUERYENDSESSION`/`WM_ENDSESSION`) grava `cleanExit`; desligamento
  cancelado volta a gravar normalmente.
- Queda durante um jogo: a sessão ganha `endedByCrash: true` e `incidentId`; `catalog.crashReport` continua no mesmo formato
  (6 séries, 60 s), agora tirado do buffer do PC. Balões e o item da bandeja abrem `health/latest`.

### 10.3 Sensores, lista de sensores e Home Assistant

**Sensor sem leitura, com o motivo.** Cada `MetricDef` do `catalog` com `available: false` ganha:
- `missing`: `notExposed | needsNvidia | needsPawnIO | needsAdmin | noDevice | needsPresentMon | off`;
- `missingText`: frase pronta no idioma do backend (ex.: "A NVIDIA tirou o sensor de hot spot nas RTX 50: nenhum programa consegue ler.").

A regra é pura (`Metrics/MissingReasons.cs`, entrada = id + fabricante/nome da GPU, PawnIO, admin, PresentMon, aparelho):

| Caso | `missing` |
|---|---|
| `fps.*` sem `tools\PresentMon.exe` | `needsPresentMon` |
| `fps.*` sem administrador (ETW) | `needsAdmin` |
| `gpu.perfcap` em GPU que não é NVIDIA | `needsNvidia` |
| `gpu.hotspot` / `gpu.hotspotDelta` em RTX 50xx | `notExposed` (texto da RTX 50) |
| `gpu.*` / `gpu2.*` em AMD/Intel sem o sensor no LHM | `notExposed` (texto cita a marca) |
| `gpu.*` sem GPU; `gpu2.*` sem segunda GPU; `disk*`/`net.*` sumidos | `noDevice` |
| `cpu.temp`, `cpu.power`, `cpu.clockAvg`, `cpu.<núcleo>.temp/.clock`, `ram.dimm*`, `mb.*` sem PawnIO | `needsPawnIO` |
| os mesmos com PawnIO mas sem administrador | `needsAdmin` |
| `battery.*` sem aparelho / leitura de bateria desligada | `noDevice` / `off` |
| resto | `notExposed` |

**Lista de sensores** (cliente → servidor, só no socket local):
```json
{ "type": "getSensorDump" }
→ { "type": "sensorDump", "text": "# Pitwall · lista de sensores · sensor list\napp: 1.2.0\n..." }
```
Texto simples para colar numa issue (a bandeja "Listar sensores detectados…" e `Pitwall.exe --dump-sensors` usam o mesmo):
cabeçalho `chave: valor` (`app`, `windows`, `gpuDriver`, `gpu`, `gpuVendor`, `gpu2`, `gpu2Vendor`, `gpuOrder`, `pawnIO`,
`admin`, `presentMon`, `generated`), depois `== Hardware ==` com cada hardware (`[Tipo] Nome | identificador`, subhardware com
2 espaços a mais) e sensor (`Tipo | Nome | valor | mín | máx | identificador`, `-` = sem leitura, ponto decimal),
`== Mapeamento · Mapping ==` (`id <- hardware / tipo / sensor (identificador)`) e `== Sem leitura · Missing ==`
(`id | motivo | texto`). Sem nome do PC, usuário, caminhos, GUIDs, MACs ou números de série (`SensorDumpText.Scrub`); filtros
de rede `…-0000` ficam de fora. Montado na thread do socket (não no tick): só o hardware que o tick não atualiza é lido.
O formato é o dos fixtures em `tests/Pitwall.Tests/Fixtures/` — uma lista de uma issue pode ser jogada lá como está.

**Token de API** (só no socket local; o socket da rede ignora mensagens do cliente):
```json
{ "type": "createApiToken", "name": "Home Assistant" }
→ broadcast { "type": "devices", ... }   // a lista já com o aparelho novo
→ { "type": "apiToken", "token": "<43 caracteres base64url>",
    "device": { "id": "a1b2c3d4e5f60718", "name": "Home Assistant", "created": "...", "kind": "integration", "online": false } }
```
256 bits aleatórios; só o SHA-256 fica em `remote.pairedDevices` (`kind: "integration"`); o token só aparece nessa resposta.
Até 10 tokens de integração (passou disso → `{ type: "error", message }`). Revogar = `revokeDevice { id }` (o mesmo dos
celulares). `lastSeen` atualiza no máximo 1x/min quando o token é usado.

**API de leitura** (servidor da rede, porta `remote.port`, padrão 48124):
`GET /api/v1/state` com `Authorization: Bearer <token>`. Só existe com `remote.enabled && remote.apiEnabled` (senão 404).

| Situação | Status |
|---|---|
| API desligada | 404 |
| método ≠ GET | 405 |
| IP bloqueado (mesmo `AttemptLimiter` do pareamento: 5 erros/min → 5 min) | 429 + `Retry-After` |
| sem token, malformado, errado, revogado ou de celular/TV | 401 + `WWW-Authenticate: Bearer` (conta 1 erro para o IP) |
| ok | 200 `application/json` |

Sempre `Cache-Control: no-store`, sem cabeçalhos CORS. Comparação dos hashes em tempo constante. Token de integração **não**
abre o WebSocket `/ws` (o `auth` responde `invalidToken`) e token de celular **não** vale na API.
```json
{
  "version": "1.2.0",
  "time": "2026-11-19T21:14:05-03:00",
  "game": { "exe": "cyberpunk2077.exe" },
  "values": {
    "gpu.temp":    { "name": "GPU · Núcleo",   "value": 61.2,  "unit": "°C" },
    "gpu.hotspot": { "name": "GPU · Hot spot", "value": 74.5,  "unit": "°C" },
    "gpu.power":   { "name": "GPU · Consumo",  "value": 286.4, "unit": "W" },
    "cpu.temp":    { "name": "CPU · Package",  "value": 58,    "unit": "°C" },
    "fps.current": { "name": "FPS · FPS",      "value": 141.3, "unit": "fps" },
    "gpu.perfcap": { "name": "GPU · Motivo de limitação do clock", "value": "power", "unit": "text" }
  }
}
```
`values` = métricas disponíveis do último snapshot (nenhuma leitura extra de sensor), `value: null` = sem leitura agora;
temperatura sempre em °C; nomes no idioma do app; `game: null` fora de jogo. Guia: [home-assistant.md](home-assistant.md).

### 10.2 Sessões, engasgos, marcadores e atalhos

**`GameSession` (sessions / sessionsPage / crashReport)** ganha, todos opcionais (sessões antigas não têm; `null` não vai):
`avgGpuTemp, avgHotspot, avgGpuPower, avgGpuClock, avgGpuLoad, avgCpuTemp, avgCpuLoad` (média dos ticks da sessão com
leitura; clock inteiro, o resto com 1 casa), `peakCpuTemp`, `stutters` (ausente com `features.stutters` desligado),
`markers: [{ t, at, note?, via? }]` (`t` = segundos desde `start`; `via` = `hotkey | button`), `animErrorMs` (média do `fps.animError`, 2 casas),
`pcLatencyMs`, `gpu`, `cpu` (nomes no começo da sessão). Gravados junto com o resto (a cada ~30 s e no fim).
```json
{ "exe": "FC25.exe", "start": "2026-11-19T21:00:02-03:00", "end": "2026-11-19T22:31:40-03:00", "durationSec": 5498,
  "avgFps": 141.2, "low1": 88.4, "peakGpuTemp": 78, "peakHotspot": 101.5, "peakCpuTemp": 83,
  "avgGpuTemp": 71.3, "avgHotspot": 92.8, "avgGpuPower": 236.4, "avgGpuClock": 1845, "avgGpuLoad": 96.1,
  "avgCpuTemp": 68.2, "avgCpuLoad": 34.5, "stutters": 17, "animErrorMs": 0.42,
  "markers": [ { "t": 845.2, "at": "2026-11-19T21:14:07-03:00" } ],
  "gpu": "NVIDIA GeForce RTX 3080", "cpu": "12th Gen Intel Core i5-12600K", "csvFile": "pitwall_2026-11-19_21-00-02_FC25.csv" }
```

**Engasgo** (`docs/v12-contract.md` › Engasgo): frame renderizado com `ft ≥ max(2,5 × mediana dos últimos 120, mediana + 10 ms)`.
Os 10 s ignorados contam tempo de frames da sessão; os frames que o PresentMon já tinha antes da sessão só enchem a janela
da mediana. Mediana recalculada a cada 16 frames (janela fixa de 120 floats, sem alocação): ~0,5 µs/frame medido. Roda na
thread de telemetria sobre os frames do jogo (não no leitor do PresentMon, que vê todos os processos). Ligar/desligar
`features.stutters` no meio da sessão zera a contagem.

**Métricas novas** (grupo fps, desligadas no widget, disponíveis com o PresentMon):
- `fps.stutters` (unidade `""`): engasgos na sessão atual; `null` fora de jogo ou com `features.stutters` off.
- `fps.animError` (ms): média do |erro de animação| no último ~1 s. O PresentMon 2.6 com `--v2_metrics` (as flags atuais)
  chama a coluna de `AnimationError`; o formato padrão do 2.x chama de `MsAnimationError` — as duas são aceitas. NA = sem valor.
- `fps.pcLatency` (ms): coluna `MsPCLatency`/`PCLatency`, se existir. **Com as flags atuais ela não existe**: no 2.6 só o
  formato padrão (sem `--v2_metrics`) tem `MsPCLatency`; `--track_pc_latency` não acrescenta coluna no `--v2_metrics`. O
  formato não mudou (o leitor depende de `FrameTime`/`DisplayedTime`/`FrameType`), então `fps.pcLatency` fica sem leitura por ora.
- O leitor só guarda os índices das colunas e para de percorrer a linha depois da última que interessa:
  ~210 ns/linha depois vs ~237 ns antes (Release, cabeçalho real do 2.6; `ParserBenchTests`).

**`snapshot.texts["fps.reason"]`** (`FpsReason`), só quando não há FPS, nesta ordem: `noPresentMon` (sem o exe) →
`notAdmin` → `antiCheat` ("access denied" ao abrir a sessão ETW) → `otherCapture` (erro de limite de sessões ETW: "too many"
/ "resources") → `noGame` → `starting` (sessão ETW ainda não abriu) → `noFrames` (jogo aberto, nenhum frame dele). Some
quando o FPS volta.

**CSV v3** (`# pitwall-csv v3`): coluna `marker` no **fim** do cabeçalho (`timestamp,game,<métricas…>,marker`); `1` na
primeira linha gravada depois do marcador, vazio nas outras. As métricas novas entram como colunas normais (`fps.stutters`,
`fps.animError`, `fps.pcLatency`). Quem lê pelo nome das colunas continua funcionando.

**Marcadores**
- Cliente → servidor: `{ "type": "addMarker", "note"?: string }` (nota com até 200 caracteres). Sem resposta direta.
- Também pelo atalho `hotkeys.marker`. Em jogo: entra em `markers` da sessão aberta e marca o CSV; fora de jogo: marca o CSV
  atual, o broadcast e o aviso (o número conta desde que o app abriu). Evento `TelemetryHub.MarkerAdded` (para o buffer do PC).
- Servidor → todos os clientes locais: `{ "type": "marker", "index": 3, "at": "2026-11-19T21:14:05-03:00", "exe": "FC25.exe", "via": "hotkey" }`
  (`exe` ausente fora de jogo; `via` = `hotkey` pelo atalho, `button` pelo `addMarker`). A bandeja mostra "Marcador 3 · 21:14:05" / "Marker 3 · 21:14:05".

**`getSessionSeries { start, points? }` → `sessionSeries`** (só para quem pediu). `start` = o `start` da sessão (ISO, tolerância
de 1 s). Lê o CSV da sessão (`csvFile` na pasta de logs; sessão aberta sem `csvFile` ainda = CSV atual) em fluxo, até 50 MB,
na thread do cliente do WebSocket (nunca na de telemetria). `points` 2–1000 (padrão 120); com menos linhas que pontos, um
ponto por linha. Média por balde de tempo igual; balde sem leitura = `null`; série inteira vazia não vai. Colunas:
`fps.current, fps.low1, gpu.temp, gpu.hotspot, gpu.power, gpu.clock, cpu.temp, cpu.load` (as que existirem).
`fps.stutters` (só se a coluna existir e tiver leitura) é **acumulada**: cada balde leva a última contagem até o fim dele
(engasgos desde o início da sessão), balde sem leitura repete o anterior, `null` antes da primeira leitura.
```json
{ "type": "sessionSeries", "start": "2026-11-19T21:00:02-03:00", "stepSec": 45.8, "available": true,
  "series": { "fps.current": [140.2, 143.9, null, 138.0], "gpu.temp": [65.1, 70.4, 71.0, 72.3] } }
```
`available: false` (com `series: {}`) = sessão não encontrada, sem CSV, arquivo apagado pela retenção ou ilegível.

**Atalhos globais** (`config.hotkeys`, `RegisterHotKey` numa janela só de mensagens — nada de hook de teclado):
`toggleWidget` = o mesmo que clicar no ícone da bandeja; `marker` = `addMarker`. Formato `Ctrl+Alt+Shift+Win+Tecla`
(sem diferenciar maiúsculas; `Control`/`Windows` também valem), tecla A–Z, 0–9 ou F1–F24; letras e números precisam de pelo
menos um modificador. Registrados de novo quando `config.hotkeys` muda. `catalog.hotkeys = { toggleWidget, marker }` com
`ok | inUse` (a combinação já é de outro programa, ou os dois atalhos iguais) `| invalid | off` (vazio ou `enabled: false`).
Só no socket local.

**Catálogo › `hardware`**: além de `cpu`, `gpu`, `gpu2`: `ramGb` (total em GB inteiros), `os` ("Windows 11 24H2": build ≥ 22000
= 11, mais o `DisplayVersion` do registro) e `gpuDriver` (NVML `nvmlSystemGetDriverVersion`, só NVIDIA). Lidos uma vez.

### 10.4 Monitor: mín/máx desde que o app abriu
O Monitor mostra o mínimo e o máximo de cada sensor **desde que o Pitwall abriu** (não zera com jogo novo nem com "Zerar",
ao contrário de `extremes`, que é da sessão). Vale para todas as métricas numéricas, com ou sem `features.sessionPeaks`.
Só no socket local (o celular não recebe).
- Ao conectar: `{ "type": "extremesApp", "since": "<ISO, quando o app abriu>", "bootTime": "<ISO, quando o Windows ligou>",
  "values": { "<id>": [mín, máx] } }` (`bootTime` = agora − `Environment.TickCount64`; é o "Ligado há" da faixa de estado).
- Depois: `snapshot.extremesApp = { "<id>": [mín, máx] }` só com o que mudou, **no máximo a cada 5 s**; o cliente sobrescreve
  as chaves recebidas. Valores com 2 casas, como `extremes`.
- Custo: um dicionário a mais atualizado no tick (o mesmo `MetricExtremes` dos picos da sessão), sem leitura extra de sensor.

O resto do Monitor é só do front: anel de 900 pontos (15 min a 1 Hz) por sensor, amostrado e redesenhado no máximo 1×/s
**só com a página aberta e visível** (`document.visibilityState`); os segundos com a página oculta ficam vazios no gráfico.
O período (1/5/15 min) fica no `localStorage` (`pitwall.monitorRange`), não no config. [Copiar leituras] usa `getSensorDump`;
[Marcar momento] manda `addMarker` e mostra "Marcador N · hh:mm:ss" quando chega o broadcast `marker`.

## 11. 1.3

Contrato de trabalho: `docs/v13-contract.md`. Tudo aqui é só do socket local (o celular não recebe nem manda nada disto;
`catalog.benchmark` e `catalog.hotkeys` não vão no catálogo do celular). Nada novo no tick além do benchmark quando ele roda.

### 11.1 Config v9
`ConfigStore.CurrentVersion = 9`. A migração 8 → 9 só preenche os padrões:
```jsonc
"hotkeys":   { "enabled": true, "toggleWidget": "Ctrl+Alt+P", "marker": "Ctrl+Alt+M", "benchmark": "Ctrl+Alt+B" }, // vazio = desligado
"benchmark": { "durationSec": 60 },                // 30 | 60 | 120 | 300; outro valor (ou ausente/null) → 60
"energy":    { "tariff": null, "currency": "R$" }  // tariff = preço do kWh; null = só kWh
```
Sanitize: `tariff` negativo, não finito ou > 1000 → `null`; `currency` vazia → `"R$"` (aparada, até 8 caracteres);
seções `hotkeys`/`benchmark`/`energy` `null` voltam ao padrão.

### 11.2 Relatório do PC: eventos novos
`PcEvent` ganha `category: "problem" | "state"` (sempre presente nos eventos lidos pela 1.3; incidentes gravados antes não
têm) e `exe?` (só `appCrash`/`appHang`).

| kind | origem | janela | `code` / `message` |
|---|---|---|---|
| `sleep` | System · `Microsoft-Windows-Kernel-Power` 42 | 7 dias | 1ª linha do texto |
| `resume` | System · `Microsoft-Windows-Power-Troubleshooter` 1 | 7 dias | 1ª linha do texto |
| `boot` | System · `Microsoft-Windows-Kernel-General` 12 | 7 dias | 1ª linha do texto |
| `shutdown` | System · `User32` 1074 e `Microsoft-Windows-Kernel-General` 13 | 7 dias | 1074: `"RuntimeBroker.exe · restart"` (processo + tipo, nunca usuário nem nome do PC); 13: 1ª linha |
| `appCrash` | Application · `Application Error` 1000 | 30 dias | `code` = módulo com falha (`nvwgf2umx.dll`), `exe` = jogo |
| `appHang` | Application · `Application Hang` 1002 | 30 dias | `exe` = jogo |

- `state` = sleep/resume/boot/shutdown; o resto (os da 1.2 também) = `problem`.
- `appCrash`/`appHang` só entram se o exe for um **jogo conhecido**: exes de qualquer sessão do `sessions.json` +
  `games.include`. O XPath filtra provider/ID/tempo; o exe é comparado no C# (sem diferenciar maiúsculas), olhando o 1º dado
  do evento antes de formatar o texto (até 5000 registros do log Application percorridos por leitura).
- `exe` vem do 1º dado do evento; sem ele, do texto em EN ou PT-BR ("Faulting application name:" / "Nome do aplicativo com
  falha:", "The program X.exe" / "O programa X.exe"). O módulo vem do 4º dado ou de "Faulting module name:" / "Nome do módulo com falha:".
- `pcReport.events`: até 200 `problem` (30 dias, System + Application) + até 150 `state` (7 dias), mais novos primeiro.
- Mensagens: além dos caminhos `C:\Users\<nome>` e do nome do usuário, o **nome do PC** também vira `…`.
- `PcIncident.events` (±10 min) inclui os de `state` (ex.: `sleep` 03:12 → `kernelPower41` 03:40). O `kind` do incidente
  continua decidido só por `bugcheck` / `kernelPower41` com código.

**`GameSession.gameExit?: "crash" | "hang"`**: houve `appCrash` (→ `crash`, tem prioridade) ou `appHang` (→ `hang`) do exe
da sessão entre `start` e `end + 2 min` (sessão sem `end` = `start + durationSec`). Preenchido uma vez por sessão:
- ~20 s depois do fim da sessão, numa thread de fundo (só o log Application, só aquele exe), com `features.crashReport`
  ligado (desligado = nem olha o log); se mudar, broadcast `sessions`;
- em todo `getPcReport` (usa os eventos já lidos para o relatório; se alguma sessão mudar, broadcast `sessions`).

### 11.3 Sessão: driver e energia
`GameSession` ganha, opcionais:
- `gpuDriver`: versão do driver no início da sessão — NVML (`"591.44"`) ou, sem NVML, a do registro (`SystemInfo.GpuDriver`,
  só a parte antes de ` (`). Lida uma vez por execução do app.
- `energyWh`: Σ `(gpu.power + cpu.power) × dt` dos ticks da sessão, em Wh com 1 casa. Soma só o que tiver leitura; tick sem
  nenhum dos dois não conta; sem nenhuma leitura = ausente. Gravado junto com o resto (a cada ~30 s e no fim). O mesmo vale
  para `Benchmark.energyWh`.

### 11.4 Tendência por jogo
```json
{ "type": "getTrend", "exe": "FC25.exe" }
→ { "type": "trend", "exe": "FC25.exe",
    "games": [ { "exe": "FC25.exe", "count": 14, "last": "2026-11-20T21:00:02-03:00" } ],
    "points": [ { "start": "...", "durationSec": 5498, "avgFps": 141.2, "low1": 88.4, "avgGpuTemp": 71.3, "avgHotspot": 92.8,
                  "peakHotspot": 101.5, "avgGpuPower": 236.4, "stutters": 17, "gpuDriver": "591.44", "energyWh": 410.2 } ] }
```
- Só sessões encerradas (a aberta fica de fora) com `durationSec ≥ 120` **e** `avgFps`.
- `games` = jogos com ≥ 2 dessas sessões (a contagem é das sessões que entram na tendência, não de todas), mais sessões
  primeiro; empate = jogado mais recentemente primeiro. `last` = início da sessão mais nova.
- `exe` ausente/vazio = o primeiro de `games`; `exe` pedido vale mesmo fora de `games` (ex.: só 1 sessão). Resposta com a
  grafia das sessões. Sem nada = `"exe": null` (explícito), `games: []`, `points: []`.
- `points` do mais antigo para o mais novo; campos `null` não vão. Lido da memória (o `sessions.json` já carregado), sem disco.

### 11.5 Benchmark
**Início** pelo atalho `hotkeys.benchmark` (3º `RegisterHotKey`, id 3; rodando = cancela) ou `startBenchmark`. Só começa com
jogo aberto **e** FPS chegando (`fps.current` com leitura). Os pedidos (socket/atalho) entram numa fila aplicada no próximo
tick (thread de telemetria). Enquanto roda: um `SessionStatsAccumulator` próprio (mesmas regras de média, 1%, 0,1%,
engasgos com o aquecimento de 10 s, motivo do clock e energia), alimentado com os frames do jogo desde o início (os frames
de antes só enchem a janela da mediana dos engasgos). Sem benchmark, nada roda no tick.

| Cliente → servidor | Resposta |
|---|---|
| `startBenchmark { durationSec?, note? }` | broadcast `benchmarkState` (`running` ou `error`). `durationSec` ausente = `benchmark.durationSec`; fora de 30/60/120/300 → 60. `note` até 200 caracteres. Já rodando = reenvia o estado atual |
| `cancelBenchmark` | broadcast `benchmarkState` `cancelled` (nada é salvo); sem benchmark = nada |
| `getBenchmarks` | `benchmarks` (só para quem pediu) |
| `renameBenchmark { id, note }` | broadcast `benchmarks` (nota vazia = sem nota) |
| `deleteBenchmark { id }` | broadcast `benchmarks` |

```json
{ "type": "benchmarkState", "state": "running", "exe": "FC25.exe", "startedAt": "2026-11-22T21:00:00-03:00", "durationSec": 60 }
{ "type": "benchmarkState", "state": "error", "error": "noFps", "exe": "FC25.exe" }
{ "type": "benchmarkState", "state": "done", "exe": "FC25.exe", "startedAt": "...", "durationSec": 60, "result": { "...": "Benchmark" } }
{ "type": "benchmarks", "items": [ { "id": "20261122-210000", "exe": "FC25.exe", "start": "...", "durationSec": 60, "avgFps": 143.2,
  "low1": 98.1, "low01": 71.4, "stutters": 2, "avgGpuLoad": 97.4, "avgCpuLoad": 38.2, "avgGpuTemp": 72.1, "avgHotspot": 93.5,
  "avgGpuPower": 301.2, "avgGpuClock": 1860, "avgCpuTemp": 66.0, "energyWh": 5.8, "clockReasonSec": { "power": 41, "none": 19 },
  "gpu": "NVIDIA GeForce RTX 3080", "cpu": "12th Gen Intel Core i5-12600K", "gpuDriver": "591.44",
  "sessionStart": "2026-11-22T20:41:10-03:00", "note": "ultra RT" } ] }
```
- `benchmarkState` vai em broadcast **só nas mudanças** (início, fim, cancelado, erro), nunca por segundo: o front conta pelo `startedAt`.
- `error`: `noGame` (sem jogo), `noFps` (jogo sem FPS), `gameEnded` (o jogo fechou antes de 10 s). O jogo fechou com ≥ 10 s →
  `done` com `result.partial: true` e `result.durationSec` = segundos medidos (arredondados). Completo: `durationSec` = o pedido.
- Um novo `done` também faz broadcast de `benchmarks` (a lista já com ele).
- `catalog.benchmark` (cliente novo): `running` ou o último `done`; um `error`/`cancelled` antigo vai como `{ "state": "idle" }`.
- `catalog.hotkeys` = `{ toggleWidget, marker, benchmark }` com `ok | inUse | invalid | off`.
- `%APPDATA%\Pitwall\benchmarks.json`, os 200 mais novos (mais novo primeiro). `id` = hora local do início
  `yyyyMMdd-HHmmss` (`-2`, `-3`… se repetir).
- Marcadores na sessão aberta (`via: "benchmark"`; também marcam o CSV e saem no broadcast `marker` com `via: "benchmark"`,
  sem o balão "Marcador N"): "Benchmark: início" / "Benchmark: start"; "Benchmark: fim (60 s)" / "Benchmark: end (60 s)";
  cancelado: "Benchmark: cancelado" / "Benchmark: cancelled" (extra, não estava no contrato). Texto no idioma do app na hora.
- Bandeja (clicar abre `sessions/bench`): "Benchmark: 60 s · 143 FPS · 1% 98" (EN "… · 1% low 98"), com " (parcial)" se
  for o caso; erro (`noGame`/`noFps`/`gameEnded`) também ganha um balão curto, para quem usou o atalho em tela cheia saber
  por que não começou.

### 11.F Front (Relatórios de jogo, Relatório do PC, widget)
Tipos em `web/src/app/models.ts` (seção "1.3"), exatamente os de `docs/v13-contract.md`. O que é só do front:

- **"O que segurou o FPS"**: `sessionInsights(session, dict)` em `settings/pages/sessions/insights.ts` (regra pura com
  testes). Recebe o dicionário do idioma no lugar de "settings" (os limites são os fixos do contrato). "Última partida"
  mostra até 4 (a de `gameExit` vira a linha amarela "O jogo fechou com erro às hh:mm → Ver no Relatório do PC"); o card,
  o texto e o Markdown do Compartilhar levam até 2. Sessão aberta não mostra frases.
- **Tendência** (`#trend`): pede `getTrend` ao abrir e ao reconectar (mantém o jogo escolhido). Desenha só pontos com
  `avgFps`; troca de driver = ponto com driver conhecido diferente do último conhecido. Frase de antes/depois: só a
  **última** troca, mediana do FPS médio do trecho com o driver anterior × das sessões com o driver novo, ≥ 3 de cada
  lado (`trend-util.ts › driverShift`). Mediana móvel de 5 = janela que termina no ponto.
- **Benchmark** (`#bench`): pede `getBenchmarks` ao abrir. A contagem usa `startedAt` + `durationSec` (relógio local);
  o widget acorda 1×/s só enquanto `state === 'running'`. Ao receber `benchmarkState` `done` com `result`, o front põe o
  resultado no topo da lista sem esperar outro `benchmarks`. Comparar dois reaproveita `compareRows` (o benchmark vira
  uma sessão sem picos). Compartilhar usa o mesmo card, com "Benchmark 1 min" no lugar da duração e sem a linha do FPS.
- **Energia**: abaixo de 100 Wh mostra Wh, senão kWh (2 casas); custo com `energy.tariff` (2 casas, "< R$ 0,01" abaixo
  de um centavo). Tarifa e moeda ficam em Relatórios de jogo › `#energy`.
- **Relatório do PC**: `category` ausente (backend 1.2) = `problem`, exceto sleep/resume/boot/shutdown. Filtro
  "Problemas | Tudo" (padrão Problemas, com "+N de suspensão, ligar ou desligar em Tudo"). O incidente mostra a sequência
  em ordem (eventos, "última gravação" e "PC voltou" quando não há `boot` a ±2 min).
- **Demo**: `?demo=1` gera o que pede a seção Demo do contrato; `&bench=running` começa um benchmark de 5 min (selo no
  widget); `&exit=crash|hang` marca a última partida.

## 12. 1.4

### 12.1 "Não é um jogo" (página → backend)

`{ "type": "markNotGame", "exe": "X.exe" }`: o exe vai para `games.ignore` (e sai de `games.include`), todas as sessões
dele são apagadas de sessions.json, inclusive a aberta (o fim dela não grava nada). Só aceita um exe que tenha sessão ou
seja o jogo atual. Responde com `config` e `sessions` em broadcast. Os CSVs ficam (a limpeza da pasta cuida deles).

### 12.2 Relatório do PC: `installs`

`pcReport.installs` (ausente = backend 1.3): até 150 itens dos últimos 30 dias, mais novos primeiro, cache de 10 min
junto com os eventos.

| campo | |
|---|---|
| `time` | ISO; `dateOnly: true` = só a data é conhecida (InstallDate do registro) |
| `kind` | `program` (chaves Uninstall, sem SystemComponent/ParentKeyName/updates) · `driver` (Kernel-PnP/Configuration 400, a 1ª vez de cada inf+versão no log; UserPnp 20003 quando não coberto) · `update` (WindowsUpdateClient 19, sem as definições do Defender KB2267602) · `store` (app da Store pelo Windows Update) |
| `name` | programa / inf original (do DriverStore, não `oemNN.inf`) / serviço / título da atualização |
| `version`, `publisher` | quando houver (driver de serviço: fabricante pelo VEN_/VID_) |
| `deviceClass` | driver: net, bluetooth, display, media, hid, usb, storage, printer, system, other |

A página mostra "Principais" (sem Store e sem drivers da Microsoft) ou "Tudo" e, por item, as quedas do PC nos 7 dias
antes e depois (Kernel-Power 41, 6008, BugCheck, WHEA grave, reinício do driver de vídeo; eventos a até 2 min, ou
BugCheck a até 15 min, contam como a mesma queda). Coincidência no tempo, sem diagnóstico.
