import { describe, expect, test } from 'vitest';
import { DICTS } from '../../../i18n';
import type { TrendPoint } from '../../../models';
import { driverChanges, driverShift, fmtCost, fmtEnergy, hotspotDelta, median, movingMedian, shiftSentence } from './trend-util';

const pt = DICTS['pt-BR'];
const en = DICTS.en;
const p = (avgFps: number | undefined, gpuDriver?: string, x: Partial<TrendPoint> = {}): TrendPoint => ({ start: '2026-11-01T20:00:00', durationSec: 1800, avgFps, gpuDriver, ...x });

describe('mediana', () => {
  test('median / movingMedian', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(movingMedian([10, 20, null, 30, 40, 50, 60], 5)).toEqual([10, 15, null, 20, 25, 35, 45]);
  });

  test('hotspotDelta', () => {
    expect(hotspotDelta(p(100, undefined, { avgHotspot: 95.5, avgGpuTemp: 70 }))).toBe(25.5);
    expect(hotspotDelta(p(100, undefined, { avgHotspot: 95.5 }))).toBeNull();
  });
});

describe('antes × depois do driver', () => {
  test('driverChanges ignora pontos sem driver', () => {
    expect(driverChanges([p(1, 'a'), p(1), p(1, 'a'), p(1, 'b'), p(1), p(1, 'c')])).toEqual([
      { index: 3, from: 'a', to: 'b' },
      { index: 5, from: 'b', to: 'c' },
    ]);
    expect(driverChanges([p(1), p(1, 'a'), p(1, 'a')])).toEqual([]);
  });

  test('≥ 3 de cada lado: mediana antes → depois e a frase', () => {
    const pts = [p(150, '581.57'), p(141, '581.57'), p(139, '581.57'), p(143, '581.57'), p(128, '591.44'), p(126, '591.44'), p(131, '591.44')];
    const d = driverShift(pts)!;
    expect(d).toEqual({ driver: '591.44', before: 142, after: 128, pct: -10, nBefore: 4, nAfter: 3 });
    expect(shiftSentence(d, pt)).toBe('Desde o driver 591.44: FPS médio 142 → 128 (−10%)');
    expect(shiftSentence({ ...d, pct: 4 }, en)).toBe('Since driver 591.44: average FPS 142 → 128 (+4%)');
  });

  test('menos de 3 de um lado: não mostra', () => {
    expect(driverShift([p(140, 'a'), p(141, 'a'), p(128, 'b'), p(126, 'b'), p(131, 'b')])).toBeNull();
    expect(driverShift([p(140, 'a'), p(141, 'a'), p(142, 'a'), p(128, 'b'), p(126, 'b')])).toBeNull();
    expect(driverShift([p(140, 'a'), p(141, 'a'), p(142, 'a')])).toBeNull();
  });

  test('só a última troca conta e o "antes" é o driver anterior', () => {
    // a, a, a, b, b, b, c, c, c: antes = os b, depois = os c
    const pts = [p(100, 'a'), p(100, 'a'), p(100, 'a'), p(140, 'b'), p(142, 'b'), p(138, 'b'), p(150, 'c'), p(154, 'c'), p(152, 'c')];
    expect(driverShift(pts)).toMatchObject({ driver: 'c', before: 140, after: 152, nBefore: 3, nAfter: 3 });
    // última troca com só 2 sessões depois: nada (não volta para a troca anterior)
    expect(driverShift(pts.slice(0, 8))).toBeNull();
  });

  test('sessões sem FPS não contam', () => {
    expect(driverShift([p(140, 'a'), p(undefined, 'a'), p(141, 'a'), p(142, 'a'), p(120, 'b'), p(undefined, 'b'), p(121, 'b')])).toBeNull();
  });
});

describe('energia', () => {
  test('kWh e Wh', () => {
    expect(fmtEnergy(420, pt)).toBe('≈ 0,42 kWh');
    expect(fmtEnergy(6.1, pt)).toBe('≈ 6,1 Wh');
    expect(fmtEnergy(1234, en)).toBe('≈ 1.23 kWh');
  });

  test('custo só com tarifa', () => {
    expect(fmtCost(420, { tariff: null, currency: 'R$' }, pt)).toBeNull();
    expect(fmtCost(420, undefined, pt)).toBeNull();
    expect(fmtCost(420, { tariff: 0.9, currency: 'R$' }, pt)).toBe('≈ R$ 0,38');
    expect(fmtCost(2, { tariff: 0.9, currency: 'R$' }, pt)).toBe('< R$ 0,01');
    expect(fmtCost(1000, { tariff: 0.15, currency: '$' }, en)).toBe('≈ $ 0.15');
    expect(fmtCost(1000, { tariff: 0.15, currency: '' }, en)).toBe('≈ 0.15');
  });
});
