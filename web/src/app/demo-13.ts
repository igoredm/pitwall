/**
 * 1.3: dados de exemplo para ?demo=1 (docs/v13-contract.md › Demo). Sessões com gpuDriver (troca de driver 9 dias atrás,
 * com queda de FPS no FC25), energyWh, gameExit em duas; eventos sleep/resume/boot/shutdown dos últimos 7 dias e
 * appCrash/appHang; benchmarks salvos; getTrend; e startBenchmark roda de verdade com o relógio. ?bench=running começa
 * com um benchmark de 5 min já rodando (selo no widget). ?exit=crash|hang marca a última partida.
 */
import { AppConfig, Benchmark, BenchmarkState, Catalog, GameSession, PcEvent, Trend, TrendPoint } from './models';
import type { ReportsDemo } from './demo-reports';
import { urlParam } from './telemetry.service';

const iso = (ms: number) => new Date(ms).toISOString();
const min = 60_000;
const hour = 3_600_000;
const day = 86_400_000;
const OLD = '581.57';
const NEW = '591.44';

export interface Demo13 {
  handle(msg: any, send: (m: any) => void): boolean;
  /** Começa o feed (bench=running). */
  start(send: (m: any) => void): void;
}

export function startDemo13(opts: {
  now: number;
  empty: boolean;
  idle: boolean;
  en: boolean;
  catalog: Catalog;
  config: AppConfig;
  sessions: GameSession[];
  history: GameSession[];
  reports: ReportsDemo;
  /** Jogo aberto agora (snapshots). */
  game: string;
}): Demo13 {
  const { now, empty, idle, catalog, history } = opts;

  // ------------------------------------------------------------------ config v9 e catálogo
  const c = opts.config;
  c.hotkeys = { enabled: true, toggleWidget: 'Ctrl+Alt+P', marker: 'Ctrl+Alt+M', ...c.hotkeys, benchmark: 'Ctrl+Alt+B' };
  c.benchmark = { durationSec: 60 };
  c.energy = opts.en ? { tariff: 0.17, currency: '$' } : { tariff: 0.89, currency: 'R$' };
  catalog.hotkeys = { toggleWidget: 'ok', marker: 'inUse', ...catalog.hotkeys, benchmark: 'ok' };
  catalog.hardware.gpuDriver = NEW;

  // ------------------------------------------------------------------ sessões: driver, energia, jogo que fechou com erro
  const switchAt = now - 9 * day;
  for (const x of history) {
    const at = new Date(x.start).getTime();
    x.gpuDriver = at < switchAt ? OLD : NEW;
    // Depois da troca, o FC25 caiu ~9% (a frase "Desde o driver 591.44: FPS médio … → …")
    if (x.gpuDriver === NEW && x.exe === 'FC25.exe' && x.end && x.avgFps != null && x !== opts.sessions.find((s) => s.end && s.exe === 'FC25.exe')) {
      x.avgFps = Math.round(x.avgFps * 0.91 * 10) / 10;
      if (x.low1 != null) x.low1 = Math.round(x.low1 * 0.9);
    }
    const dur = x.durationSec ?? 0;
    if (dur > 0 && x.avgGpuPower != null) x.energyWh = Math.round(((x.avgGpuPower + 62 + ((at / 1000) % 17)) * dur) / 3600 * 10) / 10;
  }
  const exit = urlParam('exit');
  const last = opts.sessions.find((s) => s.end && s.exe === 'FC25.exe');
  if (last && (exit === 'crash' || exit === 'hang')) last.gameExit = exit;
  // Uma do Cyberpunk fechou com erro e uma do Valorant parou de responder (dentro dos 30 dias)
  const cyber = history.find((x) => x.exe === 'Cyberpunk2077.exe' && x.end && now - new Date(x.start).getTime() > 2 * day);
  const valo = history.find((x) => x.exe === 'Valorant.exe' && x.end && now - new Date(x.start).getTime() > 5 * day);
  if (cyber) cyber.gameExit = 'crash';
  if (valo) valo.gameExit = 'hang';
  // A última partida (45 min): ≈ 0,27 kWh
  if (last) last.energyWh = 271.4;

  // ------------------------------------------------------------------ eventos do Windows (1.3)
  const ev = (time: number, kind: PcEvent['kind'], source: string, eventId: number, extra: Partial<PcEvent> = {}): PcEvent => ({
    time: iso(time),
    kind,
    source,
    eventId,
    category: kind === 'sleep' || kind === 'resume' || kind === 'boot' || kind === 'shutdown' ? 'state' : 'problem',
    ...extra,
  });
  const events: PcEvent[] = [];
  if (!empty) {
    for (let d = 1; d <= 6; d++) {
      const base = new Date(now - d * day);
      const bed = new Date(base).setHours(1, 20 + d * 3, 10, 0);
      const wake = new Date(base).setHours(9, 4 + d, 32, 0);
      if (d === 3) continue; // a noite da queda (já vem no incidente)
      if (d % 2) {
        events.push(ev(bed, 'sleep', 'Microsoft-Windows-Kernel-Power 42', 42));
        events.push(ev(wake, 'resume', 'Microsoft-Windows-Power-Troubleshooter 1', 1));
      } else {
        events.push(ev(bed - 20_000, 'shutdown', 'User32 1074', 1074, { message: opts.en ? 'explorer.exe · power off' : 'explorer.exe · desligar' }));
        events.push(ev(bed, 'shutdown', 'Microsoft-Windows-Kernel-General 13', 13));
        events.push(ev(wake, 'boot', 'Microsoft-Windows-Kernel-General 12', 12));
      }
    }
    const endOf = (x: GameSession) => new Date(x.start).getTime() + (x.durationSec ?? 0) * 1000;
    if (cyber) events.push(ev(endOf(cyber) + 20_000, 'appCrash', 'Application Error 1000', 1000, { exe: cyber.exe, code: 'nvwgf2umx.dll' }));
    if (valo) events.push(ev(endOf(valo) + 45_000, 'appHang', 'Application Hang 1002', 1002, { exe: valo.exe }));
    if (last?.gameExit) events.push(ev(endOf(last) + 15_000, last.gameExit === 'crash' ? 'appCrash' : 'appHang', last.gameExit === 'crash' ? 'Application Error 1000' : 'Application Hang 1002', last.gameExit === 'crash' ? 1000 : 1002, { exe: last.exe, code: last.gameExit === 'crash' ? 'ucrtbase.dll' : undefined }));
  }
  opts.reports.addEvents(events);

  // ------------------------------------------------------------------ tendência
  const valid = (x: GameSession) => !!x.end && (x.durationSec ?? 0) >= 120 && x.avgFps != null;
  const trend = (exe?: string): Trend => {
    const by = new Map<string, { exe: string; count: number; last: string }>();
    for (const x of history.filter(valid)) {
      const k = x.exe.toLowerCase();
      const g = by.get(k) ?? { exe: x.exe, count: 0, last: x.start };
      g.count++;
      if (x.start > g.last) g.last = x.start;
      by.set(k, g);
    }
    const games = [...by.values()].filter((g) => g.count >= 2).sort((a, b) => b.count - a.count);
    const pick = exe ? (games.find((g) => g.exe.toLowerCase() === exe.toLowerCase())?.exe ?? exe) : (games[0]?.exe ?? null);
    const points: TrendPoint[] = pick
      ? history
          .filter((x) => valid(x) && x.exe.toLowerCase() === pick.toLowerCase())
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((x) => ({
            start: x.start,
            durationSec: x.durationSec!,
            avgFps: x.avgFps,
            low1: x.low1,
            avgGpuTemp: x.avgGpuTemp,
            avgHotspot: x.avgHotspot,
            peakHotspot: x.peakHotspot,
            avgGpuPower: x.avgGpuPower,
            stutters: x.stutters,
            gpuDriver: x.gpuDriver,
            energyWh: x.energyWh,
          }))
      : [];
    return { exe: pick, games, points };
  };

  // ------------------------------------------------------------------ benchmarks
  const gpu = catalog.hardware.gpu;
  const cpu = catalog.hardware.cpu;
  const mk = (id: string, exe: string, at: number, dur: number, fps: number, extra: Partial<Benchmark> = {}): Benchmark => ({
    id,
    exe,
    start: iso(at),
    durationSec: dur,
    avgFps: fps,
    low1: Math.round(fps * 0.79),
    low01: Math.round(fps * 0.64),
    stutters: Math.round(dur / 60),
    avgGpuLoad: 97.2,
    avgCpuLoad: 38.4,
    avgGpuTemp: 72.1,
    avgHotspot: 93.6,
    avgGpuPower: 301.2,
    avgGpuClock: 1872,
    avgCpuTemp: 66.3,
    energyWh: Math.round(((301 + 64) * dur) / 3600 * 10) / 10,
    clockReasonSec: { power: Math.round(dur * 0.4), voltage: Math.round(dur * 0.5), none: Math.round(dur * 0.1) },
    gpu,
    cpu,
    gpuDriver: at < switchAt ? OLD : NEW,
    ...extra,
  });
  let items: Benchmark[] = empty
    ? []
    : [
        mk('b6', 'FC25.exe', now - 2 * hour - 14 * min, 60, 131.6, { note: opts.en ? 'Kick-off replay, DLSS Quality' : 'Replay do pontapé, DLSS Qualidade' }),
        mk('b5', 'Cyberpunk2077.exe', now - 2 * day - 3 * hour, 120, 71.8, { note: opts.en ? 'Market, RT Ultra' : 'Mercado, RT Ultra', avgGpuLoad: 99.1 }),
        mk('b4', 'FC25.exe', now - 4 * day - 5 * hour, 60, 129.9, { note: opts.en ? 'Kick-off replay, DLSS Quality' : 'Replay do pontapé, DLSS Qualidade' }),
        mk('b3', 'Cyberpunk2077.exe', now - 8 * day - 2 * hour, 47, 74.2, { partial: true }),
        mk('b2', 'FC25.exe', now - 12 * day - 4 * hour, 60, 143.4, { note: opts.en ? 'Kick-off replay, DLSS Quality' : 'Replay do pontapé, DLSS Qualidade' }),
        mk('b1', 'FC25.exe', now - 13 * day - 1 * hour, 300, 138.1, { note: opts.en ? 'Native, full match' : 'Nativo, partida inteira', avgGpuLoad: 99.4, clockReasonSec: { power: 190, voltage: 90, none: 20 } }),
      ];
  const list = () => ({ type: 'benchmarks', items: items.map((b) => ({ ...b })) });

  let state: BenchmarkState = { state: 'idle' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let push: (m: any) => void = () => {};
  const setState = (st: BenchmarkState) => {
    state = st;
    catalog.benchmark = st;
    push({ type: 'benchmarkState', ...st });
  };
  const run = (dur: number, startedAt: number) => {
    const exe = opts.game;
    setState({ state: 'running', exe, startedAt: iso(startedAt), durationSec: dur });
    clearTimeout(timer);
    timer = setTimeout(() => {
      const fps = 139 + Math.round(Math.random() * 60) / 10;
      const result = mk(`b${Date.now()}`, exe, startedAt, dur, fps, { gpuDriver: NEW, sessionStart: opts.sessions.find((s) => !s.end)?.start });
      items = [result, ...items].slice(0, 200);
      setState({ state: 'done', exe, durationSec: dur, result });
      push(list());
    }, Math.max(0, startedAt + dur * 1000 - Date.now()));
  };
  catalog.benchmark = state;

  return {
    start(send) {
      push = send;
      if (!idle && urlParam('bench') === 'running') run(300, Date.now() - 18_000);
    },
    handle(msg, send) {
      push = send;
      switch (msg.type) {
        case 'getTrend':
          setTimeout(() => send({ type: 'trend', ...trend(msg.exe) }), 140);
          return true;
        case 'getBenchmarks':
          setTimeout(() => send(list()), 120);
          return true;
        case 'renameBenchmark':
          items = items.map((b) => (b.id === msg.id ? { ...b, note: String(msg.note ?? '').slice(0, 80) || undefined } : b));
          send(list());
          return true;
        case 'deleteBenchmark':
          items = items.filter((b) => b.id !== msg.id);
          send(list());
          return true;
        case 'startBenchmark': {
          if (state.state === 'running') return true;
          if (idle) {
            setState({ state: 'error', error: 'noGame' });
            return true;
          }
          const d = [30, 60, 120, 300].includes(msg.durationSec) ? msg.durationSec : 60;
          run(d, Date.now());
          return true;
        }
        case 'cancelBenchmark':
          if (state.state !== 'running') return true;
          clearTimeout(timer);
          setState({ state: 'cancelled', exe: state.exe, durationSec: state.durationSec });
          return true;
      }
      return false;
    },
  };
}
