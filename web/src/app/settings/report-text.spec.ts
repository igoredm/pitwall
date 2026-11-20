// Textos de "Copiar como texto" / "Copiar para fórum" (Relatório do PC) e do Compartilhar (relatório de jogo)
import { describe, expect, test } from 'vitest';
import { DICTS } from '../i18n';
import type { Catalog, GameSession, MetricSetting, PcIncident } from '../models';
import { incidentText } from './pages/health/pc-view';
import { shareData, shareMarkdown, shareText } from './pages/sessions/share-card';

const pt = DICTS['pt-BR'];
const en = DICTS.en;

const cat = {
  version: '1.2.0',
  hardware: { gpu: 'NVIDIA GeForce RTX 3080', cpu: '12th Gen Intel Core i5-12600K', ramGb: 32, os: 'Windows 11 24H2', gpuDriver: '581.57' },
} as unknown as Catalog;
const settings = new Map<string, MetricSetting>([
  ['gpu.hotspot', { id: 'gpu.hotspot', enabled: true, order: 0, sparkline: false, warn: 90, crit: 100 }],
  ['gpu.temp', { id: 'gpu.temp', enabled: true, order: 1, sparkline: false, warn: 75, crit: 85 }],
]);

describe('relatório de jogo (Compartilhar)', () => {
  const x: GameSession = {
    exe: 'FC25.exe',
    start: '2026-11-19T21:00:02',
    durationSec: 5498,
    avgFps: 141.2,
    low1: 88.4,
    peakHotspot: 101.5,
    peakGpuTemp: 78,
    stutters: 17,
    gpu: 'NVIDIA GeForce RTX 3080',
    cpu: '12th Gen Intel Core i5-12600K',
    secondsAboveCrit: { 'gpu.hotspot': 75 },
  };

  test('dados formatados (linha sem dado = null)', () => {
    const v = shareData(x, pt, cat, settings, null);
    expect(v).toMatchObject({ game: 'FC25', dur: '1 h 31', avg: '141', low1: '88', low01: null, stutters: 17, perMin: '0,2', red: '1 min 15 s', version: '1.2.0' });
    expect(v.hw).toBe('RTX 3080 · i5-12600K · 32 GB');
    expect(v.peaks).toEqual([
      { key: 'hot', text: '102 °C', alert: true },
      { key: 'core', text: '78 °C', alert: true },
    ]);
  });

  test('texto simples', () => {
    const lines = shareText(shareData(x, en, cat, settings, null), en).split('\n');
    expect(lines[0]).toMatch(/^FC25 · .+ · 1 h 31$/);
    expect(lines).toContain('RTX 3080 · i5-12600K · 32 GB');
    expect(lines).toContain(`${en.rp.avgFps} 141 · ${en.rp.low1} 88`);
    expect(lines).toContain(en.rp.tStutters(17, '0.2'));
    expect(lines).toContain('Above your critical limit: 1 min 15 s (hot spot ≥ 100 °C)');
    expect(lines.at(-1)).toBe('Pitwall 1.2.0');
    expect(lines.join('\n')).not.toContain('**');
  });

  test('markdown: jogo em negrito, tabela alinhada à direita, primeiro pico em negrito', () => {
    const md = shareMarkdown(shareData(x, pt, cat, settings, null), pt).split('\n');
    expect(md[0]).toMatch(/^\*\*FC25\*\* · /);
    expect(md).toContain(`| ${pt.rp.avgFps} | ${pt.rp.low1} | ${pt.rp.stutters} |`);
    expect(md).toContain('|---:|---:|---:|');
    expect(md).toContain('| 141 | 88 | 17 |');
    expect(md).toContain(`${pt.rp.tPeaks}: ${pt.rp.tHot} **102 °C** · ${pt.rp.tCore} 78 °C`);
    expect(md.at(-1)).toBe(`${pt.rp.tRed}: 1 min 15 s (hot spot ≥ 100 °C) · *Pitwall 1.2.0*`);
    expect(pt.rp.tRed).toBe('Acima do limite crítico definido');
  });
});

describe('Relatório do PC (copiar)', () => {
  const inc: PcIncident = {
    id: '20261118-211405',
    kind: 'abruptShutdown',
    time: '2026-11-18T21:14:05',
    bootTime: '2026-11-18T21:16:02',
    exe: 'FC25.exe',
    sessionStart: '2026-11-18T20:34:05',
    uptimeSec: 10800,
    seen: false,
    intervalMs: 5000,
    series: { 'gpu.hotspot': [95, 99, 104], 'gpu.temp': [70, null, 74] },
    last: [
      { id: 'gpu.hotspot', name: 'Hot spot', group: 'gpu', value: 104, unit: '°C' },
      { id: 'cpu.clockAvg', name: 'Clock médio', group: 'cpu', value: 4450, unit: 'MHz' },
      { id: 'fps.current', name: 'FPS', group: 'fps', value: null, unit: 'fps' },
    ],
    events: [{ time: '2026-11-18T21:16:10', kind: 'kernelPower41', source: 'Microsoft-Windows-Kernel-Power', eventId: 41 }],
  } as PcIncident;

  test('texto simples', () => {
    const t = incidentText(inc, pt, cat, settings, false).split('\n');
    expect(t[0]).toBe(`${pt.rp.titleAbrupt('21:14', '18/11')} (18/11/2026)`);
    expect(t[1]).toBe(`${pt.rp.upFor('3 h 00 min')} · ${pt.rp.playing} FC25.exe ${pt.rp.matchFor('40 min')} · ${pt.rp.backAt('21:16')}`);
    expect(t[2]).toBe('RTX 3080 · driver 581.57 · i5-12600K · 32 GB · Windows 11 24H2');
    expect(t).toContain(pt.rp.txtLast2);
    expect(t).toContain(`${pt.rp.pcSeries['gpu.hotspot']}: ${pt.minMax('95', '104 °C')} · ${pt.rp.atEnd} 104 °C`);
    expect(t).toContain(`${pt.rp.colGpu}: Hot spot 104 °C`);
    expect(t).toContain(`${pt.rp.colCpuRam}: Clock médio 4,45 GHz`);
    expect(t).toContain(`${pt.rp.colFpsOther}: FPS ${pt.rp.noReading}`);
    expect(t.some((l) => l.startsWith('21:16:10 ') && l.includes('(Kernel-Power)'))).toBe(true);
    expect(t.at(-1)).toBe(`Pitwall 1.2.0 · ${pt.rp.txtHead}`);
    expect(t.join('\n')).not.toContain('**');
  });

  test('markdown (fórum): negrito, tabela de leituras, eventos com código', () => {
    const md = incidentText(inc, pt, cat, settings, true).split('\n');
    expect(md[0]).toMatch(/^\*\*.+\*\* \(18\/11\/2026\)$/);
    expect(md).toContain(`**${pt.rp.txtLast2}**`);
    expect(md).toContain(`| ${pt.rp.txtGroup} | ${pt.rp.txtSensor} | ${pt.rp.txtValue} |`);
    expect(md).toContain('|---|---|---:|');
    expect(md).toContain(`| ${pt.rp.colCpuRam} | Clock médio | 4,45 GHz |`);
    expect(md.some((l) => l.startsWith('- 21:16:10 · **') && l.includes('`Kernel-Power`'))).toBe(true);
    expect(md.at(-1)).toBe(`*Pitwall 1.2.0 · ${pt.rp.txtHead}*`);
  });

  test('sem séries, leituras nem eventos: só cabeçalho e rodapé', () => {
    const t = incidentText({ ...inc, series: {}, last: [], events: [], exe: undefined }, en, null, new Map(), false).split('\n');
    expect(t[1]).toContain(en.rp.outOfGame);
    expect(t).not.toContain(en.rp.txtLast2);
    expect(t).toHaveLength(4); // título, linha, vazio, rodapé (sem hardware)
  });
});
