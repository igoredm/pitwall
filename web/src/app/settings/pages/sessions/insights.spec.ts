import { describe, expect, test } from 'vitest';
import { DICTS } from '../../../i18n';
import type { Catalog, GameSession } from '../../../models';
import { sessionInsights } from './insights';

const pt = DICTS['pt-BR'];
const en = DICTS.en;
const session = (x: Partial<GameSession> = {}): GameSession => ({ exe: 'FC25.exe', start: '2026-11-19T21:00:00', durationSec: 1800, ...x });
const ids = (x: Partial<GameSession>) => sessionInsights(session(x), pt).map((i) => i.id);

describe('sessionInsights', () => {
  test('espaço em disco não entra; outra métrica usa o nome do catálogo', () => {
    expect(ids({ secondsAboveCrit: { 'disk1.used': 16964 } })).toEqual([]);
    const cat = { metrics: [{ id: 'disk2.temp', name: 'Fanxiang · temperatura' }] } as unknown as Catalog;
    const r = sessionInsights(session({ secondsAboveCrit: { 'disk1.used': 900, 'disk2.temp': 60 } }), pt, cat);
    expect(r.map((i) => i.id)).toEqual(['crit:disk2.temp']);
    expect(r[0].text).toContain('Fanxiang · temperatura');
  });

  test('sessão sem dados: nada', () => {
    expect(sessionInsights(session(), pt)).toEqual([]);
  });

  test('GPU no limite (≥ 95) e com folga (< 80, sessão ≥ 2 min)', () => {
    expect(sessionInsights(session({ avgGpuLoad: 97.4 }), pt)).toEqual([{ id: 'gpuBound', tone: 'info', text: 'GPU no limite: uso médio de 97%.' }]);
    expect(ids({ avgGpuLoad: 95 })).toEqual(['gpuBound']);
    expect(ids({ avgGpuLoad: 94.9 })).toEqual([]);
    expect(sessionInsights(session({ avgGpuLoad: 64 }), pt)[0].text).toBe('GPU com folga: uso médio de 64%. O limite veio de outro lugar (CPU, jogo ou limite de FPS).');
    expect(ids({ avgGpuLoad: 80 })).toEqual([]);
    expect(ids({ avgGpuLoad: 64, durationSec: 119 })).toEqual([]);
    expect(ids({ avgGpuLoad: 64, durationSec: 120 })).toEqual(['gpuSpare']);
  });

  test('clock por energia (≥ 25%, link gpu) e temperatura (≥ 10%)', () => {
    const r = sessionInsights(session({ clockReasonSec: { power: 62, thermal: 18, none: 20 } }), pt);
    expect(r).toEqual([
      { id: 'power', tone: 'warn', text: 'Clock limitado por energia em 62% do tempo.', link: 'gpu' },
      { id: 'thermal', tone: 'warn', text: 'Clock limitado por temperatura em 18% do tempo.' },
    ]);
    expect(ids({ clockReasonSec: { power: 24, none: 76 } })).toEqual([]);
    expect(ids({ clockReasonSec: { power: 25, none: 75 } })).toEqual(['power']);
    expect(ids({ clockReasonSec: { thermal: 9, none: 91 } })).toEqual([]);
    expect(ids({ clockReasonSec: { thermal: 10, none: 90 } })).toEqual(['thermal']);
    expect(ids({ clockReasonSec: {} })).toEqual([]);
  });

  test('acima do limite crítico: ≥ 30 s, as 2 que mais ficaram', () => {
    const r = sessionInsights(session({ secondsAboveCrit: { 'gpu.hotspot': 240, 'gpu.temp': 29, 'cpu.temp': 31, 'gpu.memjunction': 600 } }), pt);
    expect(r.map((i) => i.text)).toEqual(['Memória da GPU acima do limite crítico definido por 10 min.', 'Hot spot acima do limite crítico definido por 4 min.']);
    expect(r.every((i) => i.tone === 'crit')).toBe(true);
    expect(ids({ secondsAboveCrit: { 'gpu.hotspot': 29 } })).toEqual([]);
    expect(sessionInsights(session({ secondsAboveCrit: { 'gpu.hotspot': 48 } }), en)[0].text).toBe('Hot spot above the set critical limit for 48 s.');
  });

  test('engasgos ≥ 2 por minuto', () => {
    expect(sessionInsights(session({ stutters: 38, durationSec: 18 * 60 }), pt)[0].text).toBe('38 engasgos (2,1 por minuto).');
    expect(sessionInsights(session({ stutters: 38, durationSec: 18 * 60 }), en)[0].text).toBe('38 stutters (2.1 per minute).');
    expect(ids({ stutters: 39, durationSec: 20 * 60 })).toEqual([]);
    expect(ids({ stutters: 40, durationSec: 20 * 60 })).toEqual(['stutters']);
    expect(ids({ durationSec: 60 })).toEqual([]);
  });

  test('jogo fechou com erro / parou de responder', () => {
    expect(sessionInsights(session({ gameExit: 'crash' }), pt)).toEqual([{ id: 'gameExit', tone: 'crit', text: 'O jogo fechou com erro (Application Error).' }]);
    expect(sessionInsights(session({ gameExit: 'hang' }), pt)[0].text).toBe('O jogo parou de responder.');
  });

  test('ordem crit > warn > info', () => {
    const r = sessionInsights(
      session({ avgGpuLoad: 98, stutters: 100, durationSec: 600, clockReasonSec: { power: 50, none: 50 }, secondsAboveCrit: { 'gpu.hotspot': 90 }, gameExit: 'hang' }),
      pt,
    );
    expect(r.map((i) => i.tone)).toEqual(['crit', 'crit', 'warn', 'warn', 'info']);
    expect(r.map((i) => i.id)).toEqual(['gameExit', 'crit:gpu.hotspot', 'power', 'stutters', 'gpuBound']);
  });
});
