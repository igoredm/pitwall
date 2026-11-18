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
| `placeTopRight` | `layout: "compact" \| "mid"` | | |
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
