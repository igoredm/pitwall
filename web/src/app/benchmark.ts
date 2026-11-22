import { BENCHMARK_DURATIONS, Benchmark, BenchmarkDuration, BenchmarkState, GameSession } from './models';

/**
 * 1.3 · Benchmark por atalho (docs/v13-contract.md › 4): regras puras usadas pelo widget (selo "BENCH 0:42") e por
 * Relatórios de jogo › Benchmark. O backend só manda benchmarkState nas mudanças; o front conta pelo startedAt.
 */

/** Segundos que faltam (inteiro, arredondado para cima; 0 no fim). null = não está rodando. */
export function benchRemaining(st: BenchmarkState | null | undefined, nowMs: number): number | null {
  if (!st || st.state !== 'running' || !st.startedAt) return null;
  const dur = st.durationSec ?? 60;
  const started = new Date(st.startedAt).getTime();
  if (!Number.isFinite(started)) return null;
  const left = dur - (nowMs - started) / 1000;
  return Math.max(0, Math.min(dur, Math.ceil(left - 1e-6)));
}

/** "m:ss" (0:42, 4:05, 0:00). Valor negativo ou inválido vira 0:00. */
export function fmtCountdown(sec: number): string {
  const s = Number.isFinite(sec) ? Math.max(0, Math.round(sec)) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Config fora da lista (30/60/120/300) vale 60, como no backend. */
export function benchDuration(v: number | undefined | null): BenchmarkDuration {
  return BENCHMARK_DURATIONS.includes(v as BenchmarkDuration) ? (v as BenchmarkDuration) : 60;
}

/**
 * Benchmark como uma "sessão" para reaproveitar a tabela do Comparar, os textos e o card de compartilhar (sem picos:
 * o benchmark só guarda médias).
 */
export function benchAsSession(b: Benchmark): GameSession {
  return {
    exe: b.exe,
    start: b.start,
    durationSec: b.durationSec,
    avgFps: b.avgFps,
    low1: b.low1,
    low01: b.low01,
    stutters: b.stutters,
    avgGpuLoad: b.avgGpuLoad,
    avgCpuLoad: b.avgCpuLoad,
    avgGpuTemp: b.avgGpuTemp,
    avgHotspot: b.avgHotspot,
    avgGpuPower: b.avgGpuPower,
    avgGpuClock: b.avgGpuClock,
    avgCpuTemp: b.avgCpuTemp,
    energyWh: b.energyWh,
    clockReasonSec: b.clockReasonSec,
    gpu: b.gpu,
    cpu: b.cpu,
    gpuDriver: b.gpuDriver,
  };
}
