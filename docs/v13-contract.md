# 1.3.0 — contrato entre as frentes

Documento de trabalho da 1.3.0 ("entender o desempenho"). Backend e frontend implementam contra isto. Tipos TS em
`web/src/app/models.ts` (seção "1.3"), config C# em `src/Pitwall/Config/AppConfig.cs` (config **v9**). Ao terminar,
cada frente registra o que mudou em `docs/protocol.md` (seção 11).

## Regras que não mudam
- Nada injeta ou toca no processo do jogo (anti-cheat). Atalho novo = `RegisterHotKey`, igual aos da 1.2.
- CPU < 1% em jogo: nada novo em loop quente. Event Log, leitura de histórico e tendência rodam sob demanda.
- Sem rede nova. PT-BR + EN em tudo (`L.T(pt,en)` no C#, dicionários `ptBR`/`en` no front).
- Visual do app = tokens da 1.0 (`docs/design-notes.md` › v1.0). Sem gradiente, brilho ou blur. Widget = temas existentes.
- **Fatos, não diagnóstico.** Textos dizem o que aconteceu ("coincidiu", "% do tempo"), nunca "a causa é".
- Commits com a identidade git configurada, **sem** `Co-Authored-By` nem menção ao Claude.

## Escopo
1. **Relatório do PC: mais eventos do Windows** (suspensão/retomada, ligar/desligar, jogo fechou com erro).
2. **"O que segurou o FPS"**: frases de fato na sessão e no card de compartilhar.
3. **Tendência por jogo e por driver**.
4. **Benchmark por atalho** (trecho de 30/60/120/300 s).
5. **Energia e custo por sessão**.

Fora da 1.3: gargalo CPU × GPU ao vivo (exige tirar `--no_track_gpu` do PresentMon e medir CPU em jogo).

## Config v9 (novos campos, todos com padrão; migração 8 → 9 só preenche)
```jsonc
"hotkeys":   { ..., "benchmark": "Ctrl+Alt+B" },            // vazio = desligado
"benchmark": { "durationSec": 60 },                          // 30 | 60 | 120 | 300 (outro valor → 60)
"energy":    { "tariff": null, "currency": "R$" }            // tariff = preço do kWh; null = só mostra kWh
```

## 1. Eventos do Windows (Relatório do PC)
Novos `PcEvent.kind` (mesma forma de `PcEvent`):

| kind | origem | janela |
|---|---|---|
| `sleep` | System · Kernel-Power 42 (entrou em suspensão/hibernação) | 7 dias |
| `resume` | System · Power-Troubleshooter 1 (voltou da suspensão) | 7 dias |
| `boot` | System · Kernel-General 12 (Windows iniciou) | 7 dias |
| `shutdown` | System · User32 1074 (desligar/reiniciar pedido; `message` = processo + tipo, sem nome de usuário) e Kernel-General 13 | 7 dias |
| `appCrash` | **Application** · Application Error 1000, **só se o exe for um jogo conhecido** (sessões ou lista de jogos) | 30 dias |
| `appHang` | **Application** · Application Hang 1002, mesmo filtro | 30 dias |

- `PcEvent` ganha `category?: "problem" | "state"` (`state` = sleep/resume/boot/shutdown; o resto = `problem`).
- `appCrash`/`appHang`: `code` = módulo com falha (ex.: `nvwgf2umx.dll`) quando houver; `exe` (campo novo, opcional) = jogo.
- Limites: até 200 `problem` (30 dias) + até 150 `state` (7 dias). Leitura do log Application filtrada no XPath por
  provider/ID e tempo; o filtro por exe é feito no C# (o XPath não filtra o texto).
- Incidente (`PcIncident.events`): já anexa eventos ±10 min; passa a incluir `state` também (ex.: "sleep 03:12 → KP41
  03:40" é o padrão das quedas ligadas à suspensão). Regra `PcIncidentRules` não muda o `kind` do incidente por causa deles.
- Sessão de jogo: novo `GameSession.gameExit?: "crash" | "hang"` = houve `appCrash`/`appHang` do exe da sessão entre o
  início e fim + 2 min. Verificado ~20 s depois do fim da sessão (sob demanda, thread de fundo) e no `getPcReport`.

## 2. "O que segurou o FPS" (só front, regra pura)
`sessionInsights(session, settings) → Insight[]` em `web/src/app/settings/pages/sessions/insights.ts`, com testes.
`Insight = { id, tone: 'info' | 'warn' | 'crit', text, link?: SettingsPage }`. Regras (todas com números da sessão):
- `avgGpuLoad ≥ 95` → "GPU no limite: uso médio de 97%." (info)
- `avgGpuLoad < 80` e sessão ≥ 2 min → "GPU com folga: uso médio de 64%. O limite veio de outro lugar (CPU, jogo ou limite de FPS)." (info)
- `clockReasonSec.power / total ≥ 0,25` → "Clock limitado por energia em 62% do tempo." link `gpu` (warn)
- `clockReasonSec.thermal / total ≥ 0,10` → "Clock limitado por temperatura em 18% do tempo." (warn)
- `secondsAboveCrit[id] ≥ 30` → "Hot spot acima do limite crítico definido por 4 min." (crit) — o maior; um por métrica, máx. 2
- `stutters/min ≥ 2` → "38 engasgos (2,1 por minuto)." (warn)
- `gameExit` → "O jogo fechou com erro (Application Error)." / "O jogo parou de responder." (crit)
Ordenar crit > warn > info; mostrar até 4 em "Última sessão" e até 2 no card de compartilhar.

## 3. Tendência por jogo e por driver
- `GameSession` ganha `gpuDriver?: string` (versão no início da sessão: NVML ou `SystemInfo.GpuDriver`).
- Mensagem `getTrend { exe? }` → `trend`:
```ts
interface TrendPoint { start: string; durationSec: number; avgFps?: number; low1?: number; avgGpuTemp?: number;
  avgHotspot?: number; peakHotspot?: number; avgGpuPower?: number; stutters?: number; gpuDriver?: string; energyWh?: number }
interface Trend { exe: string | null; games: { exe: string; count: number; last: string }[]; points: TrendPoint[] }
```
  `exe` ausente = jogo com mais sessões. `points` do mais antigo ao mais novo, só sessões com `durationSec ≥ 120` e
  `avgFps`. `games` = jogos com ≥ 2 sessões, mais jogados primeiro.
- Front: Relatórios de jogo › âncora `trend`: escolher o jogo; gráfico (SVG próprio, sem lib) com FPS médio e 1% low
  por sessão; segundo gráfico com Δ médio hot spot − núcleo (`avgHotspot − avgGpuTemp`) e mediana móvel de 5; linha
  vertical rotulada quando `gpuDriver` muda. Frase de fato embaixo: "Desde o driver 591.44: FPS médio 141 → 128 (−9%)"
  comparando a mediana das sessões antes/depois (≥ 3 de cada lado; senão não mostra).

## 4. Benchmark por atalho
- Atalho `hotkeys.benchmark` (padrão Ctrl+Alt+B): sem benchmark rodando → começa com `benchmark.durationSec`;
  rodando → cancela. `catalog.hotkeys.benchmark` = `ok | inUse | off` (igual aos outros).
- Só começa com jogo aberto **e** FPS chegando; senão `benchmarkState` `error` com `error: "noGame" | "noFps"`.
- Acumula com um `SessionStatsAccumulator` próprio (mesmas regras de média, 1%, 0,1%, engasgos, motivo do clock,
  energia). Jogo fecha no meio → salva se ≥ 10 s, com `partial: true`; senão `error: "gameEnded"`.
- Grava marcadores na sessão aberta: "Benchmark: início" e "Benchmark: fim (60 s)" (`via: "benchmark"`).
- Guarda em `%APPDATA%\Pitwall\benchmarks.json`, 200 mais novos.
```ts
interface Benchmark { id: string; exe: string; start: string; durationSec: number; partial?: boolean; note?: string;
  avgFps?: number; low1?: number; low01?: number; stutters?: number; avgGpuLoad?: number; avgCpuLoad?: number;
  avgGpuTemp?: number; avgHotspot?: number; avgGpuPower?: number; avgGpuClock?: number; avgCpuTemp?: number;
  energyWh?: number; clockReasonSec?: Record<string, number>; gpu?: string; cpu?: string; gpuDriver?: string;
  sessionStart?: string }
interface BenchmarkState { state: 'idle' | 'running' | 'done' | 'cancelled' | 'error'; exe?: string; startedAt?: string;
  durationSec?: number; error?: 'noGame' | 'noFps' | 'gameEnded'; result?: Benchmark }
```
- Cliente → servidor: `startBenchmark { durationSec?, note? }`, `cancelBenchmark`, `getBenchmarks` → `benchmarks
  { items: Benchmark[] }`, `renameBenchmark { id, note }` e `deleteBenchmark { id }` → novo `benchmarks`.
- Servidor → cliente: broadcast `benchmarkState` em cada mudança (não por segundo: o front conta pelo `startedAt`).
  `catalog.benchmark?: BenchmarkState` para cliente novo. Bandeja: "Benchmark: 60 s · 143 FPS · 1% 98" no fim.
- Front:
  - Widget: enquanto `running`, um selo discreto perto do FPS ("BENCH 0:42" contando para baixo) em todos os layouts.
  - Relatórios de jogo › âncora `bench`: lista (jogo, data, duração, FPS, 1%, 0,1%, engasgos, nota editável), botão
    Iniciar (escolhe duração) e Cancelar, comparar dois (reaproveita a tabela de `compare.ts`), compartilhar (card).
  - Atalhos (Pitwall › Recursos/Atalhos): terceira linha "Benchmark".

## 5. Energia e custo
- Acumulador soma `(gpu.power + cpu.power) × dt` (só o que tiver leitura; nenhum dos dois = não conta) →
  `GameSession.energyWh` e `Benchmark.energyWh` (1 casa).
- Front: "Energia ≈ 0,42 kWh (GPU + CPU)" e, com `energy.tariff`, "≈ R$ 0,38". Tooltip: "Estimativa: só placa de vídeo
  e processador, sem o resto do PC." Campo da tarifa e moeda em Relatórios de jogo (perto do histórico).

## Demo (`?demo=1`)
Gera sessões com `gpuDriver` (troca de driver no meio, com queda de FPS), `energyWh`, `gameExit` numa delas,
eventos `sleep/resume/boot/shutdown/appCrash`, uma queda precedida de `sleep`, benchmarks salvos e responde a
`startBenchmark` (roda de verdade com o tempo do demo). Parâmetro `bench=running` força o selo no widget.
