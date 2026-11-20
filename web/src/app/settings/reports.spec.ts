import { describe, expect, test } from 'vitest';
import { DICTS } from '../i18n';
import { evKey, evSource, extent, fileStamp, fmtReading, fmtUp, minuteTicks, num, seriesPaths, shortCode, yOf, yTicks } from './reports';

const pt = DICTS['pt-BR'];
const en = DICTS.en;

test('num: vírgula em PT', () => {
  expect(num(4.449, 2, pt)).toBe('4,45');
  expect(num(4.449, 2, en)).toBe('4.45');
  expect(num(3, 0, pt)).toBe('3');
});

test.each([
  [45, '45 s'],
  [14 * 60, '14 min'],
  [3 * 3600 + 12 * 60, '3 h 12 min'],
  [52 * 3600, '2 d 4 h'],
])('fmtUp(%i) → %s', (sec, want) => expect(fmtUp(sec)).toBe(want));

test('fmtReading', () => {
  expect(fmtReading(81.4, '°C', pt)).toBe('81 °C');
  expect(fmtReading(4450, 'MHz', pt, 'cpu.clockAvg')).toBe('4,45 GHz');
  expect(fmtReading(1845, 'MHz', pt, 'gpu.clock')).toBe('1845 MHz');
  expect(fmtReading(8.94, 'GB', en)).toBe('8.9 GB');
  expect(fmtReading(1.2346, 'V', en)).toBe('1.235 V');
  expect(fmtReading(141.6, 'fps', en)).toBe('142');
});

test('códigos e fontes dos eventos', () => {
  expect(shortCode('0x00000124')).toBe('0x124');
  expect(shortCode('0x0000009f')).toBe('0x9F');
  expect(shortCode('abc')).toBe('abc');
  expect(shortCode()).toBe('');
  const e = { time: '', kind: 'whea', source: 'Microsoft-Windows-WHEA-Logger', eventId: 18, fatal: true, code: 'PCIe' } as const;
  expect(evKey(e as never)).toBe('wheaFatal');
  expect(evKey({ ...e, fatal: false } as never)).toBe('whea');
  expect(evSource(e as never)).toBe('WHEA-Logger · PCIe');
});

describe('gráficos', () => {
  test('extent ignora buracos', () => {
    expect(extent([null, 3, 1, undefined, 7])).toEqual([1, 7]);
    expect(extent([null, null])).toBeNull();
    expect(extent([])).toBeNull();
  });

  test('seriesPaths: linha com buraco vira dois trechos; área fecha no chão', () => {
    const { line, area } = seriesPaths([0, 10, null, 10], 0, 10, { w: 30, h: 32, yTop: 0, yBottom: 30 });
    expect(line).toBe('M0.00 30.00L10.00 0.00M30.00 0.00');
    expect(area).toBe('M0.00 32L0.00 30.00L10.00 0.00L10.00 32Z'); // trecho de 1 ponto não tem área
  });

  test('yOf: fora da escala = null', () => {
    expect(yOf(5, 0, 10, 0, 100)).toBe(50);
    expect(yOf(11, 0, 10, 0, 100)).toBeNull();
  });

  test('yTicks: 4 marcas redondas cobrindo o intervalo, com folga de 1/3 de passo', () => {
    const r = yTicks(42, 158);
    expect(r.ticks).toEqual([40, 80, 120, 160]);
    expect(r.lo).toBeCloseTo(40 - 40 / 3);
    expect(r.hi).toBeCloseTo(160 + 40 / 3);
    const flat = yTicks(60, 60);
    expect(flat.ticks[0]).toBeLessThanOrEqual(59);
    expect(flat.ticks[3]).toBeGreaterThanOrEqual(61);
  });

  test('minuteTicks: no máximo ~5 marcas, sem encostar no fim', () => {
    expect(minuteTicks(48 * 60)).toEqual([0, 10, 20, 30, 40]);
    expect(minuteTicks(5 * 60)).toEqual([0, 1, 2, 3, 4]);
    expect(minuteTicks(90 * 60)).toEqual([0, 20, 40, 60]);
  });
});

test('fileStamp (hora local)', () => {
  expect(fileStamp('2026-11-19T21:14:05')).toBe('2026-11-19_21-14');
});
