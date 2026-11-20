/**
 * 1.2: dados de exemplo do Relatório do PC e dos Relatórios de jogo para ?demo=1 (carregado junto com demo.ts).
 * 3 incidentes (desligou em jogo com WHEA corrigido, tela azul 0x124 com WHEA fatal, desligou fora de jogo), 30 dias de
 * eventos do Windows, o detalhe de cada incidente (120 s de séries + últimas medições), as sessões com os campos novos
 * (médias, engasgos, marcadores, uma que terminou em queda) e getSessionSeries.
 */
import { AppConfig, Catalog, GameSession, PcEvent, PcIncident, PcIncidentSummary, PcReading, PcReport, SessionSeries } from './models';

const iso = (ms: number) => new Date(ms).toISOString();
const min = 60_000;
const hour = 3_600_000;
const day = 86_400_000;

/** Pseudoaleatório estável (o mesmo desenho a cada pedido). */
function noise(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => ((x = (x * 16807) % 2147483647) / 2147483647) * 2 - 1;
}

/** n pontos de a até b com ruído e quedas opcionais (índices). */
function ramp(n: number, a: number, b: number, amp: number, seed: number, dips: number[] = [], dip = 0): number[] {
  const r = noise(seed);
  return Array.from({ length: n }, (_, i) => {
    const k = n > 1 ? i / (n - 1) : 0;
    let v = a + (b - a) * k + r() * amp;
    if (dips.includes(i)) v -= dip;
    return Math.round(v * 10) / 10;
  });
}

export interface ReportsDemo {
  /** Responde às mensagens novas; true = tratada. */
  handle(msg: any, send: (m: any) => void): boolean;
}

export function startReportsDemo(opts: {
  now: number;
  empty: boolean;
  catalog: Catalog;
  config: () => AppConfig;
  sessions: GameSession[];
  history: GameSession[];
  crashSession?: GameSession;
}): ReportsDemo {
  const { now, empty, catalog } = opts;
  Object.assign(catalog.hardware, { ramGb: 32, os: 'Windows 11 24H2', gpuDriver: '581.57' });

  // ------------------------------------------------------------------ sessões com os campos da 1.2
  const gpu = 'NVIDIA GeForce RTX 3080';
  const cpu = '12th Gen Intel Core i5-12600K';
  for (const [i, x] of opts.history.entries()) {
    if (x.avgFps == null && x.exe !== 'RocketLeague.exe') continue;
    const dur = x.durationSec ?? 0;
    Object.assign(x, {
      gpu,
      cpu,
      avgGpuTemp: x.avgGpuTemp ?? 68 + (i % 5),
      avgHotspot: x.avgHotspot ?? 88 + (i % 8),
      avgGpuPower: 270 + ((i * 7) % 40),
      avgGpuClock: 1860 + ((i * 13) % 60),
      avgGpuLoad: 92 + (i % 6),
      avgCpuTemp: 64 + (i % 7),
      avgCpuLoad: 30 + ((i * 3) % 20),
      peakCpuTemp: 76 + (i % 8),
      peakGpuPower: x.peakGpuPower ?? 310 + (i % 15),
      stutters: x.stutters ?? Math.round((dur / 60) * (0.02 + (i % 4) * 0.03)),
      low01: x.low01 ?? (x.low1 != null ? Math.round(x.low1 * 0.82) : undefined),
    });
  }
  const finished = opts.sessions.find((x) => x.end && x.exe === 'FC25.exe');
  if (finished) {
    const st = new Date(finished.start).getTime();
    Object.assign(finished, {
      avgGpuTemp: 71.3,
      avgHotspot: 95.8,
      avgGpuPower: 298.4,
      avgGpuClock: 1890,
      avgGpuLoad: 96.1,
      avgCpuTemp: 68.2,
      avgCpuLoad: 41.5,
      peakCpuTemp: 81,
      stutters: 6,
      animErrorMs: 1.21,
      gpu,
      cpu,
      markers: [
        { t: 15 * 60 + 12, at: iso(st + 15 * min + 12_000), via: 'hotkey' },
        { t: 31 * 60 + 40, at: iso(st + 31 * min + 40_000), note: 'travou no replay', via: 'button' },
        { t: 41 * 60 + 2, at: iso(st + 41 * min + 2_000), via: 'hotkey' },
      ],
    });
  }

  // ------------------------------------------------------------------ incidentes e eventos
  const ev = (time: number, kind: PcEvent['kind'], source: string, eventId: number, extra: Partial<PcEvent> = {}): PcEvent => ({ time: iso(time), kind, source, eventId, ...extra });
  const crash = opts.crashSession;
  const t1 = crash ? new Date(crash.start).getTime() + 41 * min + 8000 : now - day;
  if (crash) Object.assign(crash, { durationSec: 41 * 60 + 8, endedByCrash: true, incidentId: 'inc-1', stutters: 9, low01: 86, gpu, cpu, avgGpuTemp: 74.1, avgHotspot: 98.6, avgGpuPower: 309, avgGpuClock: 1874, avgCpuTemp: 70.2, peakGpuPower: 322, peakCpuTemp: 79, secondsAboveCrit: { 'gpu.hotspot': 96 }, secondsAboveWarn: { 'gpu.hotspot': 1310 } });
  const b1 = t1 + 2 * min;
  const t2 = new Date(now - 7 * day).setHours(23, 2, 4, 0);
  const b2 = t2 + 3 * min;
  const t3 = new Date(now - 16 * day).setHours(2, 18, 30, 0);
  const b3 = t3 + 9 * hour;
  const inc: PcIncidentSummary[] = [
    {
      id: 'inc-1',
      kind: 'abruptShutdown',
      time: iso(t1),
      bootTime: iso(b1),
      exe: crash?.exe ?? 'FC25.exe',
      sessionStart: crash?.start,
      uptimeSec: 3 * 3600 + 12 * 60,
      events: [
        ev(t1 - 14_000, 'whea', 'Microsoft-Windows-WHEA-Logger 17', 17, { code: 'PCI Express Root Port' }),
        ev(b1 + 2000, 'kernelPower41', 'Microsoft-Windows-Kernel-Power 41', 41),
        ev(b1 + 10_000, 'unexpectedShutdown', 'EventLog 6008', 6008),
      ],
      seen: false,
    },
    {
      id: 'inc-2',
      kind: 'bugcheck',
      time: iso(t2),
      bootTime: iso(b2),
      exe: 'Cyberpunk2077.exe',
      sessionStart: iso(t2 - 2 * hour - 18 * min),
      uptimeSec: 5 * 3600 + 40 * 60,
      events: [
        ev(t2 - 6000, 'whea', 'Microsoft-Windows-WHEA-Logger 18', 18, { fatal: true, code: 'Processor Core' }),
        ev(b2 + 20_000, 'kernelPower41', 'Microsoft-Windows-Kernel-Power 41', 41, { code: '0x00000124' }),
        ev(b2 + 50_000, 'bugcheck', 'BugCheck 1001', 1001, { code: '0x00000124' }),
      ],
      seen: true,
    },
    {
      id: 'inc-3',
      kind: 'abruptShutdown',
      time: iso(t3),
      bootTime: iso(b3),
      uptimeSec: 9 * 3600 + 3 * 60,
      events: [ev(b3 + 3000, 'kernelPower41', 'Microsoft-Windows-Kernel-Power 41', 41)],
      seen: true,
    },
  ];
  const incidents = empty ? [] : inc;
  const others: PcEvent[] = empty
    ? [ev(now - 4 * day - 3 * hour, 'gpuReset', 'Display 4101', 4101, { code: 'nvlddmkm' })]
    : [ev(now - 4 * day - 3 * hour, 'gpuReset', 'Display 4101', 4101, { code: 'nvlddmkm' }), ev(now - 10 * day - 5 * hour, 'whea', 'Microsoft-Windows-WHEA-Logger 17', 17, { code: 'PCI Express Root Port' })];
  const events = [...incidents.flatMap((x) => x.events), ...others].sort((a, b) => b.time.localeCompare(a.time));
  // Como no backend: sem pcPending com features.crashReport desligado
  const pending = () => (opts.config().features?.crashReport !== false ? incidents.find((x) => !x.seen) : undefined);
  catalog.pcPending = pending();

  const bootTime = now - 2 * hour - 58 * min;
  const report = (): PcReport => ({
    type: 'pcReport',
    bootTime: iso(bootTime),
    uptimeSec: (Date.now() - bootTime) / 1000,
    lastCleanExit: iso(now - 2 * day),
    incidents: incidents.map((x) => ({ ...x })),
    events,
    ringActive: opts.config().features?.crashReport !== false,
  });

  const detail = (x: PcIncidentSummary): PcIncident => {
    const n = 120;
    const game = !!x.exe;
    const seed = x.id.charCodeAt(4);
    const series: PcIncident['series'] = game
      ? {
          'gpu.hotspot': ramp(n, 99, 104, 0.6, seed),
          'gpu.temp': ramp(n, 76, 81, 0.4, seed + 1),
          'gpu.memjunction': ramp(n, 88, 92, 0.5, seed + 2),
          'gpu.power': ramp(n, 306, 320, 4, seed + 3),
          'gpu.clock': ramp(n, 1925, 1898, 9, seed + 4),
          'gpu.load': ramp(n, 97, 99, 0.8, seed + 5),
          'gpu.fan': ramp(n, 74, 78, 0.3, seed + 6),
          'cpu.temp': ramp(n, 69, 72, 0.7, seed + 7),
          'cpu.load': ramp(n, 44, 47, 3, seed + 8),
          'ram.load': ramp(n, 62, 63, 0.2, seed + 9),
          'fps.current': ramp(n, 141, 139, 1.5, seed + 10, [61, 62, 104], 30),
        }
      : {
          'gpu.hotspot': ramp(n, 52, 54, 0.6, seed),
          'gpu.temp': ramp(n, 41, 42, 0.4, seed + 1),
          'gpu.power': ramp(n, 31, 36, 2, seed + 3),
          'gpu.clock': ramp(n, 210, 240, 15, seed + 4),
          'cpu.temp': ramp(n, 44, 46, 0.8, seed + 7),
          'cpu.load': ramp(n, 4, 6, 2, seed + 8),
        };
    const last = (id: string) => {
      const arr = series[id as keyof typeof series];
      return arr ? arr[arr.length - 1] : null;
    };
    const r = (id: string, group: PcReading['group'], name: string, unit: string, value: number | null): PcReading => ({ id, group, name, unit, value });
    const readings: PcReading[] = [
      r('gpu.load', 'gpu', 'Uso', '%', game ? 99 : 6),
      r('gpu.temp', 'gpu', 'Núcleo', '°C', last('gpu.temp')),
      r('gpu.hotspot', 'gpu', 'Hot spot', '°C', last('gpu.hotspot')),
      r('gpu.memjunction', 'gpu', 'Memória (junction)', '°C', game ? 92 : 48),
      r('gpu.hotspotDelta', 'gpu', 'Δ hot spot', '°C', game ? 23 : 11),
      r('gpu.power', 'gpu', 'Consumo', 'W', last('gpu.power')),
      r('gpu.clock', 'gpu', 'Clock', 'MHz', last('gpu.clock')),
      r('gpu.fan', 'gpu', 'Ventoinha', '%', game ? 78 : 0),
      r('gpu.vramUsed', 'gpu', 'VRAM usada', 'GB', game ? 8.9 : 1.2),
      r('cpu.load', 'cpu', 'CPU uso', '%', last('cpu.load')),
      r('cpu.temp', 'cpu', 'CPU temperatura', '°C', last('cpu.temp')),
      r('cpu.clockAvg', 'cpu', 'CPU clock', 'MHz', 4450),
      r('cpu.power', 'cpu', 'CPU consumo', 'W', null),
      r('ram.load', 'ram', 'RAM uso', '%', 63),
      r('ram.used', 'ram', 'RAM usada', 'GB', 20.1),
      ...(game
        ? [r('fps.current', 'fps', 'FPS', 'fps', 139), r('fps.low1', 'fps', '1% low', 'fps', 108), r('fps.frametime', 'fps', 'Frametime', 'ms', 7.2), r('fps.stutters', 'fps', 'Engasgos na partida', '', 6)]
        : []),
      r('disk0.temp', 'other', 'SSD temperatura', '°C', 51),
      r('net.down', 'other', 'Download', 'Mbit/s', game ? 38.2 : 0.4),
    ];
    return { ...x, intervalMs: 1000, series, last: readings, csvFile: game ? (crash?.csvFile ?? 'pitwall_2026-11-12_20-44-00_Cyberpunk2077.csv') : undefined };
  };

  // ------------------------------------------------------------------ séries da partida inteira
  const sessionSeries = (start: string, points: number): SessionSeries => {
    const at = new Date(start).getTime();
    const x = opts.history.find((h) => Math.abs(new Date(h.start).getTime() - at) <= 1000);
    // RocketLeague (domingo) "já foi apagado pela retenção"
    if (!x || x.exe === 'RocketLeague.exe') return { type: 'sessionSeries', start, stepSec: 0, series: {}, available: false };
    const live = !x.end && !x.durationSec;
    const dur = live ? (Date.now() - at) / 1000 : (x.durationSec ?? 0);
    const n = Math.max(2, Math.min(points, Math.round(dur / 5)));
    const seed = Math.round(at / 1000) % 9973;
    const avg = x.avgFps ?? 140;
    const dips = [Math.round(n * 0.12), Math.round(n * 0.33), Math.round(n * 0.6), Math.round(n * 0.62), Math.round(n * 0.88)];
    const stutters = x.stutters ?? 0;
    let acc = 0;
    const st = Array.from({ length: n }, (_, i) => {
      if (stutters && dips.includes(i)) acc = Math.min(stutters, acc + Math.max(1, Math.round(stutters / dips.length)));
      if (i === n - 1) acc = stutters;
      return acc;
    });
    const series: SessionSeries['series'] & { 'fps.stutters'?: number[] } = {
      'fps.current': ramp(n, avg + 2, avg - 2, 3, seed, dips, avg * 0.18),
      'fps.low1': ramp(n, (x.low1 ?? avg * 0.8) + 2, (x.low1 ?? avg * 0.8) - 2, 3, seed + 1),
      'gpu.temp': ramp(n, (x.avgGpuTemp ?? 70) - 6, (x.peakGpuTemp ?? 78) - 1, 0.8, seed + 2),
      'gpu.hotspot': ramp(n, (x.avgHotspot ?? 92) - 8, (x.peakHotspot ?? 100) - 1, 1, seed + 3),
      'gpu.power': ramp(n, (x.avgGpuPower ?? 290) - 15, (x.avgGpuPower ?? 290) + 10, 8, seed + 4),
      'gpu.clock': ramp(n, (x.avgGpuClock ?? 1880) + 30, (x.avgGpuClock ?? 1880) - 20, 12, seed + 5),
      'cpu.temp': ramp(n, (x.avgCpuTemp ?? 66) - 4, (x.peakCpuTemp ?? 78) - 2, 1.5, seed + 6),
      'cpu.load': ramp(n, 38, 44, 5, seed + 7),
      ...(x.stutters != null ? { 'fps.stutters': st } : {}),
    };
    return { type: 'sessionSeries', start: x.start, stepSec: dur / n, series, available: true };
  };

  return {
    handle(msg, send) {
      switch (msg.type) {
        case 'getPcReport':
          setTimeout(() => send(report()), 120);
          return true;
        case 'getPcIncident': {
          const x = incidents.find((i) => i.id === msg.id);
          if (x) setTimeout(() => send({ type: 'pcIncident', ...detail(x) }), 180);
          return true;
        }
        case 'dismissPcIncident': {
          const x = incidents.find((i) => i.id === msg.id);
          if (x) x.seen = true;
          catalog.pcPending = pending();
          send({ ...catalog });
          send(report());
          return true;
        }
        case 'getSessionSeries':
          setTimeout(() => send(sessionSeries(msg.start, msg.points ?? 120)), 200);
          return true;
      }
      return false;
    },
  };
}
