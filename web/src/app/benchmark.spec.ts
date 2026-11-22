import { describe, expect, test } from 'vitest';
import { benchAsSession, benchDuration, benchRemaining, fmtCountdown } from './benchmark';

describe('benchmark', () => {
  test('fmtCountdown: m:ss', () => {
    expect(fmtCountdown(42)).toBe('0:42');
    expect(fmtCountdown(60)).toBe('1:00');
    expect(fmtCountdown(245)).toBe('4:05');
    expect(fmtCountdown(300)).toBe('5:00');
    expect(fmtCountdown(0)).toBe('0:00');
    expect(fmtCountdown(-3)).toBe('0:00');
    expect(fmtCountdown(NaN)).toBe('0:00');
    expect(fmtCountdown(9.6)).toBe('0:10');
  });

  test('benchRemaining conta pelo startedAt (para baixo, arredonda para cima)', () => {
    const t0 = new Date('2026-11-22T20:00:00Z').getTime();
    const st = { state: 'running' as const, startedAt: new Date(t0).toISOString(), durationSec: 60 };
    expect(benchRemaining(st, t0)).toBe(60);
    expect(benchRemaining(st, t0 + 200)).toBe(60);
    expect(benchRemaining(st, t0 + 18_000)).toBe(42);
    expect(benchRemaining(st, t0 + 18_500)).toBe(42);
    expect(benchRemaining(st, t0 + 59_999)).toBe(1);
    expect(benchRemaining(st, t0 + 61_000)).toBe(0);
    // relógio um pouco antes do início: não passa da duração
    expect(benchRemaining(st, t0 - 2000)).toBe(60);
  });

  test('benchRemaining: só rodando', () => {
    expect(benchRemaining(null, 0)).toBeNull();
    expect(benchRemaining({ state: 'done' }, 0)).toBeNull();
    expect(benchRemaining({ state: 'running' }, 0)).toBeNull();
    expect(benchRemaining({ state: 'running', startedAt: 'x', durationSec: 30 }, 0)).toBeNull();
  });

  test('benchDuration: fora da lista vale 60', () => {
    expect(benchDuration(30)).toBe(30);
    expect(benchDuration(300)).toBe(300);
    expect(benchDuration(45)).toBe(60);
    expect(benchDuration(undefined)).toBe(60);
  });

  test('benchAsSession reaproveita os números', () => {
    const x = benchAsSession({ id: 'b1', exe: 'FC25.exe', start: '2026-11-22T20:00:00Z', durationSec: 60, avgFps: 143, low1: 98, stutters: 1 });
    expect(x).toMatchObject({ exe: 'FC25.exe', durationSec: 60, avgFps: 143, low1: 98, stutters: 1 });
  });
});
