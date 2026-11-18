/**
 * ?demo=v07 — simulador da 0.7 para testar layout sem o backend (ng serve / pré-visualização).
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
 *   scene=nopair     celular: aberto sem código de pareamento
 *   game=<exe>       nome do jogo (ex.: RocketLeague.exe usa o perfil com layout compacto)
 *   update=checking|downloading|ready|error|idle   estado do atualizador
 *   perfcap=thermal|power|voltage|sync|idle|none|na  motivo fixo (na = sem suporte)
 */
import {
  AppConfig,
  Catalog,
  ClockReasonStats,
  CrashReport,
  FeaturesConfig,
  GameSession,
  MetricDef,
  MetricGroup,
  MetricSetting,
  PairedDevice,
  PerfCapReason,
  UpdateState,
  WirelessDevice,
} from './models';
import { TelemetryService, urlParam } from './telemetry.service';

/** 1.0: ?features=a,b liga só a e b; sem o parâmetro, tudo ligado (padrão do backend). */
function demoFeatures(): FeaturesConfig {
  const on = urlParam('features')?.split(',');
  const has = (k: keyof FeaturesConfig) => !on || on.includes(k);
  return { crashReport: has('crashReport'), gameSuggestions: has('gameSuggestions'), sessionPeaks: has('sessionPeaks'), clockReason: has('clockReason') };
}

type Def = [id: string, group: MetricGroup, name: string, unit: string, on?: boolean, warn?: number, crit?: number, spark?: boolean];

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
  ['gpu.hotspot', 'gpu', 'Hot spot', '°C', true, 95, 105, true],
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

const BATTERIES: WirelessDevice[] = [
  { key: 'x', name: 'Xbox Wireless Controller', via: 'Bluetooth', kind: 'gamepad', percent: 80, levelText: null, charging: false, asleep: false, connected: true },
  { key: 'h', name: 'HyperX Cloud III Wireless', via: '2.4 GHz', kind: 'headset', percent: 35, levelText: null, charging: true, asleep: false, connected: true },
  { key: 'm', name: 'Logitech G Pro X Superlight', via: 'Lightspeed', kind: 'mouse', percent: 12, levelText: null, charging: false, asleep: false, connected: true },
];

const NOTES = `## Novidades
- **Picos da sessão** em cada tile e o chip *Limite: power* ao lado da GPU.
- Ver pelo celular na rede local.
- Correções: a bateria não corta mais no compacto.

Detalhes em [GitHub](https://github.com/igoredm/pitwall/releases/tag/v0.7.1).
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
    name,
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
    current: '0.7.0',
    version: updateStatus === 'idle' || updateStatus === 'checking' ? undefined : '0.7.1',
    notesUrl: 'https://github.com/igoredm/pitwall/releases/tag/v0.7.1',
    notes: NOTES,
    channel: 'stable',
    progress: updateStatus === 'downloading' ? 62 : undefined,
    error: updateStatus === 'error' ? 'Não deu para verificar. Sem internet?' : undefined,
    installOnExit: false,
    waitingForGame: false,
    lastCheck: iso(now - 2 * 3600_000),
  };

  const catalog: Catalog = {
    type: 'catalog',
    version: '0.9.0',
    lang: 'pt-BR',
    admin: true,
    presentMon: true,
    battery: true,
    hardware: { cpu: '12th Gen Intel Core i5-12600K', gpu: 'NVIDIA GeForce RTX 3080' },
    monitors: [
      { device: '\\\\.\\DISPLAY1', index: 1, x: 0, y: 0, width: 2560, height: 1440, primary: true },
      { device: '\\\\.\\DISPLAY2', index: 2, x: 2560, y: 180, width: 1920, height: 1080, primary: false },
    ],
    metrics,
    tuning: { supported: true, gpu: 'NVIDIA GeForce RTX 3080', powerMinW: 100, powerMaxW: 370, powerDefaultW: 320, powerStartW: 320, maxClockMhz: 2100 },
    tuningPresets: { balanced: { powerW: 300, clockMhz: 1800 }, cool: { powerW: 260, clockMhz: 1700 } },
    update,
    crashReport,
    remote: { running: true, port: 48124 },
  };

  // ------------------------------------------------------------------ config
  const settings: MetricSetting[] = DEFS.map(([id, , , unit, on, warn, crit, spark], i) => ({
    id,
    enabled: !!on,
    order: i,
    unit: unit === '°C' ? 'C' : undefined,
    warn,
    crit,
    sparkline: !!spark,
  }));
  const devices: PairedDevice[] = empty
    ? []
    : [
        { id: '04388cc23d523135', name: 'iPhone · Safari', created: iso(now - 6 * 86_400_000), lastSeen: iso(now - 30_000) },
        { id: '9a1f0c77e2b04d11', name: 'Android · Chrome', created: iso(now - 16 * 86_400_000), lastSeen: iso(now - 3 * 86_400_000) },
        { id: '5be2c0a9d14f7e30', name: 'TV da sala', created: iso(now - 2 * 86_400_000) },
      ];
  /** 1.0: a mensagem devices traz online (só o iPhone está "vendo agora" na demo). */
  const devicesWithStatus = (): PairedDevice[] =>
    config.remote!.pairedDevices.map((d) => ({ ...d, online: d.id === '04388cc23d523135' }));
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
    tutorialDone: scene !== 'firstrun' && scene !== 'tutorial',
    autoOpenWidgetOnGame: true,
    primaryGpu: 'auto',
    groupLabels: {},
    widget: { visible: true, monitor: '\\\\.\\DISPLAY2', x: 40, y: 40, width: 1280, height: 400, alwaysOnTop: false, locked: false, layout: 'auto' },
    log: { enabled: true, folder: 'C:\\Users\\demo\\AppData\\Local\\Pitwall\\logs', intervalMs: 1000, keepDays: 30, maxTotalMb: 500 },
    gpuTuning: { enabled: true, preset: 'balanced', powerLimitW: 280, maxClockMhz: 1800, onlyInGames: true },
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
    alerts: { enabled: true, sound: false, minIntervalMin: 5 },
    remote: { enabled: !empty, port: 48124, pairedDevices: devices },
    update: { autoCheck: true, channel: 'stable' },
    features: demoFeatures(),
    metrics: settings,
  };
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

  // ------------------------------------------------------------------ respostas às mensagens da página
  const ext: Record<string, [number, number]> = {};
  let epoch = 1;
  let suggestion: { exe: string } | null = empty ? null : { exe: 'eldenring.exe' };
  let stopped = false;
  const send = (m: any) => t.receive(m);

  t.attachDemo((msg: any) => {
    switch (msg.type) {
      case 'setConfig':
        config = structuredClone(msg.config);
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
        send({ type: 'config', config: structuredClone(config) });
        break;
      case 'checkUpdate':
        update = { ...update, status: 'checking' };
        send({ type: 'update', update });
        setTimeout(() => {
          update = { ...update, status: 'available', version: '0.7.1', lastCheck: iso(Date.now()) };
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
    }
  });

  // ------------------------------------------------------------------ início
  if (t.remoteMode) {
    if (scene === 'revoked' || scene === 'nopair') {
      t.remote.set(scene === 'revoked' ? 'revoked' : 'needPair');
      return;
    }
    t.remote.set('live');
  }
  t.connected.set(true);
  send({ ...catalog });
  send({ type: 'config', config: structuredClone(config) });
  if (!t.remoteMode) send({ type: 'sessions', sessions });
  if (config.features?.sessionPeaks !== false) send({ type: 'extremes', epoch, values: {} });

  // ------------------------------------------------------------------ snapshots
  const reasonSec: Partial<Record<PerfCapReason, number>> = { voltage: 410, power: 205, thermal: 38, none: 22 };
  const caps = ['power', 'power', 'power', 'thermal', 'voltage', 'sync', 'none'];
  let capIdx = 0;
  let capLeft = 0;
  let k = 0;
  const tick = () => {
    if (stopped) return;
    k++;
    const g = !idle;
    const wave = Math.sin(k / 9);
    const hot = g ? 96 + wave * 4 + rnd(-0.6, 0.6) : 52 + rnd(-1, 1);
    const core = g ? 74 + wave * 2 + rnd(-0.4, 0.4) : 41 + rnd(-1, 1);
    const fps = g ? 144 + rnd(-6, 4) : null;
    const v: Record<string, number | null> = {
      'fps.current': fps,
      'fps.displayed': fps != null ? fps * 2 - rnd(0, 3) : null,
      'fps.low1': g ? 118 + rnd(-3, 3) : null,
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
      'cpu.temp': g ? 71 + rnd(-2, 2) : 44 + rnd(-1, 1),
      'cpu.power': g ? 88 + rnd(-5, 5) : 12,
      'cpu.clockAvg': 4700,
      'ram.load': 58 + rnd(-0.5, 0.5),
      'ram.used': 18.4,
      'ram.total': 32,
      'ram.virtualLoad': 46,
    };
    for (const key of Object.keys(v)) v[key] = v[key] == null ? null : Math.round(v[key]! * 100) / 100;

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

    send({
      type: 'snapshot',
      t: Date.now(),
      game: g ? { exe, mode: 'fullscreen' } : null,
      values: v,
      texts: config.features?.clockReason === false ? {} : { 'gpu.perfcap': cap },
      clockReasons,
      extremes: delta ? { epoch, values: delta } : undefined,
      profile: g && config.games.profiles?.[exe] ? { exe, ...config.games.profiles[exe] } : null,
      gameSuggestion: config.features?.gameSuggestions === false ? null : suggestion,
      batteries: BATTERIES,
      tuning: g ? { active: true, powerLimitW: 260, clockMaxMhz: 1700 } : { active: false },
      log: { file: 'pitwall_2026-11-18_21-48-00_FC25.csv', size: 1_482_331 + k * 420 },
      fpsStatus: null,
    });
  };
  tick();
  setInterval(tick, 1000);

  if (t.remoteMode && scene === 'reconnect') {
    setTimeout(() => {
      stopped = true;
      t.connected.set(false);
      t.remote.set('reconnecting');
    }, 3000);
  }
}
