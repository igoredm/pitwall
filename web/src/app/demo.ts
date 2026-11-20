/**
 * ?demo=1 (ou ?demo=v07) — simulador para testar layout sem o backend (ng serve / pré-visualização).
 * Gera catálogo, config, snapshots a cada 1 s (com perfcap, picos, bateria), sessões com estatísticas,
 * relatório de queda, "Marcar como jogo?", atualização e pareamento; responde às mensagens da página.
 *
 * Parâmetros extras (na query normal ou dentro do hash, ex.: #/mobile?demo=v07&scene=reconnect):
 *   scene=idle       sem jogo (relógio; "Última sessão" mostra a sessão terminada)
 *   scene=empty      sem sessões, sem relatório, sem celulares, atualizador em dia
 *   scene=firstrun   config sem firstRunDone (abre o assistente)
 *   scene=tutorial   1.0: só tutorialDone = false (o tutorial das configurações aparece)
 *   features=crashReport,sessionPeaks   1.0: só esses recursos ligados (sem o parâmetro, todos ligados)
 *   scene=reconnect  celular: para de receber depois de 3 s (banner "Sem conexão")
 *   scene=revoked    celular: acesso revogado
 *   scene=nopair     celular/TV: tela de código. 482913 pareia; outro código = "não confere" (4, 3… tentativas e
 *                    depois bloqueio de 5 min). pair=expired|blocked|nopending força a resposta. tv=1 força o layout de TV.
 *   tour=<0–8>       1.0: passo do tour já visto (Visão geral mostra "Primeiros passos" com o progresso)
 *   appearance=light|dark|system   1.0: visual das configurações
 *   gpu=amd          1.0: sem NVIDIA (ajuste da GPU e motivo do clock sem suporte)
 *   monitors=1       1.2: um monitor só (assistente: "Ver no celular ou na TV" / "Deixar no canto"); com scene=firstrun
 *   layout=strip|mini|…  força o layout do widget (sem o parâmetro, o Automático escolhe pelo tamanho da janela:
 *                    2560×720 e 1920×480 = faixa; 800×480, 1024×600 e 480×320 = telinha)
 *   battery=none     1.0: leitor de bateria não encontrado
 *   remote=busy      1.0: porta do celular ocupada
 *   logs=empty       1.0: pasta de CSV vazia
 *   offline=1        1.0: perde a conexão com o Pitwall depois de 4 s (aviso "Sem conexão")
 * Mensagens do host (bandeja) no console: pitwallHost({ type: 'startTutorial' }) ou
 *   pitwallHost({ type: 'navigate', page: 'sessions', anchor: 'crash' }).
 *   game=<exe>       nome do jogo (ex.: RocketLeague.exe usa o perfil com layout compacto)
 *   update=checking|downloading|ready|error|idle   estado do atualizador
 *   perfcap=thermal|power|voltage|sync|idle|none|na  motivo fixo (na = sem suporte)
 * Cenários do site (modo teste da página de divulgação):
 *   heat=warm|hot    GPU esquentando: hot spot/núcleo no amarelo (warm) ou no vermelho (hot)
 *   fps=anticheat    FPS bloqueado pelo anti-cheat (fpsStatus + fps.reason), temperaturas seguem
 *   stutter=1        engasgos: picos de frametime a cada ~5 s (liga o gráfico de frametime)
 *   battery=low      mouse e headset sem fio com bateria baixa
 */
import {
  AppConfig,
  Catalog,
  ClockReasonStats,
  CrashReport,
  FeaturesConfig,
  GameSession,
  LogKeepDays,
  MetricDef,
  MetricGroup,
  MetricSetting,
  PairedDevice,
  PerfCapReason,
  UpdateState,
  WirelessDevice,
} from './models';
import { startReportsDemo } from './demo-reports';
import { TelemetryService, urlParam } from './telemetry.service';
import { demo12Monitor } from './demo-12-monitor';

/** 1.0: ?features=a,b liga só a e b; sem o parâmetro, tudo ligado (padrão do backend). */
function demoFeatures(): FeaturesConfig {
  const on = urlParam('features')?.split(',');
  const has = (k: keyof FeaturesConfig) => !on || on.includes(k);
  return { crashReport: has('crashReport'), gameSuggestions: has('gameSuggestions'), sessionPeaks: has('sessionPeaks'), clockReason: has('clockReason'), openSummaryOnGameEnd: !!on?.includes('openSummaryOnGameEnd') };
}

type Def = [id: string, group: MetricGroup, name: string, unit: string, on?: boolean, warn?: number, crit?: number, spark?: boolean];

/** Nomes em inglês da demonstração (?lang=en; o backend real já manda o nome no idioma do Windows). */
const DEF_EN: Record<string, string> = {
  'fps.displayed': 'Displayed FPS',
  'fps.avg': 'Session average FPS',
  'fps.graph': 'Frametime graph',
  'gpu.load': 'Load',
  'gpu.temp': 'Core',
  'gpu.hotspotDelta': 'Δ hot spot − core',
  'gpu.power': 'Power',
  'gpu.clock': 'Core clock',
  'gpu.memclock': 'Memory clock',
  'gpu.powerLimit': '% of power limit',
  'gpu.vramUsed': 'VRAM used',
  'gpu.vramLoad': 'VRAM load',
  'gpu.voltage': 'Core voltage',
  'gpu.perfcap': 'Clock limit reason',
  'cpu.load': 'Total load',
  'cpu.power': 'Package power',
  'cpu.clockAvg': 'Average clock',
  'ram.load': 'Load',
  'ram.used': 'Used / total',
  'ram.virtualLoad': 'Virtual memory (commit)',
};
const demoEn = () => urlParam('lang') === 'en';

const DEFS: Def[] = [
  ['fps.current', 'fps', 'FPS', 'fps', true],
  ['fps.displayed', 'fps', 'FPS exibido', 'fps'],
  ['fps.low1', 'fps', '1% low', 'fps', true],
  ['fps.frametime', 'fps', 'Frametime', 'ms', true],
  ['fps.low01', 'fps', '0.1% low', 'fps'],
  ['fps.avg', 'fps', 'FPS médio da sessão', 'fps'],
  ['fps.graph', 'fps', 'Gráfico de frametime', 'graph'],
  ['gpu.load', 'gpu', 'Uso', '%', true],
  ['gpu.temp', 'gpu', 'Núcleo', '°C', true, 80, 87, true],
  ['gpu.hotspot', 'gpu', 'Hot spot', '°C', true, 95, 100, true],
  ['gpu.memjunction', 'gpu', 'Memory junction', '°C', true, 95, 104, true],
  ['gpu.hotspotDelta', 'gpu', 'Δ hot spot − núcleo', '°C', true, 20, 25],
  ['gpu.power', 'gpu', 'Consumo', 'W', true],
  ['gpu.clock', 'gpu', 'Clock do núcleo', 'MHz', true],
  ['gpu.memclock', 'gpu', 'Clock da memória', 'MHz'],
  ['gpu.powerLimit', 'gpu', '% do power limit', '%'],
  ['gpu.vramUsed', 'gpu', 'VRAM usada', 'GB'],
  ['gpu.vramLoad', 'gpu', 'Ocupação da VRAM', '%'],
  ['gpu.fan', 'gpu', 'Fan', '%'],
  ['gpu.fanRpm', 'gpu', 'Fan', 'RPM'],
  ['gpu.voltage', 'gpu', 'Voltagem do núcleo', 'V'],
  ['gpu.perfcap', 'gpu', 'Motivo de limitação do clock', 'text'],
  ['cpu.load', 'cpu', 'Uso total', '%', true],
  ['cpu.temp', 'cpu', 'Package', '°C', true, 85, 95, true],
  ['cpu.power', 'cpu', 'Consumo do pacote', 'W'],
  ['cpu.clockAvg', 'cpu', 'Clock médio', 'MHz'],
  ['ram.load', 'ram', 'Uso', '%', true, 85, 95],
  ['ram.used', 'ram', 'Usada / total', 'GB', true],
  ['ram.total', 'ram', 'Total', 'GB'],
  ['ram.virtualLoad', 'other', 'Memória virtual (commit)', '%'],
];

/** ?battery=low: mouse e headset abaixo do limite de bateria baixa. */
const LOW_BATTERIES: WirelessDevice[] = [
  { key: 'x', name: 'Xbox Wireless Controller', via: 'Bluetooth', kind: 'gamepad', percent: 64, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'h', name: 'HyperX Cloud III Wireless', via: '2.4 GHz', kind: 'headset', percent: 9, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'm', name: 'Logitech G Pro X Superlight', via: 'Lightspeed', kind: 'mouse', percent: 4, levelText: null, charging: false, asleep: false, connected: true },
];

const BATTERIES: WirelessDevice[] = [
  { key: 'x', name: 'Xbox Wireless Controller', via: 'Bluetooth', kind: 'gamepad', percent: 80, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'h', name: 'HyperX Cloud III Wireless', via: '2.4 GHz', kind: 'headset', percent: 35, levelText: null, charging: true, asleep: false, connected: true },
  { key: 'm', name: 'Logitech G Pro X Superlight', via: 'Lightspeed', kind: 'mouse', percent: 12, levelText: null, charging: false, asleep: false, connected: true },
];

const NOTES = `## Novidades
- **Picos da sessão** em cada tile e o chip *Limite: power* ao lado da GPU.
- Ver pelo celular na rede local.
- Correções: a bateria não corta mais no compacto.

Detalhes em [GitHub](https://github.com/igoredm/pitwall/releases/tag/v1.0.1).
<script>alert('isto não pode rodar')</script> <img src=x onerror="alert(1)">`;

const iso = (ms: number) => new Date(ms).toISOString();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function startDemo(t: TelemetryService) {
  const scene = urlParam('scene') ?? '';
  const now = Date.now();
  const idle = scene === 'idle' || scene === 'empty';
  const empty = scene === 'empty';
  const exe = urlParam('game') ?? 'FC25.exe';
  const fixedCap = urlParam('perfcap');
  const min = 60_000;

  // ------------------------------------------------------------------ catálogo
  const metrics: MetricDef[] = DEFS.map(([id, group, name, unit, , warn, crit]) => ({
    id,
    group,
    name: demoEn() ? (DEF_EN[id] ?? name) : name,
    unit,
    isTemperature: unit === '°C',
    available: !(id === 'gpu.perfcap' && fixedCap === 'na'),
    source: unit === 'fps' || unit === 'ms' ? 'PresentMon' : 'NVIDIA GeForce RTX 3080',
    defaultWarn: warn,
    defaultCrit: crit,
  }));

  const yesterday = new Date(now - 86_400_000);
  yesterday.setHours(22, 0, 0, 0);
  const crashStart = yesterday.getTime();
  const crashSession: GameSession = {
    exe: 'FC25.exe',
    start: iso(crashStart),
    durationSec: 31 * 60,
    avgFps: 138,
    low1: 104,
    peakHotspot: 104,
    peakGpuTemp: 81,
    csvFile: 'pitwall_2026-11-17_22-00-00_FC25.csv',
  };
  const series = (base: number[], noise: number, last?: number | null) => {
    const out: (number | null)[] = [];
    for (let i = 0; i < 60; i++) {
      const k = i / 59;
      const v = base[0] + (base[1] - base[0]) * k + rnd(-noise, noise);
      out.push(Math.round(v * 10) / 10);
    }
    if (last !== undefined) out[59] = last;
    return out;
  };
  const crashReport: CrashReport | undefined = empty
    ? undefined
    : {
        reason: 'both',
        session: crashSession,
        time: iso(crashStart + 41 * min + 8000),
        kernelPowerTime: iso(crashStart + 43 * min),
        intervalMs: 1000,
        series: {
          'gpu.temp': series([76, 81], 0.6),
          'gpu.hotspot': series([99, 104], 0.6),
          'gpu.power': series([312, 320], 3, 96),
          'gpu.clock': series([1860, 1755], 8, 210),
          'fps.current': series([142, 128], 2, null),
          'cpu.temp': series([68, 74], 1),
        },
        csvFile: 'pitwall_2026-11-17_22-00-00_FC25.csv',
      };

  const updateStatus = (urlParam('update') ?? (empty ? 'idle' : 'available')) as UpdateState['status'];
  let update: UpdateState = {
    status: updateStatus,
    current: '1.0.0',
    version: updateStatus === 'idle' || updateStatus === 'checking' ? undefined : '1.0.1',
    notesUrl: 'https://github.com/igoredm/pitwall/releases/tag/v1.0.1',
    notes: NOTES,
    channel: 'stable',
    progress: updateStatus === 'downloading' ? 62 : undefined,
    error: updateStatus === 'error' ? 'Não deu para verificar. Sem internet?' : undefined,
    installOnExit: false,
    waitingForGame: false,
    lastCheck: iso(now - 2 * 3600_000),
  };

  const amd = urlParam('gpu') === 'amd';
  const catalog: Catalog = {
    type: 'catalog',
    version: '1.0.0',
    lang: demoEn() ? 'en' : 'pt-BR',
    admin: true,
    presentMon: true,
    battery: urlParam('battery') !== 'none',
    hardware: { cpu: '12th Gen Intel Core i5-12600K', gpu: amd ? 'AMD Radeon RX 7800 XT' : 'NVIDIA GeForce RTX 3080' },
    monitors: [
      { device: '\\\\.\\DISPLAY1', index: 1, x: 0, y: 0, width: 2560, height: 1440, primary: true },
      { device: '\\\\.\\DISPLAY2', index: 2, x: 2560, y: 180, width: 1920, height: 1080, primary: false },
    ].slice(0, urlParam('monitors') === '1' ? 1 : 2),
    metrics,
    tuning: amd
      ? { supported: false, powerMinW: 0, powerMaxW: 0, powerDefaultW: 0, powerStartW: 0, maxClockMhz: 0, error: 'Precisa de uma GPU NVIDIA.' }
      : { supported: true, gpu: 'NVIDIA GeForce RTX 3080', powerMinW: 100, powerMaxW: 370, powerDefaultW: 320, powerStartW: 320, maxClockMhz: 2100 },
    tuningPresets: { balanced: { powerW: 300, clockMhz: 1800 }, cool: { powerW: 260, clockMhz: 1700 } },
    update,
    crashReport,
    remote: urlParam('remote') === 'busy' ? { running: false, port: 48124, error: 'portInUse' } : { running: true, port: 48124 },
    about: { app: '1.0.0', dotnet: '10.0.1', webView2: '142.0.3595.53', presentMon: '2.3.1', pawnIO: '2.0.1' },
  };
  if (amd) for (const m of metrics) if (m.id === 'gpu.perfcap') m.available = false;
  // 1.2: Monitor, sensores sem leitura, atalhos, lista de sensores e Home Assistant (demo-12-monitor.ts)
  const v12 = demo12Monitor(catalog, metrics, now, empty, !idle);

  // ------------------------------------------------------------------ config
  const stutterScene = urlParam('stutter') === '1';
  const settings: MetricSetting[] = DEFS.map(([id, , , unit, on, warn, crit, spark], i) => ({
    id,
    enabled: !!on || (stutterScene && id === 'fps.graph'),
    order: i,
    unit: unit === '°C' ? 'C' : undefined,
    warn,
    crit,
    sparkline: !!spark,
  }));
  const devices: PairedDevice[] = empty
    ? []
    : [
        { id: '5be2c0a9d14f7e30', name: 'TV da sala · Android TV', kind: 'tv', created: iso(now - 4 * 3600_000), lastSeen: iso(now - 20_000) },
        { id: '04388cc23d523135', name: 'iPhone · Safari', kind: 'phone', created: iso(now - 6 * 86_400_000), lastSeen: iso(now - 3 * 86_400_000) },
        { id: '9a1f0c77e2b04d11', name: 'Android · Chrome', kind: 'phone', created: iso(now - 16 * 86_400_000), lastSeen: iso(now - 15 * 86_400_000) },
      ];
  /** 1.0: a mensagem devices traz online (só a TV está "vendo agora" na demo). */
  const devicesWithStatus = (): PairedDevice[] =>
    config.remote!.pairedDevices.map((d) => ({ ...d, online: d.id === '5be2c0a9d14f7e30' }));
  let config: AppConfig = {
    refreshMs: 1000,
    webSocketPort: 48123,
    appTheme: urlParam('appTheme') ?? 'lumen',
    widgetTheme: urlParam('theme') ?? 'lumen',
    themeMode: (urlParam('mode') as AppConfig['themeMode']) ?? 'dark',
    accent: '',
    language: 'auto',
    startWithWindows: true,
    firstRunDone: scene !== 'firstrun',
    tutorialDone: scene !== 'firstrun' && scene !== 'tutorial' && !urlParam('tour'),
    tour: {
      step: Number(urlParam('tour') ?? (scene === 'firstrun' || scene === 'tutorial' ? 0 : 8)) || 0,
      done: scene !== 'firstrun' && scene !== 'tutorial' && !urlParam('tour'),
      dismissed: false,
    },
    appearance: (urlParam('appearance') as AppConfig['appearance']) ?? 'system',
    autoOpenWidgetOnGame: true,
    primaryGpu: 'auto',
    groupLabels: {},
    widget: { visible: true, monitor: '\\\\.\\DISPLAY2', x: 40, y: 40, width: 1280, height: 400, alwaysOnTop: false, locked: false, layout: 'auto' },
    log: { enabled: true, folder: 'C:\\Users\\demo\\AppData\\Local\\Pitwall\\logs', intervalMs: 1000, keepDays: 30, maxTotalMb: 2048 },
    gpuTuning: { enabled: false, preset: 'balanced', powerLimitW: 280, maxClockMhz: 1800, onlyInGames: true },
    battery: { enabled: true, hidden: [], lowPercent: 15 },
    games: {
      autoDetect: true,
      include: ['FC25.exe'],
      ignore: ['explorer.exe', 'chrome.exe', 'Discord.exe', 'Pitwall.exe'],
      profiles: {
        'FC25.exe': { tuningPreset: 'cool' },
        'RocketLeague.exe': { layout: 'compact' },
        'Cyberpunk2077.exe': { tuningPreset: 'custom', layout: 'full' },
      },
      dismissedSuggestions: [],
    },
    alerts: { enabled: true, sound: false, minIntervalMin: 5, sustainSec: 10 },
    remote: { enabled: !empty, port: 48124, pairedDevices: devices },
    update: { autoCheck: true, channel: 'stable' },
    features: demoFeatures(),
    metrics: settings,
  };
  v12.config(config);
  // Recurso desligado: o backend não manda o relatório de queda
  if (!config.features?.crashReport) catalog.crashReport = undefined;

  // ------------------------------------------------------------------ sessões
  const today = new Date(now);
  today.setHours(21, 2, 0, 0);
  const lastStart = Math.min(today.getTime(), now - 50 * min);
  const finished: GameSession = {
    exe: 'FC25.exe',
    start: iso(lastStart),
    end: iso(lastStart + 45 * min),
    durationSec: 45 * 60,
    avgFps: 141,
    low1: 112,
    low01: 88,
    peakGpuTemp: 79,
    peakHotspot: 101,
    peakHotspotDelta: 27,
    peakGpuPower: 342,
    secondsAboveWarn: { 'gpu.hotspot': 372, 'gpu.hotspotDelta': 290 },
    secondsAboveCrit: { 'gpu.hotspot': 48 },
    clockReasonSec: { voltage: 1490, power: 812, thermal: 166, sync: 4, none: 228 },
    csvFile: 'pitwall_2026-11-18_21-02-00_FC25.csv',
  };
  const sunday = new Date(now - 3 * 86_400_000);
  sunday.setHours(19, 40, 0, 0);
  const rocket: GameSession = {
    exe: 'RocketLeague.exe',
    start: iso(sunday.getTime()),
    end: iso(sunday.getTime() + 65 * min),
    durationSec: 65 * 60,
    peakHotspot: 88,
    peakGpuTemp: 71,
    csvFile: 'pitwall_2026-11-15_19-40-00_RocketLeague.csv',
  };
  const gameStart = now - 12 * min;
  const current: GameSession = { exe, start: iso(gameStart) };
  const sessions: GameSession[] = empty ? [] : [...(idle ? [] : [current]), finished, crashSession, rocket];
  // 1.0: histórico guardado pela retenção (~140 sessões em 30 dias), para getSessions paginar e filtrar
  const history: GameSession[] = [...sessions];
  if (!empty) {
    const games = ['FC25.exe', 'Cyberpunk2077.exe', 'RocketLeague.exe', 'eafc25.exe', 'Valorant.exe'];
    let at = sunday.getTime() - 20 * 3600_000;
    for (let i = 0; i < 139; i++) {
      const g = games[(i * 7 + (i >> 2)) % games.length];
      const dur = Math.round(20 + ((i * 37) % 120)) * 60;
      const fpsAvg = g === 'Cyberpunk2077.exe' ? 70 + (i % 9) : g === 'RocketLeague.exe' ? undefined : 130 + (i % 15);
      history.push({
        exe: g,
        start: iso(at),
        end: iso(at + dur * 1000),
        durationSec: dur,
        avgFps: fpsAvg,
        low1: fpsAvg != null ? Math.round(fpsAvg * 0.78) : undefined,
        peakGpuTemp: 70 + (i % 10),
        peakHotspot: 86 + ((i * 3) % 19),
        csvFile: `pitwall_${new Date(at).toISOString().slice(0, 10)}_${g.replace('.exe', '')}.csv`,
      });
      at -= (3 + (i % 5) * 2) * 3600_000;
    }
  }

  // 1.2: Relatório do PC, campos novos das sessões e getSessionSeries (demo-reports.ts)
  const reports = startReportsDemo({ now, empty, catalog, config: () => config, sessions, history, crashSession: empty ? undefined : crashSession });

  // 1.0: arquivos da pasta de CSV (um por sessão + alguns soltos), para getLogStats e a prévia da retenção
  const logFiles: { t: number; bytes: number }[] =
    empty || urlParam('logs') === 'empty' ? [] : Array.from({ length: 212 }, (_, i) => ({ t: now - i * 3.4 * 3600_000 - 600_000, bytes: Math.round((4.2 + ((i * 13) % 9)) * 1024 * 1024) }));
  const logStats = (keepDays?: LogKeepDays, maxTotalMb?: number) => {
    const totalBytes = logFiles.reduce((a, f) => a + f.bytes, 0);
    const oldest = logFiles.length ? iso(logFiles[logFiles.length - 1].t) : null;
    // A mais nova nunca sai (é a da sessão mais recente); depois o prazo; depois o teto, das mais velhas para as novas
    const days = keepDays ?? config.log.keepDays ?? 30;
    const cap = (maxTotalMb ?? config.log.maxTotalMb ?? 0) * 1024 * 1024;
    const keep = logFiles.filter((f, i) => i === 0 || !days || now - f.t <= days * 86_400_000);
    let sum = keep.reduce((a, f) => a + f.bytes, 0);
    while (cap && sum > cap && keep.length > 1) sum -= keep.pop()!.bytes;
    return {
      type: 'logStats',
      totalBytes,
      files: logFiles.length,
      oldest,
      wouldDeleteFiles: logFiles.length - keep.length,
      wouldDeleteBytes: totalBytes - sum,
    };
  };

  // ------------------------------------------------------------------ respostas às mensagens da página
  const ext: Record<string, [number, number]> = {};
  let epoch = 1;
  let suggestion: { exe: string } | null = empty ? null : { exe: 'eldenring.exe' };
  let stopped = false;
  const send = (m: any) => t.receive(m);

  let pairErrors = 0;
  t.attachDemo((msg: any) => {
    if (reports.handle(msg, send)) return;
    switch (msg.type) {
      case 'setConfig':
        config = structuredClone(msg.config);
        // tutorialDone é apelido de tour.done (como no backend)
        if (config.tour) config.tutorialDone = config.tour.done;
        if (!config.remote?.enabled) catalog.remote = { running: false };
        else catalog.remote = { running: true, port: config.remote.port };
        send({ ...catalog });
        send({ type: 'config', config: structuredClone(config) });
        break;
      case 'restoreDefaults':
        send({ type: 'config', config: structuredClone(config) });
        break;
      case 'resetExtremes':
        epoch++;
        for (const k of Object.keys(ext)) delete ext[k];
        send({ type: 'extremes', epoch, values: {} });
        break;
      case 'dismissCrashReport':
        catalog.crashReport = undefined;
        send({ ...catalog });
        break;
      case 'acceptGameSuggestion':
      case 'dismissGameSuggestion':
        if (suggestion) {
          (msg.type === 'acceptGameSuggestion' ? config.games.include : config.games.dismissedSuggestions!).push(suggestion.exe);
          suggestion = null;
          send({ type: 'config', config: structuredClone(config) });
        }
        break;
      case 'startPairing':
        if (!config.remote?.enabled) send({ type: 'pairing', ok: false, error: 'disabled' });
        else {
          // 1.0: 6 dígitos (o backend usa CSPRNG; aqui tanto faz)
          const code = String(Math.floor(Math.random() * 1_000_000)).padStart(6, '0');
          const url = `http://192.168.0.20:48124/index.html#/mobile?pair=${code}`;
          const typeUrl = 'http://192.168.0.20:48124/';
          send({ type: 'pairing', ok: true, code, url, urls: [url], typeUrl, typeUrls: [typeUrl], expiresAt: iso(Date.now() + 120_000) });
        }
        break;
      case 'listDevices':
        send({ type: 'devices', devices: devicesWithStatus() });
        break;
      case 'revokeDevice':
        config.remote!.pairedDevices = config.remote!.pairedDevices.filter((d) => d.id !== msg.id);
        send({ type: 'config', config: structuredClone(config) });
        send({ type: 'devices', devices: devicesWithStatus() });
        break;
      case 'replayTutorial':
        config.tutorialDone = false;
        config.tour = { step: 0, done: false, dismissed: false };
        send({ type: 'config', config: structuredClone(config) });
        break;
      case 'getLogStats':
        setTimeout(() => send(logStats(msg.keepDays, msg.maxTotalMb) as any), 120);
        break;
      case 'getSessions': {
        const list = msg.exe ? history.filter((x) => x.exe.toLowerCase() === String(msg.exe).toLowerCase()) : history;
        const limit = Math.min(100, msg.limit ?? 20);
        setTimeout(() => send({ type: 'sessionsPage', total: list.length, offset: msg.offset, sessions: list.slice(msg.offset, msg.offset + limit) }), 150);
        break;
      }
      case 'pair': {
        // Celular/TV: código digitado (482913 pareia)
        const forced = urlParam('pair');
        setTimeout(() => {
          if (forced === 'expired' || forced === 'nopending') send({ type: 'paired', ok: false, error: forced === 'expired' ? 'expired' : 'noPending' });
          else if (forced === 'blocked' || pairErrors >= 5) send({ type: 'paired', ok: false, error: 'blocked', retryAfterSec: 299 });
          else if (String(msg.code).replace(/\D/g, '') === '482913') {
            send({ type: 'paired', ok: true, deviceId: 'demo', name: msg.name || 'Celular', token: 'demo-token' });
            // o widget só chega depois do "Pareado"
            setTimeout(() => startFeed(), 1600);
          } else {
            pairErrors++;
            send({ type: 'paired', ok: false, error: pairErrors >= 5 ? 'blocked' : 'invalidCode', attemptsLeft: 5 - pairErrors, retryAfterSec: pairErrors >= 5 ? 300 : undefined });
          }
        }, 700);
        break;
      }
      case 'checkUpdate':
        update = { ...update, status: 'checking' };
        send({ type: 'update', update });
        setTimeout(() => {
          update = { ...update, status: 'available', version: '1.0.1', lastCheck: iso(Date.now()) };
          send({ type: 'update', update });
        }, 1500);
        break;
      case 'installUpdate': {
        update = { ...update, status: 'downloading', progress: 0, installOnExit: msg.when === 'exit' };
        const tick = setInterval(() => {
          update = { ...update, progress: Math.min(100, (update.progress ?? 0) + 17) };
          if (update.progress === 100) {
            clearInterval(tick);
            update = { ...update, status: 'ready', waitingForGame: msg.when === 'now' && !idle };
          }
          send({ type: 'update', update });
        }, 600);
        send({ type: 'update', update });
        break;
      }
      case 'skipUpdate':
        config.update = { ...config.update!, skippedVersion: update.version };
        update = { ...update, status: 'idle', version: undefined };
        send({ type: 'update', update });
        send({ type: 'config', config: structuredClone(config) });
        break;
      case 'setUpdateChannel':
        update = { ...update, channel: msg.channel };
        config.update = { ...config.update!, channel: msg.channel };
        send({ type: 'update', update });
        break;
      case 'getUpdate':
        send({ type: 'update', update });
        break;
      default:
        v12.handle(msg, send, config);
    }
  });

  // Console: pitwallHost({ type: 'startTutorial' }) simula a bandeja
  (window as any).pitwallHost = (m: unknown) => t.emitHost(m);

  // ------------------------------------------------------------------ início
  let fed = false;
  const startFeed = () => {
    if (fed) return;
    fed = true;
    t.connected.set(true);
    send({ ...catalog });
    send({ type: 'config', config: structuredClone(config) });
    if (!t.remoteMode) send({ type: 'sessions', sessions });
    if (config.features?.sessionPeaks !== false) send({ type: 'extremes', epoch, values: {} });
    if (!t.remoteMode) v12.start(send);
    tick();
    setInterval(tick, 1000);
  };
  let autoFeed = true;
  if (t.remoteMode) {
    if (scene === 'revoked' || scene === 'nopair') {
      t.remote.set(scene === 'revoked' ? 'revoked' : 'needPair');
      autoFeed = false;
    } else t.remote.set('live');
  }
  if (urlParam('offline') === '1')
    setTimeout(() => {
      stopped = true;
      t.connected.set(false);
    }, 4000);

  // ------------------------------------------------------------------ snapshots
  const reasonSec: Partial<Record<PerfCapReason, number>> = { voltage: 410, power: 205, thermal: 38, none: 22 };
  const caps = ['power', 'power', 'power', 'thermal', 'voltage', 'sync', 'none'];
  let capIdx = 0;
  let capLeft = 0;
  let k = 0;
  let spikes = 0;
  const tick = () => {
    if (stopped) return;
    k++;
    const g = !idle;
    const wave = Math.sin(k / 9);
    // heat=warm|hot: base mais quente (amarelo: hot spot ~97 / núcleo ~83; vermelho: ~103 / ~89)
    const heat = urlParam('heat');
    const hotBase = heat === 'hot' ? 103 : heat === 'warm' ? 97 : null;
    const hot = g ? (hotBase != null ? hotBase + wave * 1.2 : 96 + wave * 4) + rnd(-0.6, 0.6) : 52 + rnd(-1, 1);
    const core = g ? (heat === 'hot' ? 89 : heat === 'warm' ? 83 : 74) + wave * (hotBase != null ? 0.8 : 2) + rnd(-0.4, 0.4) : 41 + rnd(-1, 1);
    // stutter=1: a cada 5 s um engasgo (o FPS do segundo cai e o frametime dá um pico)
    const spike = g && stutterScene && k % 5 === 0;
    const fps = g ? (spike ? 96 + rnd(-6, 6) : 144 + rnd(-6, 4)) : null;
    const v: Record<string, number | null> = {
      'fps.current': fps,
      'fps.displayed': fps != null ? fps * 2 - rnd(0, 3) : null,
      'fps.low1': g ? (stutterScene ? 74 + rnd(-3, 3) : 118 + rnd(-3, 3)) : null,
      'fps.low01': g ? 92 + rnd(-4, 4) : null,
      'fps.frametime': fps ? 1000 / fps : null,
      'fps.avg': g ? 141 : null,
      'gpu.load': g ? 97 + rnd(-2, 2) : 6 + rnd(0, 4),
      'gpu.temp': core,
      'gpu.hotspot': hot,
      'gpu.memjunction': g ? 86 + wave * 3 : 48,
      'gpu.hotspotDelta': hot - core,
      'gpu.power': g ? 318 + rnd(-8, 4) : 32 + rnd(0, 6),
      'gpu.powerLimit': g ? 99 : 10,
      'gpu.clock': g ? 1845 + rnd(-30, 15) : 210,
      'gpu.memclock': g ? 9501 : 405,
      'gpu.vramUsed': 7.2,
      'gpu.vramLoad': 72,
      'gpu.fan': g ? 72 : 0,
      'gpu.fanRpm': g ? 2140 : 0,
      'gpu.voltage': g ? 0.95 : 0.73,
      'cpu.load': g ? 41 + rnd(-6, 6) : 4 + rnd(0, 3),
      'cpu.temp': g ? (heat === 'hot' ? 86 : 71) + rnd(-2, 2) : 44 + rnd(-1, 1),
      'cpu.power': g ? 88 + rnd(-5, 5) : 12,
      'cpu.clockAvg': 4700,
      'ram.load': 58 + rnd(-0.5, 0.5),
      'ram.used': 18.4,
      'ram.total': 32,
      'ram.virtualLoad': 46,
    };
    for (const key of Object.keys(v)) v[key] = v[key] == null ? null : Math.round(v[key]! * 100) / 100;
    v12.values(v, g, k);
    if (spike) spikes++;
    if (stutterScene && v['fps.stutters'] != null) v['fps.stutters'] += spikes;

    // frametime por frame (~60 por snapshot) para o gráfico; o engasgo é um frame de 60–90 ms
    let frames: number[] | undefined;
    if (v['fps.current'] != null) {
      frames = Array.from({ length: 60 }, () => Math.round((1000 / 144 + rnd(-0.6, 0.9)) * 100) / 100);
      if (spike) frames[30] = Math.round(rnd(60, 90));
    }

    // perfcap: alterna motivos (com durações curtas de propósito, para ver o anti-tremido funcionar)
    let cap: string | null;
    if (fixedCap) cap = fixedCap === 'na' ? null : fixedCap;
    else if (!g) cap = 'idle';
    else {
      if (capLeft-- <= 0) {
        capIdx = (capIdx + 1) % caps.length;
        capLeft = caps[capIdx] === 'sync' ? 1 : 6 + Math.round(rnd(0, 8));
      }
      cap = caps[capIdx];
    }

    // 1.0: segundos por motivo do limite de clock (sessão atual ao vivo; fora de jogo, a última)
    if (g && cap) reasonSec[cap as PerfCapReason] = (reasonSec[cap as PerfCapReason] ?? 0) + 1;
    const clockReasons: ClockReasonStats | undefined = !config.features?.clockReason
      ? undefined
      : g
        ? { live: true, exe, sec: { ...reasonSec } }
        : finished.clockReasonSec
          ? { live: false, exe: finished.exe, sec: finished.clockReasonSec }
          : undefined;

    // picos: mín/máx só durante o jogo; manda no snapshot as chaves que mudaram
    let delta: Record<string, [number, number]> | undefined;
    if (g && config.features?.sessionPeaks !== false) {
      for (const [key, val] of Object.entries(v)) {
        if (val == null) continue;
        const cur = ext[key];
        if (!cur || val < cur[0] || val > cur[1]) {
          ext[key] = cur ? [Math.min(cur[0], val), Math.max(cur[1], val)] : [val, val];
          (delta ??= {})[key] = ext[key];
        }
      }
      if (k === 1) {
        // começa com picos "históricos" da sessão, como no design (máx 101 no hot spot)
        ext['gpu.hotspot'] = [74, 101.2];
        ext['gpu.temp'] = [61, 78];
        ext['gpu.memjunction'] = [70, 92];
        ext['gpu.hotspotDelta'] = [12, 26];
        ext['gpu.power'] = [120, 342];
        ext['gpu.clock'] = [1650, 1905];
        ext['cpu.temp'] = [55, 84];
        delta = { ...ext };
      }
    }

    send(v12.snapshot({
      type: 'snapshot',
      t: Date.now(),
      game: g ? { exe, mode: 'fullscreen' } : null,
      values: v,
      texts: config.features?.clockReason === false ? {} : { 'gpu.perfcap': cap },
      clockReasons,
      extremes: delta ? { epoch, values: delta } : undefined,
      profile: g && config.games.profiles?.[exe] ? { exe, ...config.games.profiles[exe] } : null,
      gameSuggestion: config.features?.gameSuggestions === false ? null : suggestion,
      batteries: urlParam('battery') === 'low' ? LOW_BATTERIES : BATTERIES,
      frames,
      tuning: g && config.gpuTuning.enabled ? { active: true, powerLimitW: 260, clockMaxMhz: 1700 } : { active: false },
      log: { file: 'pitwall_2026-11-18_21-48-00_FC25.csv', size: 1_482_331 + k * 420 },
      fpsStatus: g && urlParam('fps') === 'anticheat' ? 'O anti-cheat do jogo bloqueia a leitura do FPS (ETW).' : null,
    }));
  };
  if (autoFeed) startFeed();

  if (t.remoteMode && scene === 'reconnect') {
    setTimeout(() => {
      stopped = true;
      t.connected.set(false);
      t.remote.set('reconnecting');
    }, 3000);
  }
}
