/**
 * 1.2 · parte do ?demo=1 do Monitor, dos sensores sem leitura, dos atalhos, da lista de sensores e do Home Assistant.
 * Fica fora do demo.ts para não conflitar com as outras frentes; o demo.ts só chama estes ganchos.
 *
 *   ?demo=1          RTX 3080: hot spot no vermelho, sem PawnIO (consumo da CPU sem leitura), HD sem temperatura,
 *                    latência do PC sem leitura, atalho do marcador "em uso", incidente do PC não visto
 *   ?demo=v07        (ou gpu=rtx50) RTX 5070 Ti: "A NVIDIA tirou o hot spot das RTX 50"; FPS bloqueado pelo anti-cheat
 *   admin=0          sem administrador: o grupo FPS inteiro sem leitura (vira uma linha só)
 */
import { AppConfig, Catalog, MetricDef, MetricSetting, PairedDevice } from './models';
import { urlParam } from './telemetry.service';

const iso = (ms: number) => new Date(ms).toISOString();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

type Send = (m: any) => void;

export interface Demo12 {
  config(c: AppConfig): void;
  start(send: Send): void;
  /** Valores novos (discos, rede, engasgos…) e os que faltam no cenário. */
  values(v: Record<string, number | null>, inGame: boolean, k: number): void;
  /** Acrescenta texts['fps.reason'] e o delta de extremesApp ao snapshot. */
  snapshot(msg: any): any;
  /** Mensagens da página que só a 1.2 conhece. true = respondeu. */
  handle(msg: any, send: Send, config: AppConfig): boolean;
}

export function demo12Monitor(catalog: Catalog, metrics: MetricDef[], now: number, empty: boolean, inGame: boolean): Demo12 {
  const rtx50 = urlParam('demo') === 'v07' || urlParam('gpu') === 'rtx50';
  const amd = urlParam('gpu') === 'amd';
  const noAdmin = urlParam('admin') === '0';
  const min = 60_000;

  // ------------------------------------------------------------------ catálogo
  catalog.version = '1.2.0';
  if (catalog.about) catalog.about.app = '1.2.0';
  catalog.hardware = {
    ...catalog.hardware,
    gpu: amd ? catalog.hardware.gpu : rtx50 ? 'NVIDIA GeForce RTX 5070 Ti' : 'NVIDIA GeForce RTX 3080',
    cpu: rtx50 ? 'Intel Core i7-14700K' : 'AMD Ryzen 7 5800X3D',
    ramGb: 32,
    os: 'Windows 11 24H2',
    gpuDriver: amd ? undefined : '581.57',
  };
  if (catalog.tuning?.gpu) catalog.tuning.gpu = catalog.hardware.gpu;
  if (noAdmin) catalog.admin = false;
  catalog.hotkeys = { toggleWidget: 'ok', marker: 'inUse' };
  if (!empty)
    catalog.pcPending ??= {
      id: '20261118-211405',
      kind: 'abruptShutdown',
      time: iso(now - 26 * 3600_000),
      bootTime: iso(now - 26 * 3600_000 + 2 * min),
      exe: 'FC25.exe',
      sessionStart: iso(now - 26 * 3600_000 - 48 * min),
      uptimeSec: 3 * 3600 + 12 * 60,
      events: [{ time: iso(now - 26 * 3600_000 + 2 * min + 8000), kind: 'kernelPower41', source: 'Microsoft-Windows-Kernel-Power 41', eventId: 41 }],
      seen: false,
    };

  const add = (d: Partial<MetricDef> & Pick<MetricDef, 'id' | 'group' | 'name' | 'unit'>) =>
    metrics.push({ isTemperature: d.unit === '°C', available: true, ...d });
  add({ id: 'fps.stutters', group: 'fps', name: 'Engasgos', unit: '', source: 'PresentMon' });
  add({ id: 'fps.animError', group: 'fps', name: 'Erro de animação', unit: 'ms', source: 'PresentMon' });
  add({ id: 'fps.pcLatency', group: 'fps', name: 'Latência do PC', unit: 'ms', source: 'PresentMon', available: false, missing: 'notExposed', missingText: 'O jogo não envia a latência para o PresentMon.' });
  add({ id: 'disk0.temp', group: 'other', name: 'Samsung 980 PRO · temperatura', unit: '°C', source: 'Samsung SSD 980 PRO 1TB', defaultWarn: 60, defaultCrit: 70 });
  add({ id: 'disk0.activity', group: 'other', name: 'Samsung 980 PRO · atividade', unit: '%', source: 'Samsung SSD 980 PRO 1TB' });
  add({ id: 'disk1.temp', group: 'other', name: 'WD 2 TB · temperatura', unit: '°C', available: false, missing: 'notExposed', missingText: 'Este disco não informa a temperatura.' });
  add({ id: 'disk1.activity', group: 'other', name: 'WD 2 TB · atividade', unit: '%', source: 'WDC WD20EZBX' });
  add({ id: 'net.down', group: 'other', name: 'Rede · download', unit: 'MB/s', source: 'Ethernet' });
  add({ id: 'net.up', group: 'other', name: 'Rede · upload', unit: 'MB/s', source: 'Ethernet' });
  const miss = (id: string, missing: MetricDef['missing'], text: string) => {
    const m = metrics.find((x) => x.id === id);
    if (m) Object.assign(m, { available: false, missing, missingText: text });
  };
  if (rtx50) {
    miss('gpu.hotspot', 'notExposed', 'A NVIDIA tirou o hot spot das RTX 50.');
    miss('gpu.hotspotDelta', 'notExposed', 'A NVIDIA tirou o hot spot das RTX 50.');
  } else miss('cpu.power', 'needsPawnIO', 'Precisa do PawnIO para ler.');
  if (noAdmin) for (const m of metrics) if (m.group === 'fps') Object.assign(m, { available: false, missing: 'needsAdmin', missingText: 'Precisa abrir como administrador.' });

  // ------------------------------------------------------------------ extremos desde que o app abriu
  const since = now - (rtx50 ? 72 : 36) * min;
  const boot = since - 2 * min;
  const ext: Record<string, [number, number]> = {
    'gpu.load': [3, 99],
    'gpu.temp': [38, 79],
    'gpu.hotspot': [45, 101.4],
    'gpu.memjunction': [46, 92],
    'gpu.hotspotDelta': [7, 31],
    'gpu.power': [22, 342],
    'gpu.clock': [210, 1965],
    'gpu.vramUsed': [0.9, 8.9],
    'gpu.fan': [0, 78],
    'cpu.load': [2, 88],
    'cpu.temp': [41, 84],
    'cpu.clockAvg': [3400, 4550],
    'ram.load': [31, 64],
    'ram.used': [9.9, 20.4],
    'fps.current': [0, 165],
    'fps.low1': [0, 121],
    'fps.low01': [0, 102],
    'fps.frametime': [6.1, 22.4],
    'fps.animError': [0.4, 5.8],
    'disk0.temp': [38, 52],
    'disk0.activity': [0, 96],
    'disk1.activity': [0, 41],
    'net.down': [0, 37.9],
    'net.up': [0, 1.7],
  };
  const dirty = new Set<string>();
  let stutters = 4;
  let markers = 0;
  let fpsReason: string | null = null;

  const integration: PairedDevice = { id: 'c3a9e1f07b2d4456', name: 'Home Assistant', kind: 'integration', created: iso(now - 2 * 3600_000), lastSeen: iso(now - 4000) };

  return {
    config(c) {
      c.hotkeys = { enabled: true, toggleWidget: 'Ctrl+Alt+P', marker: 'Ctrl+Alt+M' };
      c.features = { ...c.features!, stutters: true };
      if (c.remote) {
        c.remote.apiEnabled = !empty;
        if (!empty) c.remote.pairedDevices = [...c.remote.pairedDevices, integration];
      }
      const known = new Set(c.metrics.map((m) => m.id));
      let order = c.metrics.length;
      for (const m of metrics) {
        if (known.has(m.id)) continue;
        const s: MetricSetting = { id: m.id, enabled: false, order: order++, unit: m.isTemperature ? 'C' : undefined, warn: m.defaultWarn, crit: m.defaultCrit, sparkline: false };
        c.metrics.push(s);
      }
    },

    start(send) {
      send({ type: 'extremesApp', since: iso(since), bootTime: iso(boot), values: { ...ext } });
    },

    values(v, g, k) {
      const wave = Math.sin(k / 7);
      if (g && Math.random() < 0.04) stutters++;
      v['fps.stutters'] = g ? stutters : null;
      v['fps.animError'] = g && v['fps.current'] != null ? Math.round(rnd(0.6, 1.8) * 100) / 100 : null;
      v['fps.pcLatency'] = null;
      v['disk0.temp'] = Math.round((48 + wave) * 10) / 10;
      v['disk0.activity'] = Math.round(Math.max(0, 10 + wave * 8 + rnd(-4, 6)));
      v['disk1.activity'] = Math.round(Math.max(0, rnd(-2, 4)));
      v['net.down'] = Math.round(Math.max(0, 5 + wave * 3 + rnd(-1, 1)) * 100) / 100;
      v['net.up'] = Math.round(rnd(0.2, 0.5) * 100) / 100;
      v['gpu.vramUsed'] = rtx50 ? 11.2 : 8.4;
      if (rtx50) {
        v['gpu.hotspot'] = null;
        v['gpu.hotspotDelta'] = null;
        v['cpu.temp'] = Math.round((88 + rnd(-1.5, 1.5)) * 10) / 10;
      } else v['cpu.power'] = null;
      // Sem FPS: anti-cheat (variante RTX 50) ou sem administrador; o motivo vai em texts['fps.reason']
      fpsReason = !g ? 'noGame' : noAdmin ? 'notAdmin' : rtx50 ? 'antiCheat' : null;
      if (fpsReason) for (const id of ['fps.current', 'fps.low1', 'fps.low01', 'fps.frametime', 'fps.avg', 'fps.displayed', 'fps.animError', 'fps.stutters']) v[id] = null;
      if (noAdmin && !g) fpsReason = 'notAdmin';
      for (const [id, val] of Object.entries(v)) {
        if (val == null) continue;
        const e = ext[id];
        if (!e || val < e[0] || val > e[1]) {
          ext[id] = e ? [Math.min(e[0], val), Math.max(e[1], val)] : [val, val];
          dirty.add(id);
        }
      }
      void inGame;
    },

    snapshot(msg) {
      if (fpsReason) msg.texts = { ...(msg.texts ?? {}), 'fps.reason': fpsReason };
      const k = Math.floor(Date.now() / 1000);
      if (dirty.size && k % 5 === 0) {
        const d: Record<string, [number, number]> = {};
        for (const id of dirty) d[id] = [Math.round(ext[id][0] * 100) / 100, Math.round(ext[id][1] * 100) / 100];
        dirty.clear();
        msg.extremesApp = d;
      }
      return msg;
    },

    handle(msg, send, config) {
      switch (msg.type) {
        case 'getSensorDump':
          setTimeout(() => send({ type: 'sensorDump', text: dumpText(catalog, metrics) }), 120);
          return true;
        case 'addMarker': {
          markers++;
          const game = inGame ? (urlParam('game') ?? 'FC25.exe') : undefined;
          send({ type: 'marker', index: markers, at: iso(Date.now()), ...(game ? { exe: game } : {}) });
          return true;
        }
        case 'createApiToken': {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
          const device: PairedDevice = { id: [...bytes.slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(''), name: String(msg.name || 'Home Assistant').slice(0, 40), created: iso(Date.now()), kind: 'integration', online: false };
          config.remote!.pairedDevices = [...config.remote!.pairedDevices, device];
          send({ type: 'config', config: structuredClone(config) });
          send({ type: 'devices', devices: config.remote!.pairedDevices });
          send({ type: 'apiToken', token, device });
          return true;
        }
        case 'dismissPcIncident':
          catalog.pcPending = undefined;
          send({ ...catalog });
          return true;
      }
      return false;
    },
  };
}

/** Lista de sensores no formato do backend (docs/protocol.md › 10.3), curta. */
function dumpText(cat: Catalog, metrics: MetricDef[]): string {
  const hw = cat.hardware;
  const lines = [
    '# Pitwall · lista de sensores · sensor list',
    `app: ${cat.version}`,
    `windows: ${hw.os ?? '?'}`,
    `gpuDriver: ${hw.gpuDriver ?? '-'}`,
    `gpu: ${hw.gpu ?? '-'}`,
    `gpuVendor: ${hw.gpu?.startsWith('AMD') ? 'AMD' : 'NVIDIA'}`,
    `pawnIO: ${metrics.find((m) => m.id === 'cpu.power')?.missing === 'needsPawnIO' ? 'no' : '2.0.1'}`,
    `admin: ${cat.admin ? 'yes' : 'no'}`,
    `presentMon: ${cat.about?.presentMon ?? '-'}`,
    `generated: ${new Date().toISOString()}`,
    '',
    '== Hardware ==',
    `[GpuNvidia] ${hw.gpu} | /gpu-nvidia/0`,
    '  Temperature | GPU Core | 71.2 | 38.0 | 79.0 | /gpu-nvidia/0/temperature/0',
    '  Power | GPU Package | 298.4 | 22.1 | 342.0 | /gpu-nvidia/0/power/0',
    `[Cpu] ${hw.cpu} | /amdcpu/0`,
    '  Load | CPU Total | 41.0 | 2.0 | 88.0 | /amdcpu/0/load/0',
    '',
    '== Mapeamento · Mapping ==',
    ...metrics.filter((m) => m.available && m.source).slice(0, 8).map((m) => `${m.id} <- ${m.source}`),
    '',
    '== Sem leitura · Missing ==',
    ...metrics.filter((m) => !m.available).map((m) => `${m.id} | ${m.missing ?? 'notExposed'} | ${m.missingText ?? ''}`),
  ];
  return lines.join('\n') + '\n';
}
