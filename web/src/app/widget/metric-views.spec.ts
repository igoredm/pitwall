import { describe, expect, test } from 'vitest';
import type { AppConfig, MetricDef, MetricSetting } from '../models';
import { buildViews, formatValue, hasPeak, level, peakText, shortCpu, shortGpu, unitLabel } from './metric-views';

const def = (id: string, unit: string, extra: Partial<MetricDef> = {}): MetricDef => ({
  id,
  group: id.startsWith('cpu') ? 'cpu' : 'gpu',
  name: id,
  unit,
  isTemperature: unit === '°C',
  available: true,
  ...extra,
});

describe('level', () => {
  test('sem leitura = ok', () => expect(level(null, 70, 80)).toBe('ok'));
  test('limites inclusivos', () => {
    expect(level(69.9, 70, 80)).toBe('ok');
    expect(level(70, 70, 80)).toBe('warn');
    expect(level(80, 70, 80)).toBe('crit');
  });
  test('sem amarelo ou sem vermelho', () => {
    expect(level(90, null, 80)).toBe('crit');
    expect(level(90, 70, null)).toBe('warn');
    expect(level(90)).toBe('ok');
  });
});

describe('formatValue', () => {
  test.each([
    [null, '°C', '—'],
    [NaN, '°C', '—'],
    [Infinity, 'W', '—'],
    [71.6, '°C', '72'],
    [7.25, 'ms', '7.3'],
    [18.44, 'GB', '18.4'],
    [3.456, 'MB/s', '3.46'],
    [34.56, 'MB/s', '34.6'],
    [1.2345, 'V', '1.234'],
    [141.4, 'fps', '141'],
  ] as [number | null, string, string][])('%s %s → %s', (v, unit, want) => {
    expect(formatValue(v, unit)).toBe(want);
  });
});

test('unitLabel', () => {
  expect(unitLabel(def('gpu.temp', '°C'))).toBe('°C');
  expect(unitLabel(def('gpu.temp', '°C'), true)).toBe('°F');
  expect(unitLabel(def('fps.current', 'fps'))).toBe('');
  expect(unitLabel(def('gpu.perfcap', 'text'))).toBe('');
  expect(unitLabel(def('gpu.power', 'W'))).toBe('W');
});

test('hasPeak: temperaturas, W, MHz e fan', () => {
  expect(hasPeak(def('gpu.temp', '°C'))).toBe(true);
  expect(hasPeak(def('gpu.power', 'W'))).toBe(true);
  expect(hasPeak(def('gpu.clock', 'MHz'))).toBe(true);
  expect(hasPeak(def('gpu.fan', 'RPM'))).toBe(true);
  expect(hasPeak(def('gpu.load', '%'))).toBe(false);
});

test('shortGpu / shortCpu', () => {
  expect(shortGpu('NVIDIA GeForce RTX 3080')).toBe('RTX 3080');
  expect(shortGpu('NVIDIA GeForce RTX 4070 Ti Super')).toBe('RTX 4070 Ti');
  expect(shortGpu('AMD Radeon RX 7900 XTX')).toBe('RX 7900 XTX');
  expect(shortGpu(undefined)).toBe('GPU');
  expect(shortCpu('12th Gen Intel Core i5-12600K')).toBe('i5-12600K');
  expect(shortCpu('AMD Ryzen 7 5800X3D 8-Core Processor')).toBe('Ryzen 7 5800X3D');
  expect(shortCpu(undefined)).toBe('CPU');
});

describe('buildViews', () => {
  const defs = new Map([
    ['gpu.temp', def('gpu.temp', '°C')],
    ['gpu.load', def('gpu.load', '%')],
    ['gpu.power', def('gpu.power', 'W', { available: false })],
    ['cpu.temp', def('cpu.temp', '°C')],
  ]);
  const setting = (id: string, order: number, extra: Partial<MetricSetting> = {}): MetricSetting => ({
    id,
    enabled: true,
    order,
    sparkline: false,
    ...extra,
  });
  const config = {
    metrics: [
      setting('gpu.load', 2),
      setting('gpu.temp', 1, { unit: 'F', warn: 75, crit: 85, sparkline: true, label: 'Núcleo' }),
      setting('gpu.power', 3),
      setting('cpu.temp', 0),
    ],
  } as unknown as AppConfig;

  test('ordem configurada, só o grupo pedido, sem indisponíveis', () => {
    const views = buildViews(config, defs, { 'gpu.temp': 80, 'gpu.load': 97 }, 'gpu');
    expect(views.map((v) => v.id)).toEqual(['gpu.temp', 'gpu.load']);
  });

  test('Fahrenheit no texto, nível pelo valor em °C, pico só com extremes', () => {
    const [temp, load] = buildViews(config, defs, { 'gpu.temp': 80, 'gpu.load': 97 }, 'gpu', { 'gpu.temp': [40, 90], 'gpu.load': [0, 100] });
    expect(temp).toMatchObject({ label: 'Núcleo', text: '176', unit: '°F', level: 'warn', sparkline: true });
    expect(temp.peak).toEqual({ text: '194', level: 'crit' });
    expect(peakText(temp)).toBe('194 °F'); // espaço sem quebra
    expect(load.peak).toBeNull(); // uso (%) não tem pico
    expect(buildViews(config, defs, {}, 'gpu')[0]).toMatchObject({ value: null, text: '—', level: 'ok', peak: null });
  });
});
