import { describe, expect, test } from 'vitest';
import { DICTS } from '../../../i18n';
import type { Catalog, GameSession } from '../../../models';
import { compareRows, crashed, durationSec, endTime, gameName, perMinute, redCaption, sameStart, secondsRed } from './session-util';

const pt = DICTS['pt-BR'];
const session = (x: Partial<GameSession> = {}): GameSession => ({ exe: 'FC25.exe', start: '2026-11-19T21:00:00', ...x });

describe('helpers', () => {
  test('durationSec / endTime', () => {
    expect(durationSec(session({ durationSec: 600 }))).toBe(600);
    expect(durationSec(session({ end: '2026-11-19T21:10:00' }))).toBe(600);
    expect(durationSec(session())).toBe(0);
    expect(endTime(session({ durationSec: 60 }))).toBe(new Date('2026-11-19T21:01:00').getTime());
    expect(endTime(session())).toBeNull();
  });

  test('perMinute', () => {
    expect(perMinute(session({ stutters: 12, durationSec: 1200 }))).toBe(0.6);
    expect(perMinute(session({ durationSec: 1200 }))).toBeNull(); // não contado
    expect(perMinute(session({ stutters: 3 }))).toBeNull(); // sem duração
  });

  test('redCaption: a métrica que mais ficou acima do limite crítico, com o limite e +N', () => {
    const lim = new Map([['gpu.hotspot', { id: 'gpu.hotspot', enabled: true, order: 0, sparkline: false, crit: 100 }]]);
    const cat = { metrics: [{ id: 'gpu.temp', group: 'gpu', name: 'Núcleo', unit: '°C', isTemperature: true, available: true, defaultCrit: 87.5 }] } as unknown as Catalog;
    expect(redCaption(session({ secondsAboveCrit: { 'gpu.temp': 12, 'gpu.hotspot': 40 } }), pt, lim, cat)).toBe('hot spot ≥ 100 °C +1');
    expect(redCaption(session({ secondsAboveCrit: { 'gpu.temp': 12 } }), pt, new Map(), cat)).toBe('GPU núcleo ≥ 87,5 °C');
    expect(redCaption(session({ secondsAboveCrit: { 'gpu.hotspot': 0 } }), pt, lim, null)).toBeNull();
    expect(redCaption(session({ secondsAboveCrit: { 'x.y': 3 } }), pt, new Map(), null)).toBe('x.y');
  });

  test('secondsRed: maior tempo no vermelho', () => {
    expect(secondsRed(session({ secondsAboveCrit: { 'gpu.temp': 12, 'gpu.hotspot': 40 } }))).toBe(40);
    expect(secondsRed(session({ secondsAboveWarn: { 'gpu.temp': 5 } }))).toBe(0);
    expect(secondsRed(session())).toBeNull();
  });

  test('crashed, gameName, sameStart', () => {
    expect(crashed(session({ endedByCrash: true, end: '2026-11-19T21:10:00' }), false)).toBe(true);
    expect(crashed(session(), false)).toBe(true); // antiga, sem fim e não está aberta
    expect(crashed(session(), true)).toBe(false);
    expect(gameName(session({ exe: 'Cyberpunk2077.EXE' }))).toBe('Cyberpunk2077');
    expect(sameStart('2026-11-19T21:00:00.400', '2026-11-19T21:00:01.000')).toBe(true);
    expect(sameStart('2026-11-19T21:00:00', '2026-11-19T21:00:02')).toBe(false);
  });
});

describe('compareRows (cor da diferença: g = A melhor, r = A pior, n = < 2% ou sem lado melhor)', () => {
  const row = (a: Partial<GameSession>, b: Partial<GameSession>, key: string) =>
    compareRows(session({ durationSec: 1200, ...a }), session({ durationSec: 1200, ...b }), pt).find((r) => r.key === key);

  test('maior é melhor (FPS)', () => {
    expect(row({ avgFps: 150 }, { avgFps: 120 }, 'avgFps')).toMatchObject({ a: '150', b: '120', delta: '+30', tone: 'g' });
    expect(row({ avgFps: 120 }, { avgFps: 150 }, 'avgFps')).toMatchObject({ delta: '−30', tone: 'r' });
  });

  test('menor é melhor (hot spot, engasgos)', () => {
    expect(row({ peakHotspot: 90 }, { peakHotspot: 101 }, 'peakHot')).toMatchObject({ delta: '−11 °C', tone: 'g' });
    expect(row({ stutters: 20 }, { stutters: 5 }, 'stutters')).toMatchObject({ delta: '+15', tone: 'r' });
    expect(row({ stutters: 20 }, { stutters: 5 }, 'stuttersPm')).toMatchObject({ a: '1,00', b: '0,25', delta: '+0,75', tone: 'r' });
  });

  test('diferença < 2% = igual, cinza', () => {
    expect(row({ avgFps: 141 }, { avgFps: 140 }, 'avgFps')).toMatchObject({ delta: pt.rp.cmpSame, tone: 'n' });
  });

  test('sem lado melhor (consumo, clock, duração): cinza, com sinal', () => {
    expect(row({ avgGpuPower: 280 }, { avgGpuPower: 240 }, 'avgPower')).toMatchObject({ delta: '+40 W', tone: 'n' });
    expect(row({ avgGpuClock: 1845 }, { avgGpuClock: 1845 }, 'avgClock')).toMatchObject({ delta: pt.rp.cmpSame, tone: 'n' });
    expect(row({}, {}, 'dur')).toMatchObject({ delta: pt.rp.cmpSame, tone: 'n' });
  });

  test('só um lado com valor: travessão; nenhum lado: a linha some', () => {
    expect(row({ avgFps: 140 }, {}, 'avgFps')).toMatchObject({ a: '140', b: '—', delta: '—', tone: 'n' });
    expect(row({}, {}, 'avgFps')).toBeUndefined();
  });

  test('nomes das linhas vêm do idioma', () => {
    expect(row({ avgFps: 1 }, { avgFps: 1 }, 'avgFps')?.name).toBe(pt.rp.cmpRows['avgFps']);
  });
});
